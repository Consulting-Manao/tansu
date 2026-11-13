use super::test_utils::{create_test_data, init_contract, scalars};
use crate::contract_dao::{MAX_DEFAULT_WEIGHT_VOTES, MAX_VOTES_PER_PROPOSAL};
use crate::events::{
    AnonymousVotingSetup, ProposalCreated, ProposalExecuted, ProposalVetoed, VoteCast,
};
use crate::{
    errors::ContractErrors,
    types::{
        AnonymousVote, Badge, Dao, OutcomeContract, ProjectKey, ProposalStatus, PublicVote,
        TIMELOCK_DELAY, Vote, VoteChoice,
    },
};
use soroban_sdk::testutils::{Address as _, Events, Ledger, storage::Temporary as _};
use soroban_sdk::{
    Address, BytesN, Env, Event, IntoVal, String, Symbol, U256, contract, contractimpl, token, vec,
};

#[contract]
pub struct TestOutcomeContract;

#[contractimpl]
impl TestOutcomeContract {
    pub fn execute_approve(_env: Env, maintainer: Address, _value: u32) {
        maintainer.require_auth();
    }

    pub fn execute_reject(_env: Env, _maintainer: Address, _value: u32) {}
}

#[test]
fn proposal_flow() {
    let setup = create_test_data();
    let id = init_contract(&setup);

    let title = String::from_str(&setup.env, "Integrate with xlm.sh");
    let ipfs = String::from_str(
        &setup.env,
        "bafybeib6ioupho3p3pliusx7tgs7dvi6mpu2bwfhayj6w6ie44lo3vvc4i",
    );
    let voting_ends_at = setup.env.ledger().timestamp() + 3600 * 24 * 2;

    let balance_proposer_init = setup.token_stellar.balance(&setup.grogu);
    let balance_voter_init = setup.token_stellar.balance(&setup.mando);

    let proposal_id = setup.contract.create_proposal(
        &setup.grogu,
        &id,
        &title,
        &ipfs,
        &voting_ends_at,
        &true,
        &None,
        &None,
    );

    // Verify proposal creation event
    let event = ProposalCreated {
        project_key: id.clone(),
        proposal_id,
        title: title.clone(),
        proposer: setup.grogu.clone(),
        voting_ends_at,
        public_voting: true,
        token_contract: None,
        execute_delay: TIMELOCK_DELAY,
    };

    let contract_events = setup
        .env
        .events()
        .all()
        .filter_by_contract(&setup.contract_id);

    assert_eq!(
        contract_events,
        [event.to_xdr(&setup.env, &setup.contract_id)]
    );

    let balance_proposer_ = setup.token_stellar.balance(&setup.grogu);
    assert!(balance_proposer_init > balance_proposer_);

    setup.contract.vote(
        &setup.mando,
        &id,
        &proposal_id,
        &Vote::PublicVote(PublicVote {
            address: setup.mando.clone(),
            weight: 1,
            vote_choice: VoteChoice::Approve,
        }),
    );

    // Verify vote cast event
    let event = VoteCast {
        project_key: id.clone(),
        proposal_id,
        voter: setup.mando.clone(),
    };

    let contract_events = setup
        .env
        .events()
        .all()
        .filter_by_contract(&setup.contract_id);
    assert_eq!(
        contract_events,
        [event.to_xdr(&setup.env, &setup.contract_id)]
    );

    let balance_voter_ = setup.token_stellar.balance(&setup.mando);
    assert_eq!(balance_voter_init, balance_voter_);

    setup
        .env
        .ledger()
        .set_timestamp(voting_ends_at + TIMELOCK_DELAY + 1);
    let result = setup
        .contract
        .execute(&setup.mando, &id, &proposal_id, &None, &None);

    // Verify proposal executed event
    let event = ProposalExecuted {
        project_key: id.clone(),
        proposal_id,
        status: String::from_str(&setup.env, "Approved"),
        maintainer: setup.mando.clone(),
    };

    let contract_events = setup
        .env
        .events()
        .all()
        .filter_by_contract(&setup.contract_id);

    assert_eq!(
        contract_events,
        [event.to_xdr(&setup.env, &setup.contract_id)]
    );

    assert_eq!(result, ProposalStatus::Approved);

    let balance_proposer_ = setup.token_stellar.balance(&setup.grogu);
    assert_eq!(balance_proposer_init, balance_proposer_);

    let balance_voter_ = setup.token_stellar.balance(&setup.mando);
    assert_eq!(balance_voter_init, balance_voter_);
}

#[test]
fn scf_voting() {
    let setup = create_test_data();
    init_contract(&setup);

    // Stellarpg project for SCF voting
    let name = String::from_str(&setup.env, "stellarpg");
    let url = String::from_str(&setup.env, "github.com/tansu");
    let ipfs = String::from_str(&setup.env, "2ef4f49fdd8fa9dc463f1f06a094c26b88710990");
    let maintainers = vec![&setup.env, setup.grogu.clone(), setup.mando.clone()];
    let id = setup.contract.register(
        &setup.grogu,
        &name,
        &maintainers,
        &url,
        &ipfs,
        &None,
        &None,
        &None,
    );
    super::test_utils::set_nqg(&setup, &id);

    let title = String::from_str(&setup.env, "A SCF proposal");
    let ipfs = String::from_str(
        &setup.env,
        "bafybeib6ioupho3p3pliusx7tgs7dvi6mpu2bwfhayj6w6ie44lo3vvc4i",
    );
    let voting_ends_at = setup.env.ledger().timestamp() + 3600 * 24 * 2;
    let proposal_id = setup.contract.create_proposal(
        &setup.grogu,
        &id,
        &title,
        &ipfs,
        &voting_ends_at,
        &true,
        &None,
        &None,
    );

    setup.contract.vote(
        &setup.mando,
        &id,
        &proposal_id,
        &Vote::PublicVote(PublicVote {
            address: setup.mando.clone(),
            weight: 10_000_000,
            vote_choice: VoteChoice::Approve,
        }),
    );

    setup
        .env
        .ledger()
        .set_timestamp(voting_ends_at + TIMELOCK_DELAY + 1);
    let result = setup
        .contract
        .execute(&setup.mando, &id, &proposal_id, &None, &None);

    assert_eq!(result, ProposalStatus::Approved);
}

#[test]
fn dao_basic_functionality() {
    let setup = create_test_data();
    let id = init_contract(&setup);

    // Test empty DAO initially
    let dao = setup.contract.get_dao(&id, &0);
    assert_eq!(
        dao,
        Dao {
            proposals: vec![&setup.env]
        }
    );

    let title = String::from_str(&setup.env, "Integrate with xlm.sh");
    let ipfs = String::from_str(
        &setup.env,
        "bafybeib6ioupho3p3pliusx7tgs7dvi6mpu2bwfhayj6w6ie44lo3vvc4i",
    );
    let voting_ends_at = setup.env.ledger().timestamp() + 3600 * 24 * 2;

    let proposal_id = setup.contract.create_proposal(
        &setup.grogu,
        &id,
        &title,
        &ipfs,
        &voting_ends_at,
        &true,
        &None,
        &None,
    );
    assert_eq!(proposal_id, 0);

    let proposal = setup.contract.get_proposal(&id, &proposal_id);
    assert_eq!(proposal.id, 0);
    assert_eq!(proposal.title, title);
    assert_eq!(proposal.ipfs, ipfs);
    assert_eq!(proposal.vote_data.voting_ends_at, voting_ends_at);

    let dao = setup.contract.get_dao(&id, &0);
    assert_eq!(dao.proposals.len(), 1);
    let mut expected_stored = proposal.clone();
    expected_stored.vote_data.votes = vec![&setup.env];
    assert_eq!(dao.proposals.get(0), Some(expected_stored));
}

#[test]
fn dao_anonymous() {
    let setup = create_test_data();
    let id = init_contract(&setup);

    let title = String::from_str(&setup.env, "Integrate with xlm.sh");
    let ipfs = String::from_str(
        &setup.env,
        "bafybeib6ioupho3p3pliusx7tgs7dvi6mpu2bwfhayj6w6ie44lo3vvc4i",
    );
    let voting_ends_at = setup.env.ledger().timestamp() + 3600 * 24 * 2;

    let public_key = String::from_str(&setup.env, "public key random");
    setup
        .contract
        .anonymous_voting_setup(&setup.mando, &id, &public_key);

    let event = AnonymousVotingSetup {
        project_key: id.clone(),
        maintainer: setup.mando.clone(),
        public_key: public_key.clone(),
    };

    let all_events = setup
        .env
        .events()
        .all()
        .filter_by_contract(&setup.contract_id);
    assert_eq!(all_events, [event.to_xdr(&setup.env, &setup.contract_id)]);

    // Add a member with elevated rights
    let kuiil = Address::generate(&setup.env);
    setup.token_stellar.mint(&kuiil, &(10 * 10_000_000));
    let meta = String::from_str(&setup.env, "abcd");
    setup
        .contract
        .add_member(&kuiil, &meta, &None, &None, &None);
    let badges = vec![&setup.env, Badge::Community];
    setup
        .contract
        .set_badges(&setup.mando, &id, &kuiil, &badges);

    let proposal_id = setup.contract.create_proposal(
        &setup.grogu,
        &id,
        &title,
        &ipfs,
        &voting_ends_at,
        &false,
        &None,
        &None,
    );
    assert_eq!(proposal_id, 0);

    let proposal = setup.contract.get_proposal(&id, &proposal_id);

    // test build_commitments_from_votes and abstain
    let abstain_vote = Vote::AnonymousVote(AnonymousVote {
        address: setup.grogu.clone(),
        weight: 0u32,
        encrypted_seeds: vec![
            &setup.env,
            String::from_str(&setup.env, "0"),
            String::from_str(&setup.env, "0"),
            String::from_str(&setup.env, "0"),
        ],
        encrypted_votes: vec![
            &setup.env,
            String::from_str(&setup.env, "0"),
            String::from_str(&setup.env, "0"),
            String::from_str(&setup.env, "1"),
        ],
        commitments: setup.contract.build_commitments_from_votes(
            &id,
            &vec![&setup.env, 0u128, 0u128, 1u128],
            &scalars(&setup.env, &[0, 0, 0]),
        ),
    });

    assert_eq!(
        proposal.vote_data.votes,
        vec![&setup.env, abstain_vote.clone()]
    );

    let vote_ = Vote::AnonymousVote(AnonymousVote {
        address: kuiil.clone(),
        weight: 3,
        encrypted_seeds: vec![
            &setup.env,
            String::from_str(&setup.env, "fafdas"),
            String::from_str(&setup.env, "fafdas"),
            String::from_str(&setup.env, "fafdas"),
        ],
        encrypted_votes: vec![
            &setup.env,
            String::from_str(&setup.env, "fafdas"),
            String::from_str(&setup.env, "fafdas"),
            String::from_str(&setup.env, "rewrewr"),
        ],
        commitments: setup.contract.build_commitments_from_votes(
            &id,
            &vec![&setup.env, 3u128, 1u128, 1u128],
            &scalars(&setup.env, &[5, 4, 6]),
        ),
    });
    setup.contract.vote(&kuiil, &id, &proposal_id, &vote_);

    setup
        .env
        .ledger()
        .set_timestamp(voting_ends_at + TIMELOCK_DELAY + 1);

    let vote_result = setup.contract.execute(
        &setup.grogu,
        &id,
        &proposal_id,
        &Some(vec![&setup.env, 9u128, 3u128, 3u128]),
        &Some(scalars(&setup.env, &[15, 12, 18])),
    );

    assert_eq!(vote_result, ProposalStatus::Approved);
}

