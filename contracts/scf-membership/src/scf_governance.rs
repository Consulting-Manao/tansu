//! SCF Governance

use crate::{SCFGovernanceTrait, SCFMembership, SCFMembershipArgs, SCFMembershipClient};
use soroban_sdk::{Env, String, Vec, contractimpl};

#[contractimpl]
impl SCFGovernanceTrait for SCFMembership {
    fn get_trait_value(e: &Env, token_id: u32, trait_key: String) -> i128 {
        todo!()
    }

    fn get_trait_values(e: &Env, token_id: u32, trait_keys: Vec<String>) -> Vec<i128> {
        todo!()
    }

    fn set_trait(e: &Env, token_id: u32, trait_key: String, new_value: i128) {
        todo!()
    }

    fn get_trait_metadata_uri(e: &Env) -> String {
        todo!()
    }
}
