#![allow(clippy::too_many_arguments)]

use crate::{
    StellarMembership, StellarMembershipArgs, StellarMembershipClient, TokenTrait, events, storage,
    types,
};
use soroban_sdk::{
    Address, Bytes, BytesN, ContractExecutable, Env, IntoVal, String, Val, Vec, contractimpl,
};

#[contractimpl]
impl TokenTrait for StellarMembership {
    fn __constructor(
        e: &Env,
        admin: Address,
        attester: Address,
        name: String,
        symbol: String,
        uri: String,
        uri_trait: String,
        nqg_contract: Address,
    ) {
        let instance = e.storage().instance();
        instance.set(&types::DataKey::Admin, &admin);
        instance.set(&types::DataKey::Attester, &attester);
        instance.set(&types::DataKey::Name, &name);
        instance.set(&types::DataKey::Symbol, &symbol);
        instance.set(&types::DataKey::Uri, &uri);
        instance.set(&types::DataKey::UriTrait, &uri_trait);
        instance.set(&types::DataKey::NqgContract, &nqg_contract);
        instance.set(&types::DataKey::NextTokenId, &0u32);
        storage::extend_instance(e);
    }

    fn upgrade(e: &Env, wasm_hash: BytesN<32>) {
        storage::admin(e).require_auth();

        e.deployer()
            .update_current_contract(ContractExecutable::Wasm(wasm_hash));
    }

    fn set_attester(e: &Env, attester: Address) {
        storage::admin(e).require_auth();

        e.storage()
            .instance()
            .set(&types::DataKey::Attester, &attester);
        storage::extend_instance(e);

        events::AttesterSet { attester }.publish(e);
    }

    fn admin(e: &Env) -> Address {
        storage::admin(e)
    }

    fn attester(e: &Env) -> Address {
        storage::attester(e)
    }

    fn mint(
        e: &Env,
        to: Address,
        role: types::Role,
        external_accounts: types::ExternalAccounts,
        bio: String,
        projects: Vec<String>,
    ) -> u32 {
        to.require_auth();
        let attested: Vec<Val> = (to.clone(), role, external_accounts.clone()).into_val(e);
        storage::attester(e).require_auth_for_args(attested);

        storage::validate_accounts(e, &external_accounts);
        storage::validate_bio(e, &bio);
        storage::validate_projects(e, &projects);

        let token_id = Self::next_token_id(e);
        e.storage()
            .instance()
            .set(&types::DataKey::NextTokenId, &(token_id + 1));
        storage::extend_instance(e);

        storage::set_owner(e, token_id, None, &to);
        storage::bind_accounts(e, token_id, &external_accounts);
        storage::save_member(
            e,
            token_id,
            &types::Member {
                status: types::Status::Active,
                role,
                external_accounts: external_accounts.clone(),
                bio: bio.clone(),
                projects: projects.clone(),
            },
        );

        events::Minted {
            token_id,
            to,
            role,
            external_accounts,
            bio,
            projects,
        }
        .publish(e);

        token_id
    }

    fn revoke(e: &Env, token_id: u32) {
        storage::admin(e).require_auth();

        let from = storage::owner(e, token_id);
        let mut member = storage::member(e, token_id);

        storage::cancel_recovery(e, token_id);
        storage::remove_owner(e, token_id, &from);
        member.status = types::Status::Revoked;
        storage::save_member(e, token_id, &member);
        storage::extend_instance(e);

        events::Revoked { token_id, from }.publish(e);
    }

    fn balance(e: &Env, owner: Address) -> u32 {
        storage::token_of(e, &owner).map_or(0, |_| 1)
    }

    fn owner_of(e: &Env, token_id: u32) -> Address {
        storage::owner(e, token_id)
    }

    fn token_of(e: &Env, owner: Address) -> Option<u32> {
        storage::token_of(e, &owner)
    }

    fn name(e: &Env) -> String {
        e.storage().instance().get(&types::DataKey::Name).unwrap()
    }

    fn symbol(e: &Env) -> String {
        e.storage().instance().get(&types::DataKey::Symbol).unwrap()
    }

    fn token_uri(e: &Env, token_id: u32) -> String {
        let base_uri: String = e.storage().instance().get(&types::DataKey::Uri).unwrap();
        let role = storage::member(e, token_id).role;

        // Construct Uri: {base_uri}/{role}, roles are single digits
        let mut uri_bytes = Bytes::from(base_uri);
        uri_bytes.append(&Bytes::from_slice(e, &[b'/', b'0' + role as u8]));

        String::from(uri_bytes)
    }

    fn next_token_id(e: &Env) -> u32 {
        e.storage()
            .instance()
            .get(&types::DataKey::NextTokenId)
            .unwrap()
    }
}