#[test]
fn voting_errors() {
    let setup = create_test_data();
    let id = init_contract(&setup);

    let title = String::from_str(&setup.env, "Test Proposal");
    let ipfs = String::from_str(
        &setup.env,
        "bafybeib6ioupho3p3pliusx7tgs7dvi6mpu2bwfhayj6w6ie44lo3vvc4i",
    );
    let voting_ends_at = setup.env.ledger().timestamp() + 3600 * 24 * 2;

    let proposal_id = setup.contract.create_proposal(
        &setup.grogu,
        &id,
        &title,
        &ipfs,
        &voting_ends_at,
        &true,
        &None,
        &None,
    );

    // Start testing bad behaviours

    // Not initialized private voting
    let error = setup
        .contract
        .try_create_proposal(
            &setup.grogu,
            &id,
            &title,
            &ipfs,
            &voting_ends_at,
            &false,
            &None,
            &None,
        )
        .unwrap_err()
        .unwrap();
    assert_eq!(error, ContractErrors::NoAnonymousVotingConfig.into());

    let public_key = String::from_str(&setup.env, "public key random");
    setup
        .contract
        .anonymous_voting_setup(&setup.mando, &id, &public_key);

    let proposal_id_anonymous = setup.contract.create_proposal(
        &setup.grogu,
        &id,
        &title,
        &ipfs,
        &voting_ends_at,
        &false,
        &None,
        &None,
    );

    // Wrong vote type anonymous vs public
    let err = setup
        .contract
        .try_vote(
            &setup.mando,
            &id,
            &proposal_id_anonymous,
            &Vote::PublicVote(PublicVote {
                address: setup.mando.clone(),
                weight: 1,
                vote_choice: VoteChoice::Approve,
            }),
        )
        .unwrap_err()
        .unwrap();
    assert_eq!(err, ContractErrors::WrongVoteType.into());

    // Cannot vote for your own proposal (creator automatically abstains)
    let err = setup
        .contract
        .try_vote(
            &setup.grogu,
            &id,
            &proposal_id,
            &Vote::PublicVote(PublicVote {
                address: setup.grogu.clone(),
                weight: 1,
                vote_choice: VoteChoice::Approve,
            }),
        )
        .unwrap_err()
        .unwrap();
    assert_eq!(err, ContractErrors::AlreadyVoted.into());

    // Sending wrong commitments
    let error = setup
        .contract
        .try_vote(
            &setup.mando,
            &id,
            &proposal_id_anonymous,
            &Vote::AnonymousVote(AnonymousVote {
                address: setup.mando.clone(),
                weight: 0u32,
                encrypted_seeds: vec![&setup.env, String::from_str(&setup.env, "abcd")],
                encrypted_votes: vec![&setup.env, String::from_str(&setup.env, "fsfds")],
                commitments: vec![
                    &setup.env,
                    BytesN::from_array(&setup.env, &[0; 96]),
                    BytesN::from_array(&setup.env, &[0; 96]),
                ],
            }),
        )
        .unwrap_err()
        .unwrap();
    assert_eq!(error, ContractErrors::BadCommitment.into());

    // Vote successfully with another user
    setup.contract.vote(
        &setup.mando,
        &id,
        &proposal_id,
        &Vote::PublicVote(PublicVote {
            address: setup.mando.clone(),
            weight: 1,
            vote_choice: VoteChoice::Approve,
        }),
    );

    // Cannot vote twice
    let err = setup
        .contract
        .try_vote(
            &setup.mando,
            &id,
            &proposal_id,
            &Vote::PublicVote(PublicVote {
                address: setup.mando.clone(),
                weight: 1,
                vote_choice: VoteChoice::Approve,
            }),
        )
        .unwrap_err()
        .unwrap();
    assert_eq!(err, ContractErrors::AlreadyVoted.into());

    // Cannot vote for someone else
    let kuiil = Address::generate(&setup.env);
    let meta = String::from_str(&setup.env, "test");
    setup
        .contract
        .add_member(&kuiil, &meta, &None, &None, &None);

    let err = setup
        .contract
        .try_vote(
            &kuiil,
            &id,
            &proposal_id,
            &Vote::PublicVote(PublicVote {
                address: setup.mando.clone(),
                weight: 1,
                vote_choice: VoteChoice::Approve,
            }),
        )
        .unwrap_err()
        .unwrap();
    assert_eq!(err, ContractErrors::WrongVoter.into());

    // Non-existent proposal
    let err = setup
        .contract
        .try_get_proposal(&id, &10)
        .unwrap_err()
        .unwrap();
    assert_eq!(err, ContractErrors::NoProposalorPageFound.into());

    // Too early to execute
    let err = setup
        .contract
        .try_execute(&setup.mando, &id, &proposal_id, &None, &None)
        .unwrap_err()
        .unwrap();
    assert_eq!(err, ContractErrors::ProposalVotingTime.into());

    // advance time to allow execution
    setup
        .env
        .ledger()
        .set_timestamp(voting_ends_at + TIMELOCK_DELAY + 1);

    // Using args for anonymous voting in public votes. And the other way
    let err = setup
        .contract
        .try_execute(
            &setup.mando,
            &id,
            &proposal_id,
            &Some(vec![&setup.env, 9u128, 3u128, 500003u128]),
            &None,
        )
        .unwrap_err()
        .unwrap();
    assert_eq!(err, ContractErrors::TallySeedError.into());

    let err = setup
        .contract
        .try_execute(&setup.mando, &id, &proposal_id_anonymous, &None, &None)
        .unwrap_err()
        .unwrap();
    assert_eq!(err, ContractErrors::TallySeedError.into());

    // Wrong tallies for proof
    let err = setup
        .contract
        .try_execute(
            &setup.grogu,
            &id,
            &proposal_id_anonymous,
            &Some(vec![&setup.env, 0u128, 0u128, 500_001u128]), // 500_000u128
            &Some(scalars(&setup.env, &[0, 0, 0])),
        )
        .unwrap_err()
        .unwrap();
    assert_eq!(err, ContractErrors::InvalidProof.into());

    // Execute proposal for real
    setup
        .contract
        .execute(&setup.mando, &id, &proposal_id, &None, &None);

    // Already executed
    let err = setup
        .contract
        .try_execute(&setup.mando, &id, &proposal_id, &None, &None)
        .unwrap_err()
        .unwrap();
    assert_eq!(err, ContractErrors::ProposalActive.into());
}

#[test]
fn proposal_execution() {
    let setup = create_test_data();
    let id = init_contract(&setup);

    setup.env.ledger().set_timestamp(1234567890);
    let voting_ends_at = 1234567890 + 3600 * 24 * 2;

    let title = String::from_str(&setup.env, "Test Proposal");
    let ipfs = String::from_str(
        &setup.env,
        "bafybeib6ioupho3p3pliusx7tgs7dvi6mpu2bwfhayj6w6ie44lo3vvc4i",
    );

    let proposal_id = setup.contract.create_proposal(
        &setup.grogu,
        &id,
        &title,
        &ipfs,
        &voting_ends_at,
        &true,
        &None,
        &None,
    );

    // Add member with badge
    let kuiil = Address::generate(&setup.env);
    setup.token_stellar.mint(&kuiil, &(10 * 10_000_000));
    let meta = String::from_str(&setup.env, "test");
    setup
        .contract
        .add_member(&kuiil, &meta, &None, &None, &None);
    let badges = vec![&setup.env, Badge::Community];
    setup
        .contract
        .set_badges(&setup.mando, &id, &kuiil, &badges);

    setup.contract.vote(
        &setup.mando,
        &id,
        &proposal_id,
        &Vote::PublicVote(PublicVote {
            address: setup.mando.clone(),
            weight: 1,
            vote_choice: VoteChoice::Approve,
        }),
    );

    setup.contract.vote(
        &kuiil,
        &id,
        &proposal_id,
        &Vote::PublicVote(PublicVote {
            address: kuiil.clone(),
            weight: Badge::Community as u32,
            vote_choice: VoteChoice::Approve,
        }),
    );

    setup
        .env
        .ledger()
        .set_timestamp(voting_ends_at + TIMELOCK_DELAY + 1);

    let vote_result = setup
        .contract
        .execute(&setup.mando, &id, &proposal_id, &None, &None);
    assert_eq!(vote_result, ProposalStatus::Approved);

    let proposal = setup.contract.get_proposal(&id, &proposal_id);
    assert_eq!(proposal.status, ProposalStatus::Approved);
}

#[test]
fn proposal_revoke() {
    let setup = create_test_data();
    let id = init_contract(&setup);

    setup.env.ledger().set_timestamp(1234567890);
    let voting_ends_at = 1234567890 + 3600 * 24 * 2;

    let title = String::from_str(&setup.env, "Test Proposal");
    let ipfs = String::from_str(
        &setup.env,
        "bafybeib6ioupho3p3pliusx7tgs7dvi6mpu2bwfhayj6w6ie44lo3vvc4i",
    );

    let proposal_id = setup.contract.create_proposal(
        &setup.grogu,
        &id,
        &title,
        &ipfs,
        &voting_ends_at,
        &true,
        &None,
        &None,
    );

    let kuiil = Address::generate(&setup.env);
    let err = setup
        .contract
        .try_revoke_proposal(&kuiil, &id, &proposal_id)
        .unwrap_err()
        .unwrap();
    assert_eq!(err, ContractErrors::UnauthorizedSigner.into());

    setup
        .contract
        .revoke_proposal(&setup.mando, &id, &proposal_id);

    let event = ProposalExecuted {
        project_key: id.clone(),
        proposal_id,
        status: String::from_str(&setup.env, "Malicious"),
        maintainer: setup.mando.clone(),
    };

    let all_events = setup
        .env
        .events()
        .all()
        .filter_by_contract(&setup.contract_id);
    assert_eq!(all_events, [event.to_xdr(&setup.env, &setup.contract_id)]);

    // the proposal is deleted; the proposer's ballot is left to expire
    let err = setup
        .contract
        .try_get_proposal(&id, &proposal_id)
        .unwrap_err()
        .unwrap();
    assert_eq!(err, ContractErrors::NoProposalorPageFound.into());
    assert_eq!(setup.contract.get_dao(&id, &0).proposals.len(), 0);
    let ballot = ProjectKey::Vote(id.clone(), proposal_id, setup.grogu.clone());
    setup.env.as_contract(&setup.contract_id, || {
        assert!(setup.env.storage().temporary().has(&ballot));
        assert!(
            !setup
                .env
                .storage()
                .persistent()
                .has(&ProjectKey::Voters(id.clone(), proposal_id))
        );
    });

    // already revoked and also try to call as an admin should go through the
    // auth part and fail later
    let err = setup
        .contract
        .try_revoke_proposal(&setup.contract_admin, &id, &proposal_id)
        .unwrap_err()
        .unwrap();
    assert_eq!(err, ContractErrors::NoProposalorPageFound.into());

    // ids keep counting up after a revoke
    let next_id = setup.contract.create_proposal(
        &setup.grogu,
        &id,
        &title,
        &ipfs,
        &voting_ends_at,
        &true,
        &None,
        &None,
    );
    assert_eq!(next_id, proposal_id + 1);
    let page = setup.contract.get_dao(&id, &0);
    assert_eq!(page.proposals.len(), 1);
    assert_eq!(page.proposals.get(0).unwrap().id, next_id);
}

#[test]
fn veto_rejects_whatever_the_votes_are() {
    let setup = create_test_data();
    let id = init_contract(&setup);
    let outcome_contract_id = setup.env.register(TestOutcomeContract, ());

    setup.env.ledger().set_timestamp(1234567890);
    let voting_ends_at = 1234567890 + 3600 * 24 * 2;
    let title = String::from_str(&setup.env, "Test Proposal");
    let ipfs = String::from_str(
        &setup.env,
        "bafybeib6ioupho3p3pliusx7tgs7dvi6mpu2bwfhayj6w6ie44lo3vvc4i",
    );
    let outcome = |function: &str| OutcomeContract {
        address: outcome_contract_id.clone(),
        execute_fn: Symbol::new(&setup.env, function),
        args: vec![
            &setup.env,
            setup.mando.clone().into_val(&setup.env),
            100u32.into_val(&setup.env),
        ],
    };
    let outcomes = vec![
        &setup.env,
        outcome("execute_approve"),
        outcome("execute_reject"),
    ];

    let balance_before = setup.token_stellar.balance(&setup.grogu);
    let proposal_id = setup.contract.create_proposal(
        &setup.grogu,
        &id,
        &title,
        &ipfs,
        &voting_ends_at,
        &true,
        &None,
        &Some(outcomes),
    );
    assert!(setup.token_stellar.balance(&setup.grogu) < balance_before);

    // an approving majority
    setup.contract.vote(
        &setup.mando,
        &id,
        &proposal_id,
        &Vote::PublicVote(PublicVote {
            address: setup.mando.clone(),
            weight: 1,
            vote_choice: VoteChoice::Approve,
        }),
    );

    // only a maintainer vetoes, with a reason that is a content identifier
    let reason = String::from_str(
        &setup.env,
        "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
    );
    let kuiil = Address::generate(&setup.env);
    let err = setup
        .contract
        .try_veto(&kuiil, &id, &proposal_id, &reason)
        .unwrap_err()
        .unwrap();
    assert_eq!(err, ContractErrors::UnauthorizedSigner.into());
    let err = setup
        .contract
        .try_veto(
            &setup.mando,
            &id,
            &proposal_id,
            &String::from_str(&setup.env, "short"),
        )
        .unwrap_err()
        .unwrap();
    assert_eq!(err, ContractErrors::ProposalInputValidation.into());

    // the execute delay is still running: the veto lands before any execute
    setup.env.ledger().set_timestamp(voting_ends_at + 1);
    setup
        .contract
        .veto(&setup.mando, &id, &proposal_id, &reason);

    let event = ProposalVetoed {
        project_key: id.clone(),
        proposal_id,
        maintainer: setup.mando.clone(),
        reason: reason.clone(),
    };
    let all_events = setup
        .env
        .events()
        .all()
        .filter_by_contract(&setup.contract_id);
    assert_eq!(all_events, [event.to_xdr(&setup.env, &setup.contract_id)]);

    // the proposal stays readable, and the deposit is repaid
    let proposal = setup.contract.get_proposal(&id, &proposal_id);
    assert_eq!(proposal.status, ProposalStatus::Vetoed);
    assert_eq!(setup.token_stellar.balance(&setup.grogu), balance_before);

    // who, why and when stay on the ledger, beyond what an event lasts
    let veto = setup.contract.get_veto(&id, &proposal_id);
    assert_eq!(veto.maintainer, setup.mando);
    assert_eq!(veto.reason, reason);
    assert_eq!(veto.vetoed_at, voting_ends_at + 1);
    let err = setup
        .contract
        .try_get_veto(&id, &(proposal_id + 1))
        .unwrap_err()
        .unwrap();
    assert_eq!(err, ContractErrors::NoProposalorPageFound.into());

    // nothing leads from a veto to an execution, a vote or a second veto
    setup
        .env
        .ledger()
        .set_timestamp(voting_ends_at + TIMELOCK_DELAY + 1);
    let err = setup
        .contract
        .try_execute(&setup.mando, &id, &proposal_id, &None, &None)
        .unwrap_err()
        .unwrap();
    assert_eq!(err, ContractErrors::ProposalActive.into());
    let err = setup
        .contract
        .try_veto(&setup.grogu, &id, &proposal_id, &reason)
        .unwrap_err()
        .unwrap();
    assert_eq!(err, ContractErrors::ProposalActive.into());
    let err = setup
        .contract
        .try_remove_vote(&setup.grogu, &id, &proposal_id, &setup.mando)
        .unwrap_err()
        .unwrap();
    assert_eq!(err, ContractErrors::ProposalActive.into());
}

