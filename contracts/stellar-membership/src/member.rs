use crate::{
    MemberTrait, StellarMembership, StellarMembershipArgs, StellarMembershipClient, events,
    storage, types,
};
use soroban_sdk::{Address, Env, String, Vec, contractimpl};

#[contractimpl]
impl MemberTrait for StellarMembership {
    fn member(e: &Env, token_id: u32) -> types::Member {
        storage::member(e, token_id)
    }

    fn token_by_account(e: &Env, provider: types::Provider, id: String) -> Option<u32> {
        e.storage()
            .persistent()
            .get(&types::MemberKey::Account(provider, id))
    }

    fn set_role(e: &Env, token_id: u32, role: types::Role) {
        storage::admin(e).require_auth();

        let mut member = storage::member(e, token_id);
        member.role = role;
        storage::save_member(e, token_id, &member);
        storage::extend_instance(e);

        events::RoleSet { token_id, role }.publish(e);
    }

    fn set_external_accounts(e: &Env, token_id: u32, external_accounts: types::ExternalAccounts) {
        storage::owner(e, token_id).require_auth();
        storage::attester(e).require_auth();

        storage::validate_accounts(e, &external_accounts);

        let mut member = storage::member(e, token_id);
        storage::unbind_accounts(e, &member.external_accounts);
        storage::bind_accounts(e, token_id, &external_accounts);
        member.external_accounts = external_accounts.clone();
        storage::save_member(e, token_id, &member);
        storage::extend_instance(e);

        events::ExternalAccountsSet {
            token_id,
            external_accounts,
        }
        .publish(e);
    }

    fn set_bio(e: &Env, caller: Address, token_id: u32, bio: String) {
        storage::auth_owner_or_admin(e, &caller, token_id);
        storage::validate_bio(e, &bio);

        let mut member = storage::member(e, token_id);
        member.bio = bio.clone();
        storage::save_member(e, token_id, &member);
        storage::extend_instance(e);

        events::BioSet { token_id, bio }.publish(e);
    }

    fn set_projects(e: &Env, caller: Address, token_id: u32, projects: Vec<String>) {
        storage::auth_owner_or_admin(e, &caller, token_id);
        storage::validate_projects(e, &projects);

        let mut member = storage::member(e, token_id);
        member.projects = projects.clone();
        storage::save_member(e, token_id, &member);
        storage::extend_instance(e);

        events::ProjectsSet { token_id, projects }.publish(e);
    }
}
