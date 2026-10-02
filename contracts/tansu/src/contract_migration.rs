use soroban_sdk::{Address, Bytes, Env, Vec, contractimpl, contracttype, token};

use crate::contract_dao::MAX_PROPOSALS_PER_PAGE;
use crate::{MigrationTrait, Tansu, TansuArgs, TansuClient, types};

/// Deposits of the contract that ran before v3: a proposal held 100 XLM and
/// each vote 10 XLM.
const LEGACY_PROPOSAL_COLLATERAL: i128 = 100 * 10_000_000;
const LEGACY_VOTE_COLLATERAL: i128 = 10 * 10_000_000;

#[contracttype]
enum LegacyKey {
    CollateralContract,
}

#[contractimpl]
impl MigrationTrait for Tansu {
    /// Move what the contract running on mainnet before v3 stored under other
    /// keys to the layout of v3, in one call that either does everything or
    /// nothing: the collateral becomes an address, the anonymous voting
    /// configurations of the given projects move to persistent storage, and
    /// their proposals move to one entry each, with their votes. An active
    /// proposal is cancelled and its deposits returned at the old amounts, to
    /// the proposer and to each voter.
    ///
    /// Members and the fields of proposals need no migration: a struct read
    /// from storage takes `None` for an optional field the old data lacks.
    ///
    /// A second call fails on the first read, before any payment.
    ///
    /// # Arguments
    /// * `env` - The environment object
    /// * `admin` - An admin address
    /// * `project_keys` - Every project with proposals or an anonymous voting configuration
    ///
    /// # Panics
    /// * If the admin is not authorized
    /// * If the data is not in the old layout
    fn migrate(env: Env, admin: Address, project_keys: Vec<Bytes>) {
        crate::contract_tansu::auth_admin(&env, &admin);

        let instance = env.storage().instance();
        let storage = env.storage().persistent();

        let collateral: types::ContractRef = instance
            .get(&LegacyKey::CollateralContract)
            .expect("Migration");
        instance.remove(&LegacyKey::CollateralContract);
        instance.set(&types::ContractKey::Collateral, &collateral.address);

        let token = token::TokenClient::new(&env, &collateral.address);
        for project_key in project_keys {
            let config_key = types::ProjectKey::AnonymousVoteConfig(project_key.clone());
            if let Some(config) = instance.get::<_, types::AnonymousVoteConfig>(&config_key) {
                instance.remove(&config_key);
                storage.set(&config_key, &config);
            }

            let total: u32 = storage
                .get(&types::ProjectKey::DaoTotalProposals(project_key.clone()))
                .unwrap_or(0);
            for page in 0..total.div_ceil(MAX_PROPOSALS_PER_PAGE) {
                let page_key = types::ProjectKey::Dao(project_key.clone(), page);
                let dao: types::Dao = storage.get(&page_key).expect("Migration");

                let mut ids = Vec::new(&env);
                for mut proposal in dao.proposals {
                    let active = proposal.status == types::ProposalStatus::Active;
                    if active {
                        token.transfer(
                            &env.current_contract_address(),
                            &proposal.proposer,
                            &LEGACY_PROPOSAL_COLLATERAL,
                        );
                    }

                    let mut voters = Vec::new(&env);
                    for vote in proposal.vote_data.votes {
                        let voter = match &vote {
                            types::Vote::PublicVote(vote) => vote.address.clone(),
                            types::Vote::AnonymousVote(vote) => vote.address.clone(),
                        };
                        if active {
                            token.transfer(
                                &env.current_contract_address(),
                                &voter,
                                &LEGACY_VOTE_COLLATERAL,
                            );
                        }
                        storage.set(
                            &types::ProjectKey::Vote(
                                project_key.clone(),
                                proposal.id,
                                voter.clone(),
                            ),
                            &vote,
                        );
                        voters.push_back(voter);
                    }
                    storage.set(
                        &types::ProjectKey::Voters(project_key.clone(), proposal.id),
                        &voters,
                    );

                    proposal.vote_data.votes = Vec::new(&env);
                    if active {
                        proposal.status = types::ProposalStatus::Cancelled;
                    }
                    storage.set(
                        &types::ProjectKey::Proposal(project_key.clone(), proposal.id),
                        &proposal,
                    );
                    ids.push_back(proposal.id);
                }
                storage.set(&page_key, &ids);
            }
        }
    }
}