#[test]
fn veto_needs_no_tally_and_not_a_finished_proposal() {
    let setup = create_test_data();
    let id = init_contract(&setup);
    setup.contract.anonymous_voting_setup(
        &setup.mando,
        &id,
        &String::from_str(&setup.env, "public key"),
    );

    let voting_ends_at = setup.env.ledger().timestamp() + 3600 * 24 * 2;
    let ipfs = String::from_str(
        &setup.env,
        "bafybeib6ioupho3p3pliusx7tgs7dvi6mpu2bwfhayj6w6ie44lo3vvc4i",
    );
    let anonymous = setup.contract.create_proposal(
        &setup.grogu,
        &id,
        &String::from_str(&setup.env, "Anonymous"),
        &ipfs,
        &voting_ends_at,
        &false,
        &None,
        &None,
    );
    let public = setup.contract.create_proposal(
        &setup.grogu,
        &id,
        &String::from_str(&setup.env, "Public"),
        &ipfs,
        &voting_ends_at,
        &true,
        &None,
        &None,
    );

    // an anonymous proposal is vetoed without a proof
    setup.contract.veto(&setup.grogu, &id, &anonymous, &ipfs);
    assert_eq!(
        setup.contract.get_proposal(&id, &anonymous).status,
        ProposalStatus::Vetoed
    );

    // a proposal that was executed is out of reach
    setup
        .env
        .ledger()
        .set_timestamp(voting_ends_at + TIMELOCK_DELAY + 1);
    setup
        .contract
        .execute(&setup.mando, &id, &public, &None, &None);
    let err = setup
        .contract
        .try_veto(&setup.mando, &id, &public, &ipfs)
        .unwrap_err()
        .unwrap();
    assert_eq!(err, ContractErrors::ProposalActive.into());
}

#[test]
fn proposal_ids_have_no_cap() {
    let setup = create_test_data();
    let id = init_contract(&setup);
    setup.env.ledger().set_timestamp(1234567890);

    // As if 9,000 proposals had been created: the old cap.
    setup.env.as_contract(&setup.contract_id, || {
        setup
            .env
            .storage()
            .persistent()
            .set(&ProjectKey::DaoTotalProposals(id.clone()), &9000u32);
    });
    let proposal_id = setup.contract.create_proposal(
        &setup.grogu,
        &id,
        &String::from_str(&setup.env, "Past the old cap"),
        &String::from_str(
            &setup.env,
            "bafybeib6ioupho3p3pliusx7tgs7dvi6mpu2bwfhayj6w6ie44lo3vvc4i",
        ),
        &(1234567890 + 3600 * 24 * 2),
        &true,
        &None,
        &None,
    );
    assert_eq!(proposal_id, 9000);
    let page = setup.contract.get_dao(&id, &1000);
    assert_eq!(page.proposals.len(), 1);
    assert_eq!(page.proposals.get(0).unwrap().id, 9000);
    assert_eq!(setup.contract.get_dao(&id, &1001).proposals.len(), 0);
}

#[test]
fn voter_weight_validation() {
    let setup = create_test_data();
    let id = init_contract(&setup);

    setup.env.ledger().set_timestamp(1234567890);
    let voting_ends_at = 1234567890 + 3600 * 24 * 2;

    let title = String::from_str(&setup.env, "Test Proposal");
    let ipfs = String::from_str(
        &setup.env,
        "bafybeib6ioupho3p3pliusx7tgs7dvi6mpu2bwfhayj6w6ie44lo3vvc4i",
    );

    let proposal_id = setup.contract.create_proposal(
        &setup.mando,
        &id,
        &title,
        &ipfs,
        &voting_ends_at,
        &true,
        &None,
        &None,
    );

    let kuiil = Address::generate(&setup.env);
    setup.token_stellar.mint(&kuiil, &(10 * 10_000_000));
    let meta = String::from_str(&setup.env, "test");
    setup
        .contract
        .add_member(&kuiil, &meta, &None, &None, &None);

    // Cannot vote with weight higher than max allowed
    let err = setup
        .contract
        .try_vote(
            &kuiil,
            &id,
            &proposal_id,
            &Vote::PublicVote(PublicVote {
                address: kuiil.clone(),
                weight: u32::MAX,
                vote_choice: VoteChoice::Approve,
            }),
        )
        .unwrap_err()
        .unwrap();
    assert_eq!(err, ContractErrors::VoterWeight.into());

    // Add developer badge and test reduced weight voting
    let badges = vec![&setup.env, Badge::Developer, Badge::Community];
    setup
        .contract
        .set_badges(&setup.mando, &id, &kuiil, &badges);

    let max_weight = setup.contract.get_max_weight(&id, &kuiil);
    assert_eq!(max_weight, 11_000_000u32);

    // Vote with reduced weight (should work)
    setup.contract.vote(
        &kuiil,
        &id,
        &proposal_id,
        &Vote::PublicVote(PublicVote {
            address: kuiil.clone(),
            weight: 42, // kuiil has up to 11M
            vote_choice: VoteChoice::Approve,
        }),
    );

    let proposal = setup.contract.get_proposal(&id, &proposal_id);
    let votes = &proposal.vote_data.votes;

    // Find kuiil's vote
    let kuiil_vote = votes.iter().find(|vote| {
        if let Vote::PublicVote(public_vote) = vote {
            public_vote.address == kuiil
        } else {
            false
        }
    });

    assert!(kuiil_vote.is_some());
    if let Some(Vote::PublicVote(public_vote)) = kuiil_vote {
        assert_eq!(public_vote.weight, 42);
        assert_eq!(public_vote.vote_choice, VoteChoice::Approve);
    }
}

#[test]
fn outcomes_execution() {
    let setup = create_test_data();
    let id = init_contract(&setup);

    // Register a simple test outcome contract
    let outcome_contract_id = setup.env.register(TestOutcomeContract, ());

    setup.env.ledger().set_timestamp(1234567890);
    let voting_ends_at = 1234567890 + 3600 * 24 * 2;

    let title = String::from_str(&setup.env, "Test Proposal");
    let ipfs = String::from_str(
        &setup.env,
        "bafybeib6ioupho3p3pliusx7tgs7dvi6mpu2bwfhayj6w6ie44lo3vvc4i",
    );

    // Create outcome contracts with approve and reject functions
    let approve_outcome = OutcomeContract {
        address: outcome_contract_id.clone(),
        execute_fn: Symbol::new(&setup.env, "execute_approve"),
        args: vec![
            &setup.env,
            setup.mando.clone().into_val(&setup.env),
            100u32.into_val(&setup.env),
        ],
    };

    let reject_outcome = OutcomeContract {
        address: outcome_contract_id.clone(),
        execute_fn: Symbol::new(&setup.env, "execute_reject"),
        args: vec![
            &setup.env,
            setup.mando.clone().into_val(&setup.env),
            200u32.into_val(&setup.env),
        ],
    };

    let outcome_contracts = vec![
        &setup.env,
        approve_outcome,
        reject_outcome,
        OutcomeContract {
            address: Address::generate(&setup.env), // dummy for abstain
            execute_fn: Symbol::new(&setup.env, "dummy"),
            args: vec![&setup.env],
        },
    ];

    let proposal_id = setup.contract.create_proposal(
        &setup.grogu,
        &id,
        &title,
        &ipfs,
        &voting_ends_at,
        &true,
        &None,
        &Some(outcome_contracts),
    );

    // Add member with badge
    let kuiil = Address::generate(&setup.env);
    setup.token_stellar.mint(&kuiil, &(10 * 10_000_000));
    let meta = String::from_str(&setup.env, "test");
    setup
        .contract
        .add_member(&kuiil, &meta, &None, &None, &None);
    let badges = vec![&setup.env, Badge::Community];
    setup
        .contract
        .set_badges(&setup.mando, &id, &kuiil, &badges);

    setup.contract.vote(
        &setup.mando,
        &id,
        &proposal_id,
        &Vote::PublicVote(PublicVote {
            address: setup.mando.clone(),
            weight: 1,
            vote_choice: VoteChoice::Approve,
        }),
    );

    setup.contract.vote(
        &kuiil,
        &id,
        &proposal_id,
        &Vote::PublicVote(PublicVote {
            address: kuiil.clone(),
            weight: Badge::Community as u32,
            vote_choice: VoteChoice::Approve,
        }),
    );

    setup
        .env
        .ledger()
        .set_timestamp(voting_ends_at + TIMELOCK_DELAY + 1);

    let vote_result = setup
        .contract
        .execute(&setup.mando, &id, &proposal_id, &None, &None);
    assert_eq!(vote_result, ProposalStatus::Approved);

    let proposal = setup.contract.get_proposal(&id, &proposal_id);
    assert_eq!(proposal.status, ProposalStatus::Approved);
}

#[test]
fn token_based_proposal_flow() {
    let setup = create_test_data();
    let id = init_contract(&setup);

    let title = String::from_str(&setup.env, "Token-based voting test");
    let ipfs = String::from_str(
        &setup.env,
        "bafybeib6ioupho3p3pliusx7tgs7dvi6mpu2bwfhayj6w6ie44lo3vvc4i",
    );
    let voting_ends_at = setup.env.ledger().timestamp() + 3600 * 24 * 2;

    // Record initial balances
    let balance_proposer_init = setup.token_stellar.balance(&setup.grogu);
    let balance_voter_init = setup.token_stellar.balance(&setup.mando);

    // Create token-based proposal
    let proposal_id = setup.contract.create_proposal(
        &setup.grogu,
        &id,
        &title,
        &ipfs,
        &voting_ends_at,
        &true,                                      // public_voting
        &Some(setup.token_stellar.address.clone()), // token_contract
        &None,
    );

    // Verify proposal was created with token_contract
    let proposal = setup.contract.get_proposal(&id, &proposal_id);
    assert!(proposal.vote_data.token_contract.is_some());

    // Check proposer balance decreased by PROPOSAL_COLLATERAL only
    let balance_proposer_after_create = setup.token_stellar.balance(&setup.grogu);
    let expected_proposer_deduction = 5 * 10_000_000; // PROPOSAL_COLLATERAL
    assert_eq!(
        balance_proposer_init - balance_proposer_after_create,
        expected_proposer_deduction
    );

    // Vote with weight based on token balance
    let vote_weight = 1000u32;
    setup.contract.vote(
        &setup.mando,
        &id,
        &proposal_id,
        &Vote::PublicVote(PublicVote {
            address: setup.mando.clone(),
            weight: vote_weight,
            vote_choice: VoteChoice::Approve,
        }),
    );

    let balance_voter_after_vote = setup.token_stellar.balance(&setup.mando);
    assert_eq!(balance_voter_init, balance_voter_after_vote);

    // Move time forward to end voting period
    setup
        .env
        .ledger()
        .set_timestamp(voting_ends_at + TIMELOCK_DELAY + 1);

    // Execute the proposal
    let vote_result = setup
        .contract
        .execute(&setup.mando, &id, &proposal_id, &None, &None);
    assert_eq!(vote_result, ProposalStatus::Approved);

    // Proposer gets back PROPOSAL_COLLATERAL; voter was never locked
    let balance_proposer_final = setup.token_stellar.balance(&setup.grogu);
    let balance_voter_final = setup.token_stellar.balance(&setup.mando);
    assert_eq!(balance_proposer_final, balance_proposer_init);
    assert_eq!(balance_voter_final, balance_voter_init);
}

#[test]
fn token_based_get_max_weight() {
    let setup = create_test_data();
    let id = init_contract(&setup);

    // For token-based proposals, get_max_weight returns badge-based weight.
    // Token balance validation happens in vote() without locking.
    let max_weight = setup.contract.get_max_weight(&id, &setup.mando);

    // Should return default badge weight (1) since no badges assigned
    assert_eq!(max_weight, 1);
}

#[test]
fn badge_based_get_max_weight_still_works() {
    let setup = create_test_data();
    let id = init_contract(&setup);

    // get_max_weight always returns badge-based weight
    let max_weight = setup.contract.get_max_weight(&id, &setup.mando);

    // Should return default badge weight (1) since no badges assigned
    assert_eq!(max_weight, 1);
}

#[test]
fn conflict_of_interest_flow() {
    use soroban_sdk::testutils::Address as _;

    let setup = create_test_data();
    let id = init_contract(&setup);

    let outsider = Address::generate(&setup.env);
    let genesis_amount: i128 = 1_000_000_000 * 10_000_000;
    setup.token_stellar.mint(&outsider, &genesis_amount);

    let title = String::from_str(&setup.env, "Conflict Proposal");
    let ipfs = String::from_str(
        &setup.env,
        "bafybeib6ioupho3p3pliusx7tgs7dvi6mpu2bwfhayj6w6ie44lo3vvc4i",
    );
    let voting_ends_at = setup.env.ledger().timestamp() + 3600 * 24 * 2;

    let proposal_id = setup.contract.create_proposal(
        &setup.grogu,
        &id,
        &title,
        &ipfs,
        &voting_ends_at,
        &true,
        &None,
        &None,
    );

    // Initially empty
    let list = setup.contract.get_conflict_of_interest(&id, &proposal_id);
    assert_eq!(list.len(), 0);

    // Non-maintainer cannot edit the list
    let err = setup
        .contract
        .try_add_conflict_of_interest(
            &outsider,
            &id,
            &proposal_id,
            &vec![&setup.env, outsider.clone()],
        )
        .unwrap_err()
        .unwrap();
    assert_eq!(err, ContractErrors::UnauthorizedSigner.into());

    // Maintainer adds 2 addresses first
    let addr1 = outsider.clone();
    let addr2 = Address::generate(&setup.env);
    setup.contract.add_conflict_of_interest(
        &setup.mando,
        &id,
        &proposal_id,
        &vec![&setup.env, addr1.clone(), addr2.clone()],
    );
    let list = setup.contract.get_conflict_of_interest(&id, &proposal_id);
    assert_eq!(list.len(), 2);

    // Maintainer adds 3 more addresses, including a duplicate of addr1 which
    // must be ignored to keep the list de-duplicated
    let addr3 = Address::generate(&setup.env);
    let addr4 = Address::generate(&setup.env);
    let addr5 = Address::generate(&setup.env);
    setup.contract.add_conflict_of_interest(
        &setup.mando,
        &id,
        &proposal_id,
        &vec![
            &setup.env,
            addr1.clone(),
            addr3.clone(),
            addr4.clone(),
            addr5.clone(),
        ],
    );
    let list = setup.contract.get_conflict_of_interest(&id, &proposal_id);
    assert_eq!(list.len(), 5);
    assert_eq!(list.get(0).unwrap(), addr1);
    assert_eq!(list.get(1).unwrap(), addr2);
    assert_eq!(list.get(2).unwrap(), addr3);
    assert_eq!(list.get(3).unwrap(), addr4);
    assert_eq!(list.get(4).unwrap(), addr5);

    // Conflicted voter is blocked
    let err = setup
        .contract
        .try_vote(
            &outsider,
            &id,
            &proposal_id,
            &Vote::PublicVote(PublicVote {
                address: outsider.clone(),
                weight: 1,
                vote_choice: VoteChoice::Approve,
            }),
        )
        .unwrap_err()
        .unwrap();
    assert_eq!(err, ContractErrors::VoterConflicted.into());

    // Maintainer removes the 2nd and 4th entries to exercise removal in the
    // middle of the list while preserving the rest
    setup.contract.remove_conflict_of_interest(
        &setup.mando,
        &id,
        &proposal_id,
        &vec![&setup.env, addr2.clone(), addr4.clone()],
    );
    let list = setup.contract.get_conflict_of_interest(&id, &proposal_id);
    assert_eq!(list.len(), 3);
    assert_eq!(list.get(0).unwrap(), addr1);
    assert_eq!(list.get(1).unwrap(), addr3);
    assert_eq!(list.get(2).unwrap(), addr5);

    // Maintainer removes addr1 so the previously-blocked voter can vote
    setup.contract.remove_conflict_of_interest(
        &setup.mando,
        &id,
        &proposal_id,
        &vec![&setup.env, addr1.clone()],
    );
    setup.contract.vote(
        &outsider,
        &id,
        &proposal_id,
        &Vote::PublicVote(PublicVote {
            address: outsider.clone(),
            weight: 1,
            vote_choice: VoteChoice::Approve,
        }),
    );

    // Non-maintainer cannot remove themselves
    setup.contract.add_conflict_of_interest(
        &setup.mando,
        &id,
        &proposal_id,
        &vec![&setup.env, outsider.clone()],
    );
    let err = setup
        .contract
        .try_remove_conflict_of_interest(
            &outsider,
            &id,
            &proposal_id,
            &vec![&setup.env, outsider.clone()],
        )
        .unwrap_err()
        .unwrap();
    assert_eq!(err, ContractErrors::UnauthorizedSigner.into());
}

