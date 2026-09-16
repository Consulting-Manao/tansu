use crate::{
    GovernanceTrait, StellarMembership, StellarMembershipArgs, StellarMembershipClient, errors,
    storage, types,
};
use soroban_sdk::{
    Env, I256, InvokeError, String, Symbol, Vec, contractimpl, panic_with_error, vec,
};

#[contractimpl]
impl GovernanceTrait for StellarMembership {
    fn trait_value(e: &Env, token_id: u32, trait_key: String) -> i128 {
        if trait_key == String::from_str(e, "role") {
            storage::member(e, token_id).role as i128
        } else if trait_key == String::from_str(e, "nqg") {
            get_nqg(e, token_id)
        } else {
            panic_with_error!(e, errors::MembershipError::TraitDoesNotExist)
        }
    }

    fn trait_values(e: &Env, token_id: u32, trait_keys: Vec<String>) -> Vec<i128> {
        let mut values = Vec::new(e);
        for trait_key in trait_keys.iter() {
            values.push_back(Self::trait_value(e, token_id, trait_key));
        }
        values
    }

    fn trait_metadata_uri(e: &Env) -> String {
        e.storage()
            .instance()
            .get(&types::DataKey::UriTrait)
            .unwrap()
    }

    fn governance(e: &Env, token_id: u32) -> types::Governance {
        types::Governance {
            role: storage::member(e, token_id).role,
            nqg: get_nqg(e, token_id),
        }
    }
}

/// NQG score of the current owner, scaled to 6 decimals. 0 if unavailable.
fn get_nqg(e: &Env, token_id: u32) -> i128 {
    let owner = storage::owner(e, token_id);

    let nqg_contract_address = e
        .storage()
        .instance()
        .get(&types::DataKey::NqgContract)
        .unwrap();
    let r = e.try_invoke_contract::<I256, InvokeError>(
        &nqg_contract_address,
        &Symbol::new(e, "get_voting_power_for_user"),
        vec![e, owner.to_string().to_val()],
    );
    let nqg: I256 = match r {
        Ok(Ok(v)) => v,
        _ => I256::from_i128(e, 0),
    };
    let scaled = nqg.div(&I256::from_i128(e, 10_i128.pow(12)));
    scaled.to_i128().unwrap()
}
