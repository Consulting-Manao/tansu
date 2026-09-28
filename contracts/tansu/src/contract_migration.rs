use soroban_sdk::{Address, Bytes, Env, TryFromVal, Val, Vec, contractimpl};

use crate::{MigrationTrait, Tansu, TansuArgs, TansuClient, types};

/// Proposals per page, as `contract_dao` pages them.
const MAX_PROPOSALS_PER_PAGE: u32 = 9;

#[contractimpl]
impl MigrationTrait for Tansu {
    /// Store the collateral as the address the constructor now sets, in place
    /// of the `ContractRef` an earlier admin call stored.
    fn migrate_collateral(env: Env, admin: Address) {
        crate::contract_tansu::auth_admin(&env, &admin);

        let collateral: types::ContractRef = env
            .storage()
            .instance()
            .get(&types::ContractKey::Collateral)
            .expect("Migration");
        env.storage()
            .instance()
            .set(&types::ContractKey::Collateral, &collateral.address);
    }

    /// Move the proposals of each project out of their pages, which held a
    /// `Dao`, into one entry each; a page then keeps only the ids. A page
    /// already holding ids is left as it is, so a project can be given again.
    fn migrate_proposals(env: Env, admin: Address, project_keys: Vec<Bytes>) {
        crate::contract_tansu::auth_admin(&env, &admin);

        let storage = env.storage().persistent();
        for project_key in project_keys {
            let total: u32 = storage
                .get(&types::ProjectKey::DaoTotalProposals(project_key.clone()))
                .unwrap_or(0);
            for page in 0..total.div_ceil(MAX_PROPOSALS_PER_PAGE) {
                let page_key = types::ProjectKey::Dao(project_key.clone(), page);
                let Some(page_entry) = storage.get::<_, Val>(&page_key) else {
                    continue;
                };
                let Ok(dao) = types::Dao::try_from_val(&env, &page_entry) else {
                    continue;
                };
                let mut ids = Vec::new(&env);
                for proposal in dao.proposals {
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