#[test]
fn remove_vote_public_flips_outcome() {
    let setup = create_test_data();
    let id = init_contract(&setup);

    let ipfs = String::from_str(
        &setup.env,
        "bafybeib6ioupho3p3pliusx7tgs7dvi6mpu2bwfhayj6w6ie44lo3vvc4i",
    );
    let voting_ends_at = setup.env.ledger().timestamp() + 3600 * 24 * 2;

    let proposal_id = setup.contract.create_proposal(
        &setup.grogu,
        &id,
        &String::from_str(&setup.env, "Test remove vote"),
        &ipfs,
        &voting_ends_at,
        &true,
        &None,
        &None,
    );

    // Auth check: outsider cannot remove a vote
    let outsider = Address::generate(&setup.env);
    assert_eq!(
        setup
            .contract
            .try_remove_vote(&outsider, &id, &proposal_id, &setup.mando),
        Err(Ok(ContractErrors::UnauthorizedSigner.into()))
    );

    // VoteNotFound check: cannot remove a vote that doesn't exist
    let non_voter = Address::generate(&setup.env);
    assert_eq!(
        setup
            .contract
            .try_remove_vote(&setup.grogu, &id, &proposal_id, &non_voter),
        Err(Ok(ContractErrors::VoteNotFound.into()))
    );

    // Give rex a Community badge so their vote carries more weight
    let rex = Address::generate(&setup.env);
    setup
        .token_stellar
        .mint(&rex, &(1_000_000_000 * 10_000_000));
    let meta = String::from_str(&setup.env, "rex");
    setup.contract.add_member(&rex, &meta, &None, &None, &None);
    setup
        .contract
        .set_badges(&setup.mando, &id, &rex, &vec![&setup.env, Badge::Community]);

    // mando votes Approve (weight 1)
    setup.contract.vote(
        &setup.mando,
        &id,
        &proposal_id,
        &Vote::PublicVote(PublicVote {
            address: setup.mando.clone(),
            weight: 1,
            vote_choice: VoteChoice::Approve,
        }),
    );

    // rex votes Reject with high weight outcome would be Rejected without removal
    setup.contract.vote(
        &rex,
        &id,
        &proposal_id,
        &Vote::PublicVote(PublicVote {
            address: rex.clone(),
            weight: Badge::Community as u32,
            vote_choice: VoteChoice::Reject,
        }),
    );

    let balance_rex_after_vote = setup.token_stellar.balance(&rex);

    // Advance past voting period — removal must still work after deadline
    setup
        .env
        .ledger()
        .set_timestamp(voting_ends_at + TIMELOCK_DELAY + 1);

    // Maintainer removes rex's malicious reject vote
    setup
        .contract
        .remove_vote(&setup.grogu, &id, &proposal_id, &rex);

    assert_eq!(setup.token_stellar.balance(&rex), balance_rex_after_vote);

    let result = setup
        .contract
        .execute(&setup.grogu, &id, &proposal_id, &None, &None);
    assert_eq!(result, ProposalStatus::Approved);
}

#[test]
fn remove_vote_anonymous_flips_outcome() {
    let setup = create_test_data();
    let id = init_contract(&setup);

    let public_key = String::from_str(&setup.env, "public key random");
    setup
        .contract
        .anonymous_voting_setup(&setup.mando, &id, &public_key);

    let kuiil = Address::generate(&setup.env);
    setup.token_stellar.mint(&kuiil, &(10 * 10_000_000));
    setup.contract.add_member(
        &kuiil,
        &String::from_str(&setup.env, "kuiil"),
        &None,
        &None,
        &None,
    );
    setup.contract.set_badges(
        &setup.mando,
        &id,
        &kuiil,
        &vec![&setup.env, Badge::Community],
    );

    let rex = Address::generate(&setup.env);
    setup.token_stellar.mint(&rex, &(10 * 10_000_000));
    setup.contract.add_member(
        &rex,
        &String::from_str(&setup.env, "rex"),
        &None,
        &None,
        &None,
    );
    setup
        .contract
        .set_badges(&setup.mando, &id, &rex, &vec![&setup.env, Badge::Community]);

    let ipfs = String::from_str(
        &setup.env,
        "bafybeib6ioupho3p3pliusx7tgs7dvi6mpu2bwfhayj6w6ie44lo3vvc4i",
    );
    let voting_ends_at = setup.env.ledger().timestamp() + 3600 * 24 * 2;

    let proposal_id = setup.contract.create_proposal(
        &setup.grogu,
        &id,
        &String::from_str(&setup.env, "Anonymous remove vote test"),
        &ipfs,
        &voting_ends_at,
        &false,
        &None,
        &None,
    );

    let kuiil_vote = Vote::AnonymousVote(AnonymousVote {
        address: kuiil.clone(),
        weight: 3,
        encrypted_seeds: vec![
            &setup.env,
            String::from_str(&setup.env, "s0"),
            String::from_str(&setup.env, "s1"),
            String::from_str(&setup.env, "s2"),
        ],
        encrypted_votes: vec![
            &setup.env,
            String::from_str(&setup.env, "v0"),
            String::from_str(&setup.env, "v1"),
            String::from_str(&setup.env, "v2"),
        ],
        commitments: setup.contract.build_commitments_from_votes(
            &id,
            &vec![&setup.env, 1u128, 0u128, 0u128],
            &scalars(&setup.env, &[2, 0, 0]),
        ),
    });
    setup.contract.vote(&kuiil, &id, &proposal_id, &kuiil_vote);

    // rex votes Reject, weight=3 (Community badge)
    // Without removal: reject=3 ties approve=3 → Cancelled
    // With removal: approve=3 > reject=0 → Approved
    let rex_vote = Vote::AnonymousVote(AnonymousVote {
        address: rex.clone(),
        weight: 3,
        encrypted_seeds: vec![
            &setup.env,
            String::from_str(&setup.env, "r0"),
            String::from_str(&setup.env, "r1"),
            String::from_str(&setup.env, "r2"),
        ],
        encrypted_votes: vec![
            &setup.env,
            String::from_str(&setup.env, "rv0"),
            String::from_str(&setup.env, "rv1"),
            String::from_str(&setup.env, "rv2"),
        ],
        commitments: setup.contract.build_commitments_from_votes(
            &id,
            &vec![&setup.env, 0u128, 1u128, 0u128],
            &scalars(&setup.env, &[0, 3, 0]),
        ),
    });
    setup.contract.vote(&rex, &id, &proposal_id, &rex_vote);

    // Remove rex's reject vote (maintainer action)
    setup
        .contract
        .remove_vote(&setup.grogu, &id, &proposal_id, &rex);

    setup
        .env
        .ledger()
        .set_timestamp(voting_ends_at + TIMELOCK_DELAY + 1);

    let result = setup.contract.execute(
        &setup.grogu,
        &id,
        &proposal_id,
        &Some(vec![&setup.env, 3u128, 0u128, 0u128]),
        &Some(scalars(&setup.env, &[6, 0, 0])),
    );
    assert_eq!(result, ProposalStatus::Approved);
}

#[test]
fn min_voting_period_override_applies_to_create_proposal() {
    // A project with a per-project minimum of 7 days should reject a 2-day
    // proposal even though 2 days clears the global 24h default.
    let setup = create_test_data();

    let name = String::from_str(&setup.env, "stricter");
    let url = String::from_str(&setup.env, "github.com/stricter");
    let ipfs = String::from_str(&setup.env, "2ef4f49fdd8fa9dc463f1f06a094c26b88710990");
    let maintainers = vec![&setup.env, setup.grogu.clone(), setup.mando.clone()];

    let genesis_amount: i128 = 1_000_000_000 * 10_000_000;
    setup.token_stellar.mint(&setup.grogu, &genesis_amount);
    setup.token_stellar.mint(&setup.mando, &genesis_amount);

    let seven_days = 7 * 24 * 3600u64;
    let id = setup.contract.register(
        &setup.grogu,
        &name,
        &maintainers,
        &url,
        &ipfs,
        &Some(seven_days),
        &None,
        &None,
    );

    let title = String::from_str(&setup.env, "Some proposal title");
    let prop_ipfs = String::from_str(
        &setup.env,
        "bafybeib6ioupho3p3pliusx7tgs7dvi6mpu2bwfhayj6w6ie44lo3vvc4i",
    );
    let two_days_out = setup.env.ledger().timestamp() + 2 * 24 * 3600;

    let err = setup
        .contract
        .try_create_proposal(
            &setup.grogu,
            &id,
            &title,
            &prop_ipfs,
            &two_days_out,
            &true,
            &None,
            &None,
        )
        .unwrap_err()
        .unwrap();
    assert_eq!(err, ContractErrors::ProposalInputValidation.into());

    // And a proposal that respects the 7-day floor succeeds.
    let eight_days_out = setup.env.ledger().timestamp() + 8 * 24 * 3600;
    let _proposal_id = setup.contract.create_proposal(
        &setup.grogu,
        &id,
        &title,
        &prop_ipfs,
        &eight_days_out,
        &true,
        &None,
        &None,
    );
}

#[test]
fn execute_delay_override_applies_to_execute() {
    // A project with a per-project execute delay of 60s should allow execute()
    // 60s past voting_ends_at, even though TIMELOCK_DELAY is 24h.
    let setup = create_test_data();

    let name = String::from_str(&setup.env, "fastdao");
    let url = String::from_str(&setup.env, "github.com/fastdao");
    let ipfs = String::from_str(&setup.env, "2ef4f49fdd8fa9dc463f1f06a094c26b88710990");
    let maintainers = vec![&setup.env, setup.grogu.clone(), setup.mando.clone()];

    let genesis_amount: i128 = 1_000_000_000 * 10_000_000;
    setup.token_stellar.mint(&setup.grogu, &genesis_amount);
    setup.token_stellar.mint(&setup.mando, &genesis_amount);

    let fast_delay = 60u64;
    let id = setup.contract.register(
        &setup.grogu,
        &name,
        &maintainers,
        &url,
        &ipfs,
        &None,
        &Some(fast_delay),
        &None,
    );

    let title = String::from_str(&setup.env, "Some proposal title");
    let prop_ipfs = String::from_str(
        &setup.env,
        "bafybeib6ioupho3p3pliusx7tgs7dvi6mpu2bwfhayj6w6ie44lo3vvc4i",
    );
    let voting_ends_at = setup.env.ledger().timestamp() + 2 * 24 * 3600;
    let proposal_id = setup.contract.create_proposal(
        &setup.grogu,
        &id,
        &title,
        &prop_ipfs,
        &voting_ends_at,
        &true,
        &None,
        &None,
    );

    setup.contract.vote(
        &setup.mando,
        &id,
        &proposal_id,
        &Vote::PublicVote(PublicVote {
            address: setup.mando.clone(),
            weight: 1,
            vote_choice: VoteChoice::Approve,
        }),
    );

    // Before per-project delay: execute should panic.
    setup
        .env
        .ledger()
        .set_timestamp(voting_ends_at + fast_delay - 1);
    let err = setup
        .contract
        .try_execute(&setup.mando, &id, &proposal_id, &None, &None)
        .unwrap_err()
        .unwrap();
    assert_eq!(err, ContractErrors::ProposalVotingTime.into());

    // Exactly at per-project delay: execute should succeed (even though
    // TIMELOCK_DELAY=24h hasn't elapsed).
    setup
        .env
        .ledger()
        .set_timestamp(voting_ends_at + fast_delay);
    let status = setup
        .contract
        .execute(&setup.mando, &id, &proposal_id, &None, &None);
    assert_eq!(status, ProposalStatus::Approved);
}

