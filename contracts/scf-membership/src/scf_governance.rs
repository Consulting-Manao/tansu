//! SCF Governance

use crate::{
    SCFGovernanceTrait, SCFMembership, SCFMembershipArgs, SCFMembershipClient, SCFTokenTrait,
    errors, types,
};
use soroban_sdk::{Env, String, Vec, contractimpl, panic_with_error, vec};

#[contractimpl]
impl SCFGovernanceTrait for SCFMembership {
    fn get_trait_value(e: &Env, token_id: u32, trait_key: String) -> i128 {
        validate_trait_key(&e, &trait_key);
        if trait_key == String::from_str(&e, "role") {
            let governance: i128 = e
                .storage()
                .persistent()
                .get(&types::NFTStorageKey::Governance(token_id))
                .unwrap_or_else(|| {
                    panic_with_error!(&e, errors::NonFungibleTokenError::NonExistentToken)
                });
            governance
        } else {
            get_nqg(&e, token_id)
        }
    }

    fn get_trait_values(e: &Env, token_id: u32, _trait_keys: Vec<String>) -> Vec<i128> {
        for trait_key in _trait_keys.iter() {
            validate_trait_key(&e, &trait_key);
        }
        let governance: i128 = e
            .storage()
            .persistent()
            .get(&types::NFTStorageKey::Governance(token_id))
            .unwrap_or_else(|| {
                panic_with_error!(&e, errors::NonFungibleTokenError::NonExistentToken)
            });

        vec![&e, governance, get_nqg(&e, token_id)]
    }

    fn set_trait(e: &Env, token_id: u32, trait_key: String, new_value: i128) {
        let role_key = String::from_str(e, "role");
        if trait_key != role_key {
            panic_with_error!(e, errors::NonFungibleTokenError::TraitUnSettable);
        }

        e.storage()
            .persistent()
            .set(&types::NFTStorageKey::Governance(token_id), &new_value);
    }

    fn get_trait_metadata_uri(e: &Env) -> String {
        e.storage()
            .instance()
            .get(&types::DataKey::UriTrait)
            .unwrap()
    }
}

fn validate_trait_key(e: &Env, trait_key: &String) {
    let role_key = String::from_str(e, "role");
    let nqg_key = String::from_str(e, "nqg");
    if trait_key != &role_key && trait_key != &nqg_key {
        panic_with_error!(e, errors::NonFungibleTokenError::TraitDoesNotExist);
    }
}

fn get_nqg(e: &Env, token_id: u32) -> i128 {
    let _owner = SCFMembership::owner_of(&e, token_id);
    // cross-contract call
    1
}
