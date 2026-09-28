use super::test_utils::{create_test_data, init_contract};
use crate::{
    Tansu,
    errors::ContractErrors,
    types::{OutcomeContract, ProposalStatus, PublicVote, Vote, VoteChoice},
};
use soroban_sdk::auth::{ContractContext, InvokerContractAuthEntry, SubContractInvocation};
use soroban_sdk::testutils::{Address as _, Ledger, MockAuth, MockAuthInvoke};
use soroban_sdk::{
    Address, Bytes, Env, IntoVal, String, Symbol, Val, Vec, contract, contractimpl, symbol_short,
    token, vec,
};

const IPFS: &str = "bafybeib6ioupho3p3pliusx7tgs7dvi6mpu2bwfhayj6w6ie44lo3vvc4i";

/// A contract that only its owner may call, like a registry for its manager.
#[contract]
pub struct Owned;

#[contractimpl]
impl Owned {
    pub fn __constructor(env: Env, owner: Address) {
        env.storage()
            .instance()
            .set(&symbol_short!("owner"), &owner);
    }

    pub fn set_value(env: Env, value: u32) {
        let owner: Address = env
            .storage()
            .instance()
            .get(&symbol_short!("owner"))
            .unwrap();
        owner.require_auth();
        env.storage()
            .instance()
            .set(&symbol_short!("value"), &value);
    }

    pub fn value(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&symbol_short!("value"))
            .unwrap_or(0)
    }
}

/// A manager contract, maintainer of a project, that pre-authorizes the
/// outcome of a proposal before executing it, as the registry manager does.
#[contract]
pub struct Manager;

#[contractimpl]
impl Manager {
    pub fn trigger(env: Env, tansu: Address, project_key: Bytes, proposal_id: u32) {
        let proposal =
            crate::TansuClient::new(&env, &tansu).get_proposal(&project_key, &proposal_id);
        let outcome = proposal.outcome_contracts.unwrap().get(0).unwrap();
        env.authorize_as_current_contract(vec![
            &env,
            InvokerContractAuthEntry::Contract(SubContractInvocation {
                context: ContractContext {
                    contract: outcome.address,
                    fn_name: outcome.execute_fn,
                    args: outcome.args,
                },
                sub_invocations: Vec::new(&env),
            }),
        ]);
        crate::TansuClient::new(&env, &tansu).execute(
            &env.current_contract_address(),
            &project_key,
            &proposal_id,
            &None,
            &None,
        );
    }
}

fn public_approve(voter: &Address) -> Vote {
    Vote::PublicVote(PublicVote {
        address: voter.clone(),
        weight: 1,
        vote_choice: VoteChoice::Approve,
    })
}

#[test]
fn outcome_cannot_spend_tansu_collateral() {
    let setup = create_test_data();
    let env = &setup.env;
    let key = init_contract(&setup);
    let collateral = setup.token_stellar.address.clone();
    let tansu_balance = token::TokenClient::new(env, &collateral).balance(&setup.contract_id);
    assert!(tansu_balance > 0);

    let receiver = Address::generate(env);
    let outcome = OutcomeContract {
        address: collateral.clone(),
        execute_fn: Symbol::new(env, "transfer"),
        args: vec![
            env,
            setup.contract_id.clone().into_val(env),
            receiver.clone().into_val(env),
            tansu_balance.into_val(env),
        ],
    };
    // No vote: only the proposer's abstain, so the result is Cancelled.
    let ends = env.ledger().timestamp() + 2 * 24 * 3600;
    let empty = OutcomeContract {
        address: collateral.clone(),
        execute_fn: Symbol::new(env, "decimals"),
        args: Vec::<Val>::new(env),
    };
    let proposal_id = setup.contract.create_proposal(
        &setup.grogu,
        &key,
        &String::from_str(env, "Spend the collateral"),
        &String::from_str(env, IPFS),
        &ends,
        &true,
        &None,
        &Some(vec![env, empty.clone(), empty, outcome]),
    );
    let held = token::TokenClient::new(env, &collateral).balance(&setup.contract_id);
    env.ledger().set_timestamp(ends + 24 * 3600 + 1);

    // Only the maintainer's call to execute is authorized: nothing else is
    // mocked, so Tansu's own authority is all the outcome could use.
    let err = setup
        .contract
        .mock_auths(&[MockAuth {
            address: &setup.grogu,
            invoke: &MockAuthInvoke {
                contract: &setup.contract_id,
                fn_name: "execute",
                args: (
                    setup.grogu.clone(),
                    key.clone(),
                    proposal_id,
                    None::<Vec<u128>>,
                    None::<Vec<u128>>,
                )
                    .into_val(env),
                sub_invokes: &[],
            },
        }])
        .try_execute(&setup.grogu, &key, &proposal_id, &None, &None)
        .unwrap_err()
        .unwrap();
    assert_eq!(err, ContractErrors::OutcomeError.into());
    assert_eq!(
        token::TokenClient::new(env, &collateral).balance(&setup.contract_id),
        held
    );
    assert_eq!(
        token::TokenClient::new(env, &collateral).balance(&receiver),
        0
    );
}

#[test]
fn manager_authorization_reaches_the_target_through_the_executor() {
    let setup = create_test_data();
    let env = &setup.env;
    let key = init_contract(&setup);

    let manager = env.register(Manager, ());
    let owned = env.register(Owned, (&manager,));
    setup.contract.update_config(
        &setup.grogu,
        &key,
        &vec![env, manager.clone()],
        &String::from_str(env, "github.com/tansu"),
        &String::from_str(env, IPFS),
        &None,
        &None,
        &None,
    );

    let outcome = OutcomeContract {
        address: owned.clone(),
        execute_fn: Symbol::new(env, "set_value"),
        args: vec![env, 42u32.into_val(env)],
    };
    let ends = env.ledger().timestamp() + 2 * 24 * 3600;
    let proposal_id = setup.contract.create_proposal(
        &setup.grogu,
        &key,
        &String::from_str(env, "Set the value"),
        &String::from_str(env, IPFS),
        &ends,
        &true,
        &None,
        &Some(vec![env, outcome]),
    );
    setup.contract.vote(
        &setup.mando,
        &key,
        &proposal_id,
        &public_approve(&setup.mando),
    );
    env.ledger().set_timestamp(ends + 24 * 3600 + 1);

    // The trigger carries no authorization of its own.
    ManagerClient::new(env, &manager).set_auths(&[]).trigger(
        &setup.contract_id,
        &key,
        &proposal_id,
    );

    assert_eq!(OwnedClient::new(env, &owned).value(), 42);
    assert_eq!(
        setup.contract.get_proposal(&key, &proposal_id).status,
        ProposalStatus::Approved
    );
}

#[test]
#[should_panic(expected = "Error(Contract, #602)")]
fn constructor_requires_a_stellar_asset_collateral() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let executor = env.register(tansu_executor::TansuExecutor, ());
    let not_an_asset = env.register(Owned, (&admin,));

    env.register(Tansu, (&admin, &not_an_asset, &executor));
}

#[test]
fn set_executor_is_admin_only() {
    let setup = create_test_data();
    let env = &setup.env;
    let executor = env.register(tansu_executor::TansuExecutor, ());

    let err = setup
        .contract
        .try_set_executor(&setup.grogu, &executor)
        .unwrap_err()
        .unwrap();
    assert_eq!(err, ContractErrors::UnauthorizedSigner.into());

    setup
        .contract
        .set_executor(&setup.contract_admin, &executor);
}