#[test]
fn update_config_min_voting_period_applies_to_new_proposals() {
    // A floor set after registration binds future proposals; clearing it
    // restores the global default.
    let setup = create_test_data();

    let name = String::from_str(&setup.env, "latergov");
    let url = String::from_str(&setup.env, "github.com/latergov");
    let ipfs = String::from_str(&setup.env, "2ef4f49fdd8fa9dc463f1f06a094c26b88710990");
    let maintainers = vec![&setup.env, setup.grogu.clone(), setup.mando.clone()];

    let genesis_amount: i128 = 1_000_000_000 * 10_000_000;
    setup.token_stellar.mint(&setup.grogu, &genesis_amount);
    setup.token_stellar.mint(&setup.mando, &genesis_amount);

    let id = setup.contract.register(
        &setup.grogu,
        &name,
        &maintainers,
        &url,
        &ipfs,
        &None,
        &None,
        &None,
    );

    let seven_days = 7 * 24 * 3600u64;
    setup.contract.update_config(
        &setup.grogu,
        &id,
        &maintainers,
        &url,
        &ipfs,
        &Some(seven_days),
        &None,
        &None,
    );

    let title = String::from_str(&setup.env, "Some proposal title");
    let prop_ipfs = String::from_str(
        &setup.env,
        "bafybeib6ioupho3p3pliusx7tgs7dvi6mpu2bwfhayj6w6ie44lo3vvc4i",
    );
    let two_days_out = setup.env.ledger().timestamp() + 2 * 24 * 3600;

    let err = setup
        .contract
        .try_create_proposal(
            &setup.grogu,
            &id,
            &title,
            &prop_ipfs,
            &two_days_out,
            &true,
            &None,
            &None,
        )
        .unwrap_err()
        .unwrap();
    assert_eq!(err, ContractErrors::ProposalInputValidation.into());

    // Restoring the default floor is a loosening update: it only takes
    // effect after the notice window (old 7d min + 24h delay).
    setup.contract.update_config(
        &setup.grogu,
        &id,
        &maintainers,
        &url,
        &ipfs,
        &Some(24 * 3600u64),
        &None,
        &None,
    );
    let err = setup
        .contract
        .try_create_proposal(
            &setup.grogu,
            &id,
            &title,
            &prop_ipfs,
            &two_days_out,
            &true,
            &None,
            &None,
        )
        .unwrap_err()
        .unwrap();
    assert_eq!(err, ContractErrors::ProposalInputValidation.into());

    let notice = seven_days + 24 * 3600;
    setup
        .env
        .ledger()
        .set_timestamp(setup.env.ledger().timestamp() + notice);
    let two_days_out = setup.env.ledger().timestamp() + 2 * 24 * 3600;
    let _proposal_id = setup.contract.create_proposal(
        &setup.grogu,
        &id,
        &title,
        &prop_ipfs,
        &two_days_out,
        &true,
        &None,
        &None,
    );
}

#[test]
fn execute_delay_snapshot_shields_in_flight_proposals() {
    // Changing the project delay after a proposal is created must not change
    // that proposal's timelock; only proposals created afterwards see it.
    let setup = create_test_data();

    let name = String::from_str(&setup.env, "fastdao");
    let url = String::from_str(&setup.env, "github.com/fastdao");
    let ipfs = String::from_str(&setup.env, "2ef4f49fdd8fa9dc463f1f06a094c26b88710990");
    let maintainers = vec![&setup.env, setup.grogu.clone(), setup.mando.clone()];

    let genesis_amount: i128 = 1_000_000_000 * 10_000_000;
    setup.token_stellar.mint(&setup.grogu, &genesis_amount);
    setup.token_stellar.mint(&setup.mando, &genesis_amount);

    let fast_delay = 60u64;
    let id = setup.contract.register(
        &setup.grogu,
        &name,
        &maintainers,
        &url,
        &ipfs,
        &None,
        &Some(fast_delay),
        &None,
    );

    let title = String::from_str(&setup.env, "Some proposal title");
    let prop_ipfs = String::from_str(
        &setup.env,
        "bafybeib6ioupho3p3pliusx7tgs7dvi6mpu2bwfhayj6w6ie44lo3vvc4i",
    );
    let voting_ends_at = setup.env.ledger().timestamp() + 2 * 24 * 3600;
    let proposal_a = setup.contract.create_proposal(
        &setup.grogu,
        &id,
        &title,
        &prop_ipfs,
        &voting_ends_at,
        &true,
        &None,
        &None,
    );

    // Lengthen the delay after proposal A exists; proposal B inherits it.
    let seven_days = 7 * 24 * 3600u64;
    setup.contract.update_config(
        &setup.grogu,
        &id,
        &maintainers,
        &url,
        &ipfs,
        &None,
        &Some(seven_days),
        &None,
    );
    let proposal_b = setup.contract.create_proposal(
        &setup.grogu,
        &id,
        &title,
        &prop_ipfs,
        &voting_ends_at,
        &true,
        &None,
        &None,
    );

    for pid in [proposal_a, proposal_b] {
        setup.contract.vote(
            &setup.mando,
            &id,
            &pid,
            &Vote::PublicVote(PublicVote {
                address: setup.mando.clone(),
                weight: 1,
                vote_choice: VoteChoice::Approve,
            }),
        );
    }

    setup
        .env
        .ledger()
        .set_timestamp(voting_ends_at + fast_delay);

    // A keeps its snapshotted 60s delay.
    let status = setup
        .contract
        .execute(&setup.mando, &id, &proposal_a, &None, &None);
    assert_eq!(status, ProposalStatus::Approved);

    // B was created under the 7-day delay and is still locked.
    let err = setup
        .contract
        .try_execute(&setup.mando, &id, &proposal_b, &None, &None)
        .unwrap_err()
        .unwrap();
    assert_eq!(err, ContractErrors::ProposalVotingTime.into());
}

#[test]
fn execute_delay_loosening_waits_out_notice() {
    // Lowering the timelock is pending for old min + old delay (24h + 24h);
    // proposals created before activation keep the old delay, proposals
    // created after get the new one.
    let setup = create_test_data();

    let name = String::from_str(&setup.env, "slowdao");
    let url = String::from_str(&setup.env, "github.com/slowdao");
    let ipfs = String::from_str(&setup.env, "2ef4f49fdd8fa9dc463f1f06a094c26b88710990");
    let maintainers = vec![&setup.env, setup.grogu.clone(), setup.mando.clone()];

    let genesis_amount: i128 = 1_000_000_000 * 10_000_000;
    setup.token_stellar.mint(&setup.grogu, &genesis_amount);
    setup.token_stellar.mint(&setup.mando, &genesis_amount);

    let id = setup.contract.register(
        &setup.grogu,
        &name,
        &maintainers,
        &url,
        &ipfs,
        &None,
        &None,
        &None,
    );

    let t0 = setup.env.ledger().timestamp();
    let fast_delay = 60u64;
    setup.contract.update_config(
        &setup.grogu,
        &id,
        &maintainers,
        &url,
        &ipfs,
        &None,
        &Some(fast_delay),
        &None,
    );

    let title = String::from_str(&setup.env, "Some proposal title");
    let prop_ipfs = String::from_str(
        &setup.env,
        "bafybeib6ioupho3p3pliusx7tgs7dvi6mpu2bwfhayj6w6ie44lo3vvc4i",
    );

    // Proposal A is created while the update is still pending: no snapshot,
    // so it keeps the global 24h delay.
    let ends_a = t0 + 3 * 24 * 3600;
    let proposal_a = setup.contract.create_proposal(
        &setup.grogu,
        &id,
        &title,
        &prop_ipfs,
        &ends_a,
        &true,
        &None,
        &None,
    );
    setup.contract.vote(
        &setup.mando,
        &id,
        &proposal_a,
        &Vote::PublicVote(PublicVote {
            address: setup.mando.clone(),
            weight: 1,
            vote_choice: VoteChoice::Approve,
        }),
    );

    // Past the 48h notice window: proposal B picks up the 60s delay.
    setup.env.ledger().set_timestamp(t0 + 2 * 24 * 3600 + 10);
    let ends_b = setup.env.ledger().timestamp() + 24 * 3600;
    let proposal_b = setup.contract.create_proposal(
        &setup.grogu,
        &id,
        &title,
        &prop_ipfs,
        &ends_b,
        &true,
        &None,
        &None,
    );
    setup.contract.vote(
        &setup.mando,
        &id,
        &proposal_b,
        &Vote::PublicVote(PublicVote {
            address: setup.mando.clone(),
            weight: 1,
            vote_choice: VoteChoice::Approve,
        }),
    );

    setup.env.ledger().set_timestamp(ends_b + fast_delay);
    let status = setup
        .contract
        .execute(&setup.mando, &id, &proposal_b, &None, &None);
    assert_eq!(status, ProposalStatus::Approved);

    // A (voting ended at ends_a = t0+72h) still needs the full 24h it was
    // created under, and ends_b + 60 < ends_a + 24h.
    let err = setup
        .contract
        .try_execute(&setup.mando, &id, &proposal_a, &None, &None)
        .unwrap_err()
        .unwrap();
    assert_eq!(err, ContractErrors::ProposalVotingTime.into());
}

#[test]
fn large_proposal_does_not_block_the_next_one() {
    let setup = create_test_data();
    let id = init_contract(&setup);
    let env = &setup.env;
    let title = String::from_str(env, "Test Proposal");
    let ipfs = String::from_str(
        env,
        "bafybeib6ioupho3p3pliusx7tgs7dvi6mpu2bwfhayj6w6ie44lo3vvc4i",
    );
    let voting_ends_at = env.ledger().timestamp() + 3600 * 24 * 2;

    // an outcome close to the ledger entry size limit
    let blob = soroban_sdk::Bytes::from_array(env, &[0u8; 60_000]);
    let large = OutcomeContract {
        address: Address::generate(env),
        execute_fn: Symbol::new(env, "noop"),
        args: vec![env, blob.into_val(env)],
    };
    let first = setup.contract.create_proposal(
        &setup.grogu,
        &id,
        &title,
        &ipfs,
        &voting_ends_at,
        &true,
        &None,
        &Some(vec![env, large]),
    );

    // each proposal is its own entry, so the page does not grow with it
    let second = setup.contract.create_proposal(
        &setup.grogu,
        &id,
        &title,
        &ipfs,
        &voting_ends_at,
        &true,
        &None,
        &None,
    );
    assert_eq!(second, first + 1);
    assert_eq!(setup.contract.get_dao(&id, &0).proposals.len(), 2);
}

#[test]
fn at_most_three_outcomes() {
    let setup = create_test_data();
    let id = init_contract(&setup);
    let env = &setup.env;
    let outcome = OutcomeContract {
        address: Address::generate(env),
        execute_fn: Symbol::new(env, "noop"),
        args: vec![env],
    };
    let err = setup
        .contract
        .try_create_proposal(
            &setup.grogu,
            &id,
            &String::from_str(env, "Test Proposal"),
            &String::from_str(
                env,
                "bafybeib6ioupho3p3pliusx7tgs7dvi6mpu2bwfhayj6w6ie44lo3vvc4i",
            ),
            &(env.ledger().timestamp() + 3600 * 24 * 2),
            &true,
            &None,
            &Some(vec![
                env,
                outcome.clone(),
                outcome.clone(),
                outcome.clone(),
                outcome,
            ]),
        )
        .unwrap_err()
        .unwrap();
    assert_eq!(err, ContractErrors::ProposalInputValidation.into());
}

#[test]
fn weight_one_votes_take_at_most_half_the_slots() {
    let setup = create_test_data();
    let id = init_contract(&setup);
    let env = &setup.env;
    let voting_ends_at = env.ledger().timestamp() + 3600 * 24 * 2;
    let proposal_id = setup.contract.create_proposal(
        &setup.grogu,
        &id,
        &String::from_str(env, "Test Proposal"),
        &String::from_str(
            env,
            "bafybeib6ioupho3p3pliusx7tgs7dvi6mpu2bwfhayj6w6ie44lo3vvc4i",
        ),
        &voting_ends_at,
        &true,
        &None,
        &None,
    );
    let approve = |voter: &Address, weight: u32| {
        Vote::PublicVote(PublicVote {
            address: voter.clone(),
            weight,
            vote_choice: VoteChoice::Approve,
        })
    };

    // fresh addresses vote with the default weight
    let mut fresh = soroban_sdk::Vec::new(env);
    for _ in 0..MAX_DEFAULT_WEIGHT_VOTES {
        let voter = Address::generate(env);
        setup
            .contract
            .vote(&voter, &id, &proposal_id, &approve(&voter, 1));
        fresh.push_back(voter);
    }
    let extra = Address::generate(env);
    let err = setup
        .contract
        .try_vote(&extra, &id, &proposal_id, &approve(&extra, 1))
        .unwrap_err()
        .unwrap();
    assert_eq!(err, ContractErrors::VoteLimitExceeded.into());

    // a badge holder still has a slot
    let member = Address::generate(env);
    setup
        .contract
        .add_member(&member, &String::from_str(env, "meta"), &None, &None, &None);
    setup
        .contract
        .set_badges(&setup.mando, &id, &member, &vec![env, Badge::Community]);
    setup.contract.vote(
        &member,
        &id,
        &proposal_id,
        &approve(&member, Badge::Community as u32),
    );

    // removing a weight-1 vote frees its slot
    setup
        .contract
        .remove_vote(&setup.mando, &id, &proposal_id, &fresh.get(0).unwrap());
    setup
        .contract
        .vote(&extra, &id, &proposal_id, &approve(&extra, 1));
}

#[test]
fn a_proposal_takes_at_most_a_thousand_votes() {
    let setup = create_test_data();
    let id = init_contract(&setup);
    let env = &setup.env;
    // every address weighs the same, so no vote takes a weight-1 slot
    super::test_utils::set_nqg(&setup, &id);
    let proposal_id = setup.contract.create_proposal(
        &setup.grogu,
        &id,
        &String::from_str(env, "Test Proposal"),
        &String::from_str(env, PROPOSAL_IPFS),
        &(env.ledger().timestamp() + 3600 * 24 * 2),
        &true,
        &None,
        &None,
    );
    let approve = |voter: &Address| {
        Vote::PublicVote(PublicVote {
            address: voter.clone(),
            weight: 1_000,
            vote_choice: VoteChoice::Approve,
        })
    };

    // the proposer's ballot is the first vote
    for _ in 1..MAX_VOTES_PER_PROPOSAL {
        let voter = Address::generate(env);
        setup
            .contract
            .vote(&voter, &id, &proposal_id, &approve(&voter));
    }
    let extra = Address::generate(env);
    let err = setup
        .contract
        .try_vote(&extra, &id, &proposal_id, &approve(&extra))
        .unwrap_err()
        .unwrap();
    assert_eq!(err, ContractErrors::VoteLimitExceeded.into());
}

