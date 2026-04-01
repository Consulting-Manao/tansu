use soroban_sdk::{Address, Env, String, testutils::Address as _, vec};

use crate::{SCFMembership, SCFMembershipClient, errors, types};

mod nqg {
    use super::*;
    use soroban_sdk::{I256, contract, contractimpl};

    #[contract]
    pub struct Mock;
    #[contractimpl]
    impl Mock {
        pub fn get_voting_power_for_user(e: &Env, _user: String) -> I256 {
            I256::from_i32(e, 10)
        }
    }
}

fn create_client<'a>(e: &Env, admin: &Address) -> SCFMembershipClient<'a> {
    let nqg_id = e.register(nqg::Mock, ());

    let address = e.register(
        SCFMembership,
        (
            admin,
            &String::from_str(e, "TestNFT"),
            &String::from_str(e, "TNFT"),
            &String::from_str(e, "ipfs://abcd"),
            &String::from_str(e, "ipfs://wxyz"),
            nqg_id,
        ),
    );
    SCFMembershipClient::new(e, &address)
}

#[test]
fn test_metadata() {
    let e = Env::default();
    e.mock_all_auths();

    let admin = Address::generate(&e);
    let client = create_client(&e, &admin);

    let name = client.name();
    assert_eq!(name, String::from_str(&e, "TestNFT"));

    let symbol = client.symbol();
    assert_eq!(symbol, String::from_str(&e, "TNFT"));

    let token_uri = client.trait_metadata_uri();
    assert_eq!(token_uri, String::from_str(&e, "ipfs://wxyz"));
}

#[test]
fn test_lifecycle() {
    let e = Env::default();
    e.mock_all_auths();

    let admin = Address::generate(&e);
    let member = Address::generate(&e);
    let client = create_client(&e, &admin);

    let err = client.try_owner_of(&0u32).unwrap_err().unwrap();
    assert_eq!(err, errors::NonFungibleTokenError::NonExistentToken.into());

    let token_id = client.mint(&member);
    assert_eq!(token_id, 0u32);

    // Verify ownership
    let owner = client.owner_of(&token_id);
    assert_eq!(owner, member);

    let claimant_balance = client.balance(&member);
    assert_eq!(claimant_balance, 1u32,);

    // Verify clawback
    client.clawback(&token_id);
    let claimant_balance = client.balance(&member);
    assert_eq!(claimant_balance, 0u32,);
    let owner = client.owner_of(&token_id);
    assert_eq!(owner, admin);

    let token_uri = client.token_uri(&0);
    assert_eq!(token_uri, String::from_str(&e, "ipfs://abcd/0"));
}

#[test]
fn test_governance() {
    let e = Env::default();
    e.mock_all_auths();

    let admin = Address::generate(&e);
    let member = Address::generate(&e);
    let client = create_client(&e, &admin);

    let token_id = client.mint(&member);

    let role_key = String::from_str(&e, "role");
    let nqg_key = String::from_str(&e, "nqg");

    let trait_keys = vec![&e, role_key, nqg_key];
    let governance = client.trait_values(&token_id, &trait_keys);

    assert_eq!(
        governance,
        types::Governance {
            role: types::Role::Verified,
            nqg: 10
        }
    );
}
