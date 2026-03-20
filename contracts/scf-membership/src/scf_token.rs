//! SCF Membership NFT

use crate::{
    SCFMembership, SCFMembershipArgs, SCFMembershipClient, SCFTokenTrait, errors, events, types,
};
use soroban_sdk::{Address, Bytes, BytesN, Env, String, contractimpl, panic_with_error};

#[contractimpl]
impl SCFTokenTrait for SCFMembership {
    fn __constructor(e: &Env, admin: Address, name: String, symbol: String, uri: String) {
        e.storage().instance().set(&types::DataKey::Admin, &admin);

        e.storage().instance().set(&types::DataKey::Name, &name);
        e.storage().instance().set(&types::DataKey::Symbol, &symbol);
        e.storage().instance().set(&types::DataKey::Uri, &uri);

        e.storage()
            .instance()
            .set(&types::DataKey::NextTokenId, &0u32);
    }

    fn upgrade(e: &Env, wasm_hash: BytesN<32>) {
        let admin: Address = e.storage().instance().get(&types::DataKey::Admin).unwrap();
        admin.require_auth();

        e.deployer().update_current_contract_wasm(wasm_hash.clone());
    }

    fn mint(e: &Env, to: Address) -> u32 {
        let admin: Address = e.storage().instance().get(&types::DataKey::Admin).unwrap();
        admin.require_auth();

        let token_id: u32 = e
            .storage()
            .instance()
            .get(&types::DataKey::NextTokenId)
            .unwrap();

        e.storage()
            .instance()
            .set(&types::DataKey::NextTokenId, &(token_id + 1));

        events::Mint { to, token_id }.publish(e);

        token_id
    }

    fn clawback(e: &Env, token_id: u32) {
        let admin: Address = e.storage().instance().get(&types::DataKey::Admin).unwrap();
        admin.require_auth();

        let from = Self::owner_of(e, token_id);
        let to = admin.clone();

        e.storage()
            .persistent()
            .set(&types::NFTStorageKey::Owner(token_id), &to);

        let from_balance = Self::balance(e, from.clone());
        e.storage().persistent().set(
            &types::NFTStorageKey::Balance(from.clone()),
            &(from_balance - 1),
        );
        let to_balance = Self::balance(e, to.clone());
        e.storage().persistent().set(
            &types::NFTStorageKey::Balance(to.clone()),
            &(to_balance + 1),
        );
    }

    fn balance(e: &Env, owner: Address) -> u32 {
        e.storage()
            .persistent()
            .get(&types::NFTStorageKey::Balance(owner))
            .unwrap_or(0u32)
    }

    fn owner_of(e: &Env, token_id: u32) -> Address {
        // Token exists, now check if it has an owner
        e.storage()
            .persistent()
            .get(&types::NFTStorageKey::Owner(token_id))
            .unwrap_or_else(|| panic_with_error!(e, errors::NonFungibleTokenError::TokenNotClaimed))
    }

    fn name(e: &Env) -> String {
        e.storage().instance().get(&types::DataKey::Name).unwrap()
    }

    fn symbol(e: &Env) -> String {
        e.storage().instance().get(&types::DataKey::Symbol).unwrap()
    }

    fn token_uri(e: &Env, token_id: u32) -> String {
        let base_uri: String = e.storage().instance().get(&types::DataKey::Uri).unwrap();

        // Construct Uri: {base_uri}/{token_id}
        let mut uri_bytes = Bytes::new(e);
        uri_bytes.append(&Bytes::from(base_uri));
        uri_bytes.append(&Bytes::from_slice(e, b"/"));
        uri_bytes.append(&crate::u32_to_decimal_bytes(e, token_id));

        String::from(uri_bytes)
    }
}