mod odd_token {
    use soroban_sdk::{Address, Env, contract, contractimpl};

    /// A token reporting more decimals than i128 can hold.
    #[contract]
    pub struct OddToken;
    #[contractimpl]
    impl OddToken {
        pub fn decimals(_e: &Env) -> u32 {
            39
        }
        pub fn balance(_e: &Env, _id: Address) -> i128 {
            i128::MAX
        }
    }
}

const PROPOSAL_IPFS: &str = "bafybeib6ioupho3p3pliusx7tgs7dvi6mpu2bwfhayj6w6ie44lo3vvc4i";

#[test]
fn token_proposals_are_for_maintainers_and_not_nqg_projects() {
    let setup = create_test_data();
    let id = init_contract(&setup);
    let env = &setup.env;
    let token = env.register(odd_token::OddToken, ());
    let outsider = Address::generate(env);
    setup.token_stellar.mint(&outsider, &(1_000 * 10_000_000));
    let ends = env.ledger().timestamp() + 3600 * 24 * 2;
    let create = |proposer: &Address| {
        setup.contract.try_create_proposal(
            proposer,
            &id,
            &String::from_str(env, "Token Proposal"),
            &String::from_str(env, PROPOSAL_IPFS),
            &ends,
            &true,
            &Some(token.clone()),
            &None,
        )
    };

    let err = create(&outsider).unwrap_err().unwrap();
    assert_eq!(err, ContractErrors::UnauthorizedSigner.into());

    // a maintainer can, and a vote with an overflowing unit is refused
    let proposal_id = create(&setup.grogu).unwrap().unwrap();
    let err = setup
        .contract
        .try_vote(
            &setup.mando,
            &id,
            &proposal_id,
            &Vote::PublicVote(PublicVote {
                address: setup.mando.clone(),
                weight: 1,
                vote_choice: VoteChoice::Approve,
            }),
        )
        .unwrap_err()
        .unwrap();
    assert_eq!(err, ContractErrors::VoterWeight.into());

    // not on a project weighted by NQG
    super::test_utils::set_nqg(&setup, &id);
    let err = create(&setup.grogu).unwrap_err().unwrap();
    assert_eq!(err, ContractErrors::UnauthorizedSigner.into());
}

#[test]
fn proof_needs_three_tallies_and_seeds() {
    let setup = create_test_data();
    let id = init_contract(&setup);
    let env = &setup.env;
    setup
        .contract
        .anonymous_voting_setup(&setup.grogu, &id, &String::from_str(env, "public key"));
    let proposal_id = setup.contract.create_proposal(
        &setup.grogu,
        &id,
        &String::from_str(env, "Anonymous Proposal"),
        &String::from_str(env, PROPOSAL_IPFS),
        &(env.ledger().timestamp() + 3600 * 24 * 2),
        &false,
        &None,
        &None,
    );
    let proposal = setup.contract.get_proposal(&id, &proposal_id);
    let empty: soroban_sdk::Vec<u128> = soroban_sdk::Vec::new(env);
    let err = setup
        .contract
        .try_proof(&id, &proposal, &empty, &soroban_sdk::Vec::new(env))
        .unwrap_err()
        .unwrap();
    assert_eq!(err, ContractErrors::TallySeedError.into());
}

#[test]
fn anonymous_ballot_strings_are_bounded() {
    let setup = create_test_data();
    let id = init_contract(&setup);
    let env = &setup.env;
    setup
        .contract
        .anonymous_voting_setup(&setup.grogu, &id, &String::from_str(env, "public key"));
    let proposal_id = setup.contract.create_proposal(
        &setup.grogu,
        &id,
        &String::from_str(env, "Anonymous Proposal"),
        &String::from_str(env, PROPOSAL_IPFS),
        &(env.ledger().timestamp() + 3600 * 24 * 2),
        &false,
        &None,
        &None,
    );
    let commitments = setup.contract.build_commitments_from_votes(
        &id,
        &vec![env, 1u128, 0u128, 0u128],
        &scalars(env, &[5, 6, 7]),
    );
    let long = String::from_bytes(env, &[b'a'; 1025]);
    let short = String::from_str(env, "encrypted");
    let err = setup
        .contract
        .try_vote(
            &setup.mando,
            &id,
            &proposal_id,
            &Vote::AnonymousVote(AnonymousVote {
                address: setup.mando.clone(),
                weight: 1,
                encrypted_seeds: vec![env, short.clone(), short.clone(), short.clone()],
                encrypted_votes: vec![env, long, short.clone(), short],
                commitments,
            }),
        )
        .unwrap_err()
        .unwrap();
    assert_eq!(err, ContractErrors::BadCommitment.into());
}

#[test]
fn ballots_expire_after_the_grace_period() {
    let setup = create_test_data();
    let id = init_contract(&setup);
    let env = &setup.env;

    setup
        .contract
        .anonymous_voting_setup(&setup.mando, &id, &String::from_str(env, "public key"));

    let kuiil = Address::generate(env);
    setup
        .contract
        .add_member(&kuiil, &String::from_str(env, "kuiil"), &None, &None, &None);
    setup
        .contract
        .set_badges(&setup.mando, &id, &kuiil, &vec![env, Badge::Community]);

    let voting_ends_at = env.ledger().timestamp() + 3600 * 24 * 2;
    let proposal_id = setup.contract.create_proposal(
        &setup.grogu,
        &id,
        &String::from_str(env, "Temporary ballots"),
        &String::from_str(
            env,
            "bafybeib6ioupho3p3pliusx7tgs7dvi6mpu2bwfhayj6w6ie44lo3vvc4i",
        ),
        &voting_ends_at,
        &false,
        &None,
        &None,
    );

    let tallies = vec![env, 3u128, 0u128, 0u128];
    let seeds = scalars(env, &[6, 0, 0]);
    let kuiil_vote = Vote::AnonymousVote(AnonymousVote {
        address: kuiil.clone(),
        weight: 3,
        encrypted_seeds: vec![
            env,
            String::from_str(env, "s0"),
            String::from_str(env, "s1"),
            String::from_str(env, "s2"),
        ],
        encrypted_votes: vec![
            env,
            String::from_str(env, "v0"),
            String::from_str(env, "v1"),
            String::from_str(env, "v2"),
        ],
        commitments: setup.contract.build_commitments_from_votes(
            &id,
            &vec![env, 1u128, 0u128, 0u128],
            &scalars(env, &[2, 0, 0]),
        ),
    });
    setup.contract.vote(&kuiil, &id, &proposal_id, &kuiil_vote);

    // Both ballots, the proposer's and kuiil's, are temporary entries paid
    // until 14 days after the earliest execution.
    let ttl =
        ((voting_ends_at + TIMELOCK_DELAY + 14 * 24 * 3600 - env.ledger().timestamp()) / 5) as u32;
    for voter in [&setup.grogu, &kuiil] {
        let key = ProjectKey::Vote(id.clone(), proposal_id, voter.clone());
        env.as_contract(&setup.contract_id, || {
            assert!(!env.storage().persistent().has(&key));
            assert_eq!(env.storage().temporary().get_ttl(&key), ttl);
        });
    }

    // While the ballots live, proof sums them and kuiil cannot vote again.
    let proposal = setup.contract.get_proposal(&id, &proposal_id);
    assert_eq!(proposal.vote_data.votes.len(), 2);
    assert!(setup.contract.proof(&id, &proposal, &tallies, &seeds));
    assert_eq!(
        setup
            .contract
            .try_vote(&kuiil, &id, &proposal_id, &kuiil_vote),
        Err(Ok(ContractErrors::AlreadyVoted.into()))
    );

    // The network deletes them once their TTL has passed.
    env.ledger().with_mut(|ledger| {
        ledger.sequence_number += ttl + 1;
        ledger.timestamp = voting_ends_at + TIMELOCK_DELAY + 14 * 24 * 3600 + 5;
    });
    let proposal = setup.contract.get_proposal(&id, &proposal_id);
    assert_eq!(proposal.vote_data.votes.len(), 0);
    assert!(!setup.contract.proof(&id, &proposal, &tallies, &seeds));
    assert_eq!(
        setup
            .contract
            .try_remove_vote(&setup.grogu, &id, &proposal_id, &kuiil),
        Err(Ok(ContractErrors::VoteNotFound.into()))
    );

    // The persistent aggregate still proves the revealed tally.
    let result = setup.contract.execute(
        &setup.grogu,
        &id,
        &proposal_id,
        &Some(tallies),
        &Some(seeds),
    );
    assert_eq!(result, ProposalStatus::Approved);
}

#[test]
fn removed_voter_can_vote_again() {
    let setup = create_test_data();
    let id = init_contract(&setup);
    let env = &setup.env;

    let voting_ends_at = env.ledger().timestamp() + 3600 * 24 * 2;
    let proposal_id = setup.contract.create_proposal(
        &setup.grogu,
        &id,
        &String::from_str(env, "Vote again"),
        &String::from_str(
            env,
            "bafybeib6ioupho3p3pliusx7tgs7dvi6mpu2bwfhayj6w6ie44lo3vvc4i",
        ),
        &voting_ends_at,
        &true,
        &None,
        &None,
    );

    let vote = |choice| {
        Vote::PublicVote(PublicVote {
            address: setup.mando.clone(),
            weight: 1,
            vote_choice: choice,
        })
    };
    setup
        .contract
        .vote(&setup.mando, &id, &proposal_id, &vote(VoteChoice::Reject));
    setup
        .contract
        .remove_vote(&setup.grogu, &id, &proposal_id, &setup.mando);
    setup
        .contract
        .vote(&setup.mando, &id, &proposal_id, &vote(VoteChoice::Approve));

    env.ledger()
        .set_timestamp(voting_ends_at + TIMELOCK_DELAY + 1);
    let result = setup
        .contract
        .execute(&setup.grogu, &id, &proposal_id, &None, &None);
    assert_eq!(result, ProposalStatus::Approved);
}

#[test]
fn seeds_are_scalars_summed_modulo_the_group_order() {
    let setup = create_test_data();
    let id = init_contract(&setup);
    let env = &setup.env;
    setup
        .contract
        .anonymous_voting_setup(&setup.mando, &id, &String::from_str(env, "public key"));
    let voting_ends_at = env.ledger().timestamp() + 3600 * 24 * 2;
    let proposal_id = setup.contract.create_proposal(
        &setup.grogu,
        &id,
        &String::from_str(env, "Full-size seeds"),
        &String::from_str(env, PROPOSAL_IPFS),
        &voting_ends_at,
        &false,
        &None,
        &None,
    );

    // the order of the BLS12-381 group
    let order = soroban_sdk::U256::from_be_bytes(
        env,
        &soroban_sdk::Bytes::from_array(
            env,
            &[
                0x73, 0xed, 0xa7, 0x53, 0x29, 0x9d, 0x7d, 0x48, 0x33, 0x39, 0xd8, 0x08, 0x09, 0xa1,
                0xd8, 0x05, 0x53, 0xbd, 0xa4, 0x02, 0xff, 0xfe, 0x5b, 0xfe, 0xff, 0xff, 0xff, 0xff,
                0x00, 0x00, 0x00, 0x01,
            ],
        ),
    );
    let one = soroban_sdk::U256::from_u32(env, 1);
    let largest = order.sub(&one);
    // two voters of weight 1 blind every value with the largest seed
    for _ in 0..2 {
        let voter = Address::generate(env);
        let vote = Vote::AnonymousVote(AnonymousVote {
            address: voter.clone(),
            weight: 1,
            encrypted_seeds: vec![
                env,
                String::from_str(env, "s0"),
                String::from_str(env, "s1"),
                String::from_str(env, "s2"),
            ],
            encrypted_votes: vec![
                env,
                String::from_str(env, "v0"),
                String::from_str(env, "v1"),
                String::from_str(env, "v2"),
            ],
            commitments: setup.contract.build_commitments_from_votes(
                &id,
                &vec![env, 1u128, 0u128, 0u128],
                &vec![env, largest.clone(), largest.clone(), largest.clone()],
            ),
        });
        setup.contract.vote(&voter, &id, &proposal_id, &vote);
    }

    // the seed sums exceed u128: reduced or not, they prove the tally
    let tallies = vec![env, 2u128, 0u128, 0u128];
    let sum = largest.add(&largest);
    let reduced = sum.sub(&order);
    let proposal = setup.contract.get_proposal(&id, &proposal_id);
    for seeds in [&sum, &reduced] {
        let seeds = vec![env, seeds.clone(), seeds.clone(), seeds.clone()];
        assert!(setup.contract.proof(&id, &proposal, &tallies, &seeds));
    }

    env.ledger()
        .set_timestamp(voting_ends_at + TIMELOCK_DELAY + 1);
    let result = setup.contract.execute(
        &setup.mando,
        &id,
        &proposal_id,
        &Some(tallies),
        &Some(vec![env, reduced.clone(), reduced.clone(), reduced]),
    );
    assert_eq!(result, ProposalStatus::Approved);
}
#[test]
fn early_finalization_maintainer_quorum_flow() {
    let setup = create_test_data();
    let id = init_contract(&setup);
    setup
        .token_stellar
        .mint(&setup.contract_admin, &(100 * 10_000_000));

    let title = String::from_str(&setup.env, "Maintainer Quorum Proposal");
    let ipfs = String::from_str(
        &setup.env,
        "bafybeib6ioupho3p3pliusx7tgs7dvi6mpu2bwfhayj6w6ie44lo3vvc4i",
    );
    let voting_ends_at = setup.env.ledger().timestamp() + 3600 * 24 * 14;

    let proposal_id = setup.contract.create_proposal(
        &setup.contract_admin,
        &id,
        &title,
        &ipfs,
        &voting_ends_at,
        &true,
        &None,
        &None,
    );

    // Maintainers are grogu and mando (2 maintainers). Threshold = 66%.
    // Required quorum = (2 * 66 + 99) / 100 = 2.
    // Non-maintainers voting should NOT reach quorum.
    let rex = Address::generate(&setup.env);
    setup.contract.add_member(
        &rex,
        &String::from_str(&setup.env, "rex_meta"),
        &None,
        &None,
        &None,
    );
    setup
        .contract
        .set_badges(&setup.mando, &id, &rex, &vec![&setup.env, Badge::Community]);
    setup.contract.vote(
        &rex,
        &id,
        &proposal_id,
        &Vote::PublicVote(PublicVote {
            address: rex.clone(),
            weight: 1,
            vote_choice: VoteChoice::Approve,
        }),
    );

    // Cannot execute: non-maintainer vote does not trigger maintainer quorum
    let err = setup
        .contract
        .try_execute(&setup.mando, &id, &proposal_id, &None, &None)
        .unwrap_err()
        .unwrap();
    assert_eq!(err, ContractErrors::ProposalVotingTime.into());

    // Maintainer 1 (mando) votes
    setup.contract.vote(
        &setup.mando,
        &id,
        &proposal_id,
        &Vote::PublicVote(PublicVote {
            address: setup.mando.clone(),
            weight: 1,
            vote_choice: VoteChoice::Approve,
        }),
    );

    // 1 maintainer voted < 2 required
    let err = setup
        .contract
        .try_execute(&setup.mando, &id, &proposal_id, &None, &None)
        .unwrap_err()
        .unwrap();
    assert_eq!(err, ContractErrors::ProposalVotingTime.into());

    let quorum_time = setup.env.ledger().timestamp();
    // Maintainer 2 (grogu) votes -> reaches quorum (2/2)
    setup.contract.vote(
        &setup.grogu,
        &id,
        &proposal_id,
        &Vote::PublicVote(PublicVote {
            address: setup.grogu.clone(),
            weight: 1,
            vote_choice: VoteChoice::Approve,
        }),
    );

    // Cannot execute immediately! Must wait out shortened veto window (execute_delay / 2 = 12h)
    let err = setup
        .contract
        .try_execute(&setup.mando, &id, &proposal_id, &None, &None)
        .unwrap_err()
        .unwrap();
    assert_eq!(err, ContractErrors::ProposalVotingTime.into());

    // Advance to just before shortened delay (TIMELOCK_DELAY / 2 - 1)
    setup
        .env
        .ledger()
        .set_timestamp(quorum_time + TIMELOCK_DELAY / 2 - 1);
    let err = setup
        .contract
        .try_execute(&setup.mando, &id, &proposal_id, &None, &None)
        .unwrap_err()
        .unwrap();
    assert_eq!(err, ContractErrors::ProposalVotingTime.into());

    // Advance past shortened delay
    setup
        .env
        .ledger()
        .set_timestamp(quorum_time + TIMELOCK_DELAY / 2);
    let result = setup
        .contract
        .execute(&setup.mando, &id, &proposal_id, &None, &None);
    assert_eq!(result, ProposalStatus::Approved);
}

#[test]
fn early_finalization_veto_in_shortened_window_works() {
    let setup = create_test_data();
    let id = init_contract(&setup);
    setup
        .token_stellar
        .mint(&setup.contract_admin, &(100 * 10_000_000));

    let title = String::from_str(&setup.env, "Veto Quorum Proposal");
    let ipfs = String::from_str(
        &setup.env,
        "bafybeib6ioupho3p3pliusx7tgs7dvi6mpu2bwfhayj6w6ie44lo3vvc4i",
    );
    let voting_ends_at = setup.env.ledger().timestamp() + 3600 * 24 * 7;

    let proposal_id = setup.contract.create_proposal(
        &setup.contract_admin,
        &id,
        &title,
        &ipfs,
        &voting_ends_at,
        &true,
        &None,
        &None,
    );

    // Both maintainers vote approve
    setup.contract.vote(
        &setup.mando,
        &id,
        &proposal_id,
        &Vote::PublicVote(PublicVote {
            address: setup.mando.clone(),
            weight: 1,
            vote_choice: VoteChoice::Approve,
        }),
    );
    setup.contract.vote(
        &setup.grogu,
        &id,
        &proposal_id,
        &Vote::PublicVote(PublicVote {
            address: setup.grogu.clone(),
            weight: 1,
            vote_choice: VoteChoice::Approve,
        }),
    );

    // Grogu vetos within shortened window
    let reason = String::from_str(
        &setup.env,
        "bafybeib6ioupho3p3pliusx7tgs7dvi6mpu2bwfhayj6w6ie44lo3vvc4i",
    );
    setup
        .contract
        .veto(&setup.grogu, &id, &proposal_id, &reason);

    let proposal = setup.contract.get_proposal(&id, &proposal_id);
    assert_eq!(proposal.status, ProposalStatus::Vetoed);

    // Execute must fail because proposal is vetoed
    let err = setup
        .contract
        .try_execute(&setup.mando, &id, &proposal_id, &None, &None)
        .unwrap_err()
        .unwrap();
    assert_eq!(err, ContractErrors::ProposalActive.into());
}

#[test]
fn early_finalization_remove_vote_resets_quorum() {
    let setup = create_test_data();
    let id = init_contract(&setup);
    setup
        .token_stellar
        .mint(&setup.contract_admin, &(100 * 10_000_000));

    let title = String::from_str(&setup.env, "Reset Quorum Proposal");
    let ipfs = String::from_str(
        &setup.env,
        "bafybeib6ioupho3p3pliusx7tgs7dvi6mpu2bwfhayj6w6ie44lo3vvc4i",
    );
    let voting_ends_at = setup.env.ledger().timestamp() + 3600 * 24 * 7;

    let proposal_id = setup.contract.create_proposal(
        &setup.contract_admin,
        &id,
        &title,
        &ipfs,
        &voting_ends_at,
        &true,
        &None,
        &None,
    );

    setup.contract.vote(
        &setup.mando,
        &id,
        &proposal_id,
        &Vote::PublicVote(PublicVote {
            address: setup.mando.clone(),
            weight: 1,
            vote_choice: VoteChoice::Approve,
        }),
    );
    let quorum_time = setup.env.ledger().timestamp();
    setup.contract.vote(
        &setup.grogu,
        &id,
        &proposal_id,
        &Vote::PublicVote(PublicVote {
            address: setup.grogu.clone(),
            weight: 1,
            vote_choice: VoteChoice::Approve,
        }),
    );

    // Maintainer removes grogu's vote (malicious or mistaken)
    setup
        .contract
        .remove_vote(&setup.mando, &id, &proposal_id, &setup.grogu);

    // Advance time past the previous shortened window
    setup
        .env
        .ledger()
        .set_timestamp(quorum_time + TIMELOCK_DELAY / 2 + 10);

    // Execute must fail because quorum was reset!
    let err = setup
        .contract
        .try_execute(&setup.mando, &id, &proposal_id, &None, &None)
        .unwrap_err()
        .unwrap();
    assert_eq!(err, ContractErrors::ProposalVotingTime.into());

    // Once normal voting ends + delay, execution succeeds
    setup
        .env
        .ledger()
        .set_timestamp(voting_ends_at + TIMELOCK_DELAY + 1);
    let result = setup
        .contract
        .execute(&setup.mando, &id, &proposal_id, &None, &None);
    assert_eq!(result, ProposalStatus::Approved);
}

#[test]
fn early_finalization_single_maintainer_project() {
    let setup = create_test_data();
    let id = String::from_str(&setup.env, "singleproject");
    let key = setup.env.crypto().keccak256(&id.to_bytes()).into();
    setup.token_stellar.mint(&setup.mando, &(100 * 10_000_000));

    // Register project with only 1 maintainer (mando)
    let maintainers = vec![&setup.env, setup.mando.clone()];
    setup.contract.register(
        &setup.mando,
        &id,
        &maintainers,
        &String::from_str(&setup.env, "https://github.com/mando/repo"),
        &String::from_str(
            &setup.env,
            "bafybeib6ioupho3p3pliusx7tgs7dvi6mpu2bwfhayj6w6ie44lo3vvc4i",
        ),
        &None,
        &None,
        &None,
    );

    let title = String::from_str(&setup.env, "Single Maintainer Proposal");
    let ipfs = String::from_str(
        &setup.env,
        "bafybeib6ioupho3p3pliusx7tgs7dvi6mpu2bwfhayj6w6ie44lo3vvc4i",
    );
    let voting_ends_at = setup.env.ledger().timestamp() + 3600 * 24 * 7;

    let proposer = Address::generate(&setup.env);
    setup.token_stellar.mint(&proposer, &(100 * 10_000_000));

    let proposal_id = setup.contract.create_proposal(
        &proposer,
        &key,
        &title,
        &ipfs,
        &voting_ends_at,
        &true,
        &None,
        &None,
    );

    // Required quorum: ceil(1 * 66 / 100) = (1 * 66 + 99) / 100 = 1 maintainer.
    let quorum_time = setup.env.ledger().timestamp();
    setup.contract.vote(
        &setup.mando,
        &key,
        &proposal_id,
        &Vote::PublicVote(PublicVote {
            address: setup.mando.clone(),
            weight: 1,
            vote_choice: VoteChoice::Approve,
        }),
    );

    // Immediately before shortened window: fails
    let err = setup
        .contract
        .try_execute(&setup.mando, &key, &proposal_id, &None, &None)
        .unwrap_err()
        .unwrap();
    assert_eq!(err, ContractErrors::ProposalVotingTime.into());

    // After shortened window (12 hours)
    setup
        .env
        .ledger()
        .set_timestamp(quorum_time + TIMELOCK_DELAY / 2);
    let result = setup
        .contract
        .execute(&setup.mando, &key, &proposal_id, &None, &None);
    assert_eq!(result, ProposalStatus::Approved);
}

#[test]
fn early_finalization_token_weighted_and_nqg_use_maintainer_count() {
    let setup = create_test_data();
    // Register project with 3 maintainers: grogu, mando, and rex
    let rex = Address::generate(&setup.env);
    let maintainers = vec![
        &setup.env,
        setup.grogu.clone(),
        setup.mando.clone(),
        rex.clone(),
    ];
    let name = String::from_str(&setup.env, "tokenproject");
    let url = String::from_str(&setup.env, "github.com/tokenproject");
    let ipfs = String::from_str(&setup.env, "2ef4f49fdd8fa9dc463f1f06a094c26b88710990");
    setup
        .token_stellar
        .mint(&setup.grogu, &(1_000_000 * 10_000_000));
    let id = setup.contract.register(
        &setup.grogu,
        &name,
        &maintainers,
        &url,
        &ipfs,
        &None,
        &None,
        &None,
    );

    // Create a mock token for token-weighted proposal
    let token_admin = Address::generate(&setup.env);
    let token_contract = setup
        .env
        .register_stellar_asset_contract_v2(token_admin.clone());
    let token_client = token::StellarAssetClient::new(&setup.env, &token_contract.address());
    token_client.mint(&setup.mando, &(1_000 * 10_000_000));
    token_client.mint(&rex, &(500 * 10_000_000));

    let title = String::from_str(&setup.env, "Token Weighted Proposal");
    let prop_ipfs = String::from_str(
        &setup.env,
        "bafybeib6ioupho3p3pliusx7tgs7dvi6mpu2bwfhayj6w6ie44lo3vvc4i",
    );
    let voting_ends_at = setup.env.ledger().timestamp() + 3600 * 24 * 7;

    // Grogu proposes (as maintainer).
    let proposal_id = setup.contract.create_proposal(
        &setup.grogu,
        &id,
        &title,
        &prop_ipfs,
        &voting_ends_at,
        &true,
        &Some(token_contract.address()),
        &None,
    );

    // 3 maintainers, threshold 66% -> required quorum = (3 * 66 + 99) / 100 = 2.
    // Mando votes with 1000 tokens (weight 1000). Total maintainers voted = 1 < 2.
    setup.contract.vote(
        &setup.mando,
        &id,
        &proposal_id,
        &Vote::PublicVote(PublicVote {
            address: setup.mando.clone(),
            weight: 1000,
            vote_choice: VoteChoice::Approve,
        }),
    );

    let err = setup
        .contract
        .try_execute(&setup.mando, &id, &proposal_id, &None, &None)
        .unwrap_err()
        .unwrap();
    assert_eq!(err, ContractErrors::ProposalVotingTime.into());

    let quorum_time = setup.env.ledger().timestamp();
    // Rex votes with 500 tokens -> second maintainer reached (2/3 maintainers >= quorum)!
    setup.contract.vote(
        &rex,
        &id,
        &proposal_id,
        &Vote::PublicVote(PublicVote {
            address: rex.clone(),
            weight: 500,
            vote_choice: VoteChoice::Approve,
        }),
    );

    // Wait out shortened delay
    setup
        .env
        .ledger()
        .set_timestamp(quorum_time + TIMELOCK_DELAY / 2);
    let result = setup
        .contract
        .execute(&setup.mando, &id, &proposal_id, &None, &None);
    assert_eq!(result, ProposalStatus::Approved);
}

#[test]
fn early_finalization_anonymous_proposal_flow() {
    let setup = create_test_data();
    let id = init_contract(&setup);
    setup
        .token_stellar
        .mint(&setup.contract_admin, &(100 * 10_000_000));
    setup.contract.anonymous_voting_setup(
        &setup.grogu,
        &id,
        &String::from_str(&setup.env, "test_pubkey"),
    );

    let title = String::from_str(&setup.env, "Anonymous Quorum Proposal");
    let ipfs = String::from_str(
        &setup.env,
        "bafybeib6ioupho3p3pliusx7tgs7dvi6mpu2bwfhayj6w6ie44lo3vvc4i",
    );
    let voting_ends_at = setup.env.ledger().timestamp() + 3600 * 24 * 7;

    let proposal_id = setup.contract.create_proposal(
        &setup.contract_admin,
        &id,
        &title,
        &ipfs,
        &voting_ends_at,
        &false,
        &None,
        &None,
    );

    let seed = U256::from_u32(&setup.env, 1);
    let commitments = setup.contract.build_commitments_from_votes(
        &id,
        &vec![&setup.env, 1u128, 0u128, 0u128],
        &vec![&setup.env, seed.clone(), seed.clone(), seed.clone()],
    );

    // Mando votes anonymously
    setup.contract.vote(
        &setup.mando,
        &id,
        &proposal_id,
        &Vote::AnonymousVote(AnonymousVote {
            address: setup.mando.clone(),
            weight: 1,
            encrypted_seeds: vec![
                &setup.env,
                String::from_str(&setup.env, "1"),
                String::from_str(&setup.env, "1"),
                String::from_str(&setup.env, "1"),
            ],
            encrypted_votes: vec![
                &setup.env,
                String::from_str(&setup.env, "1"),
                String::from_str(&setup.env, "0"),
                String::from_str(&setup.env, "0"),
            ],
            commitments: commitments.clone(),
        }),
    );

    let quorum_time = setup.env.ledger().timestamp();
    // Grogu votes anonymously
    setup.contract.vote(
        &setup.grogu,
        &id,
        &proposal_id,
        &Vote::AnonymousVote(AnonymousVote {
            address: setup.grogu.clone(),
            weight: 1,
            encrypted_seeds: vec![
                &setup.env,
                String::from_str(&setup.env, "1"),
                String::from_str(&setup.env, "1"),
                String::from_str(&setup.env, "1"),
            ],
            encrypted_votes: vec![
                &setup.env,
                String::from_str(&setup.env, "1"),
                String::from_str(&setup.env, "0"),
                String::from_str(&setup.env, "0"),
            ],
            commitments: commitments.clone(),
        }),
    );

    // Wait shortened delay
    setup
        .env
        .ledger()
        .set_timestamp(quorum_time + TIMELOCK_DELAY / 2);

    let tallies = vec![&setup.env, 2u128, 0u128, 0u128];
    let sum_seed = U256::from_u32(&setup.env, 2);
    let seeds = vec![&setup.env, sum_seed.clone(), sum_seed.clone(), sum_seed];

    let result = setup.contract.execute(
        &setup.mando,
        &id,
        &proposal_id,
        &Some(tallies),
        &Some(seeds),
    );
    assert_eq!(result, ProposalStatus::Approved);
}

#[test]
fn early_finalization_ballot_does_not_underflow_when_voting_after_early_quorum() {
    let setup = create_test_data();
    let id = init_contract(&setup);
    setup
        .token_stellar
        .mint(&setup.contract_admin, &(100 * 10_000_000));

    let title = String::from_str(&setup.env, "Underflow Test Proposal");
    let ipfs = String::from_str(
        &setup.env,
        "bafybeib6ioupho3p3pliusx7tgs7dvi6mpu2bwfhayj6w6ie44lo3vvc4i",
    );
    // 30-day voting window
    let voting_ends_at = setup.env.ledger().timestamp() + 3600 * 24 * 30;

    let proposal_id = setup.contract.create_proposal(
        &setup.contract_admin,
        &id,
        &title,
        &ipfs,
        &voting_ends_at,
        &true,
        &None,
        &None,
    );

    // Maintainers mando and grogu vote on day 1 -> reaches quorum
    setup.contract.vote(
        &setup.mando,
        &id,
        &proposal_id,
        &Vote::PublicVote(PublicVote {
            address: setup.mando.clone(),
            weight: 1,
            vote_choice: VoteChoice::Approve,
        }),
    );
    setup.contract.vote(
        &setup.grogu,
        &id,
        &proposal_id,
        &Vote::PublicVote(PublicVote {
            address: setup.grogu.clone(),
            weight: 1,
            vote_choice: VoteChoice::Approve,
        }),
    );

    // Advance 20 days: early execution unlocked long ago (at day 1 + 12h),
    // but voting is still open until day 30.
    setup
        .env
        .ledger()
        .set_timestamp(setup.env.ledger().timestamp() + 3600 * 24 * 20);

    // Non-maintainer voter casts a vote on day 20.
    // This MUST NOT underflow when computing temporary ballot ledgers!
    let late_voter = Address::generate(&setup.env);
    setup.contract.add_member(
        &late_voter,
        &String::from_str(&setup.env, "late_meta"),
        &None,
        &None,
        &None,
    );
    setup
        .contract
        .set_badges(&setup.mando, &id, &late_voter, &vec![&setup.env, Badge::Community]);
    setup.contract.vote(
        &late_voter,
        &id,
        &proposal_id,
        &Vote::PublicVote(PublicVote {
            address: late_voter.clone(),
            weight: 1,
            vote_choice: VoteChoice::Approve,
        }),
    );
}

#[test]
fn early_finalization_maintainer_set_change_edge_cases() {
    let setup = create_test_data();
    let id = init_contract(&setup);
    setup
        .token_stellar
        .mint(&setup.contract_admin, &(100 * 10_000_000));

    let title = String::from_str(&setup.env, "Maintainer Dynamics Proposal");
    let ipfs = String::from_str(
        &setup.env,
        "bafybeib6ioupho3p3pliusx7tgs7dvi6mpu2bwfhayj6w6ie44lo3vvc4i",
    );
    let voting_ends_at = setup.env.ledger().timestamp() + 3600 * 24 * 7;

    let proposal_id = setup.contract.create_proposal(
        &setup.contract_admin,
        &id,
        &title,
        &ipfs,
        &voting_ends_at,
        &true,
        &None,
        &None,
    );

    // Member bob votes
    let bob = Address::generate(&setup.env);
    setup.contract.add_member(
        &bob,
        &String::from_str(&setup.env, "bob_meta"),
        &None,
        &None,
        &None,
    );
    setup
        .contract
        .set_badges(&setup.mando, &id, &bob, &vec![&setup.env, Badge::Community]);
    setup.contract.vote(
        &bob,
        &id,
        &proposal_id,
        &Vote::PublicVote(PublicVote {
            address: bob.clone(),
            weight: 1,
            vote_choice: VoteChoice::Approve,
        }),
    );

    // Mando and grogu vote -> reaches quorum (2/2)
    setup.contract.vote(
        &setup.mando,
        &id,
        &proposal_id,
        &Vote::PublicVote(PublicVote {
            address: setup.mando.clone(),
            weight: 1,
            vote_choice: VoteChoice::Approve,
        }),
    );
    let quorum_time = setup.env.ledger().timestamp();
    setup.contract.vote(
        &setup.grogu,
        &id,
        &proposal_id,
        &Vote::PublicVote(PublicVote {
            address: setup.grogu.clone(),
            weight: 1,
            vote_choice: VoteChoice::Approve,
        }),
    );

    // Now promote Bob to maintainer in project config
    let url = String::from_str(&setup.env, "github.com/tansu");
    let reg_ipfs = String::from_str(&setup.env, "2ef4f49fdd8fa9dc463f1f06a094c26b88710990");
    let expanded_maintainers = vec![
        &setup.env,
        setup.grogu.clone(),
        setup.mando.clone(),
        bob.clone(),
    ];
    setup.contract.update_config(
        &setup.grogu,
        &id,
        &expanded_maintainers,
        &url,
        &reg_ipfs,
        &None,
        &None,
        &None,
    );

    // Maintainer mando removes Bob's vote.
    // Because Bob was NOT in the proposal's maintainers snapshot, removing Bob's vote
    // must NOT decrement MaintainerVotes or clear QuorumReachedAt!
    setup
        .contract
        .remove_vote(&setup.mando, &id, &proposal_id, &bob);

    // Quorum is still reached: advancing past shortened window allows execution
    setup
        .env
        .ledger()
        .set_timestamp(quorum_time + TIMELOCK_DELAY / 2);
    let result = setup
        .contract
        .execute(&setup.mando, &id, &proposal_id, &None, &None);
    assert_eq!(result, ProposalStatus::Approved);
}

#[test]
fn early_finalization_promoted_maintainer_does_not_count_on_existing_proposal() {
    let setup = create_test_data();
    let id = init_contract(&setup);
    setup
        .token_stellar
        .mint(&setup.contract_admin, &(100 * 10_000_000));

    let title = String::from_str(&setup.env, "Promoted Maintainer Proposal");
    let ipfs = String::from_str(
        &setup.env,
        "bafybeib6ioupho3p3pliusx7tgs7dvi6mpu2bwfhayj6w6ie44lo3vvc4i",
    );
    let voting_ends_at = setup.env.ledger().timestamp() + 3600 * 24 * 7;

    // Proposal created with snapshot maintainers: [grogu, mando]. Required = 2.
    let proposal_id = setup.contract.create_proposal(
        &setup.contract_admin,
        &id,
        &title,
        &ipfs,
        &voting_ends_at,
        &true,
        &None,
        &None,
    );

    // Promote new maintainer 'alice' in project
    let alice = Address::generate(&setup.env);
    setup.contract.add_member(
        &alice,
        &String::from_str(&setup.env, "alice_meta"),
        &None,
        &None,
        &None,
    );
    let url = String::from_str(&setup.env, "github.com/tansu");
    let reg_ipfs = String::from_str(&setup.env, "2ef4f49fdd8fa9dc463f1f06a094c26b88710990");
    let new_maintainers = vec![
        &setup.env,
        setup.grogu.clone(),
        setup.mando.clone(),
        alice.clone(),
    ];
    setup.contract.update_config(
        &setup.grogu,
        &id,
        &new_maintainers,
        &url,
        &reg_ipfs,
        &None,
        &None,
        &None,
    );

    // Mando votes (1 snapshot maintainer)
    setup.contract.vote(
        &setup.mando,
        &id,
        &proposal_id,
        &Vote::PublicVote(PublicVote {
            address: setup.mando.clone(),
            weight: 1,
            vote_choice: VoteChoice::Approve,
        }),
    );

    // Alice votes (maintainer now, but NOT in proposal snapshot)
    setup.contract.vote(
        &alice,
        &id,
        &proposal_id,
        &Vote::PublicVote(PublicVote {
            address: alice.clone(),
            weight: 1,
            vote_choice: VoteChoice::Approve,
        }),
    );

    // Execution fails: Alice does not count towards snapshot quorum, so only 1/2 voted
    let err = setup
        .contract
        .try_execute(&setup.mando, &id, &proposal_id, &None, &None)
        .unwrap_err()
        .unwrap();
    assert_eq!(err, ContractErrors::ProposalVotingTime.into());

    let quorum_time = setup.env.ledger().timestamp();
    // Grogu votes (in snapshot) -> reaches 2/2 snapshot quorum!
    setup.contract.vote(
        &setup.grogu,
        &id,
        &proposal_id,
        &Vote::PublicVote(PublicVote {
            address: setup.grogu.clone(),
            weight: 1,
            vote_choice: VoteChoice::Approve,
        }),
    );

    // Shortened delay allows execution
    setup
        .env
        .ledger()
        .set_timestamp(quorum_time + TIMELOCK_DELAY / 2);
    let result = setup
        .contract
        .execute(&setup.mando, &id, &proposal_id, &None, &None);
    assert_eq!(result, ProposalStatus::Approved);
}

#[test]
fn early_finalization_pre_upgrade_proposal_without_snapshot_requires_normal_deadline() {
    let setup = create_test_data();
    let id = init_contract(&setup);
    setup
        .token_stellar
        .mint(&setup.contract_admin, &(100 * 10_000_000));

    let title = String::from_str(&setup.env, "Pre-upgrade Proposal");
    let ipfs = String::from_str(
        &setup.env,
        "bafybeib6ioupho3p3pliusx7tgs7dvi6mpu2bwfhayj6w6ie44lo3vvc4i",
    );
    let voting_ends_at = setup.env.ledger().timestamp() + 3600 * 24 * 7;

    let proposal_id = setup.contract.create_proposal(
        &setup.contract_admin,
        &id,
        &title,
        &ipfs,
        &voting_ends_at,
        &true,
        &None,
        &None,
    );

    // Simulate pre-upgrade proposal by clearing snapshot keys
    setup.env.as_contract(&setup.contract_id, || {
        let key = setup.env.crypto().keccak256(&id.to_bytes()).into();
        setup.env.storage().persistent().remove(&types::ProjectKey::ProposalMaintainers(key, proposal_id));
        let key2 = setup.env.crypto().keccak256(&id.to_bytes()).into();
        setup.env.storage().persistent().remove(&types::ProjectKey::ProposalQuorumCount(key2, proposal_id));
    });

    // Both maintainers vote
    setup.contract.vote(
        &setup.mando,
        &id,
        &proposal_id,
        &Vote::PublicVote(PublicVote {
            address: setup.mando.clone(),
            weight: 1,
            vote_choice: VoteChoice::Approve,
        }),
    );
    setup.contract.vote(
        &setup.grogu,
        &id,
        &proposal_id,
        &Vote::PublicVote(PublicVote {
            address: setup.grogu.clone(),
            weight: 1,
            vote_choice: VoteChoice::Approve,
        }),
    );

    // Shortened window passes: execute MUST FAIL because pre-upgrade proposals lack snapshot
    setup
        .env
        .ledger()
        .set_timestamp(setup.env.ledger().timestamp() + TIMELOCK_DELAY / 2);
    let err = setup
        .contract
        .try_execute(&setup.mando, &id, &proposal_id, &None, &None)
        .unwrap_err()
        .unwrap();
    assert_eq!(err, ContractErrors::ProposalVotingTime.into());

    // Normal window passes: execution succeeds
    setup
        .env
        .ledger()
        .set_timestamp(voting_ends_at + TIMELOCK_DELAY);
    let result = setup
        .contract
        .execute(&setup.mando, &id, &proposal_id, &None, &None);
    assert_eq!(result, ProposalStatus::Approved);
}
