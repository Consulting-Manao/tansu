use soroban_sdk::testutils::Address as _;
use soroban_sdk::{Address, String, vec};

use super::utils::*;
use crate::errors::MembershipError;
use crate::types;

#[test]
fn test_governance() {
    let setup = create_test_data();
    let e = &setup.env;
    let role_key = String::from_str(e, "role");
    let nqg_key = String::from_str(e, "nqg");
    let trait_keys = vec![e, role_key.clone(), nqg_key.clone()];

    // no NQG score
    let mando_id = mint(&setup, &setup.mando, "2");
    assert_eq!(
        setup.contract.trait_values(&mando_id, &trait_keys),
        vec![e, 0, 0]
    );
    assert_eq!(
        setup.contract.token_uri(&mando_id),
        String::from_str(e, "ipfs://abcd/0")
    );

    let grogu_id = mint(&setup, &setup.grogu, "1");
    setup.contract.set_role(&grogu_id, &types::Role::Pilot);

    assert_eq!(
        setup.contract.token_uri(&grogu_id),
        String::from_str(e, "ipfs://abcd/3")
    );
    assert_eq!(setup.contract.trait_value(&grogu_id, &role_key), 3);
    assert_eq!(setup.contract.trait_value(&grogu_id, &nqg_key), 10_000_000);
    assert_eq!(
        setup.contract.trait_values(&grogu_id, &trait_keys),
        vec![e, 3, 10_000_000]
    );
    assert_eq!(
        setup.contract.governance(&grogu_id),
        types::Governance {
            role: types::Role::Pilot,
            nqg: 10_000_000
        }
    );

    // NQG is keyed by address upstream
    setup.contract.rotate_key(&grogu_id, &Address::generate(e));
    assert_eq!(setup.contract.trait_value(&grogu_id, &nqg_key), 0);
}

#[test]
fn test_governance_errors() {
    let setup = create_test_data();
    let e = &setup.env;
    let token_id = mint(&setup, &setup.grogu, "1");

    let err = setup
        .contract
        .try_trait_value(&token_id, &String::from_str(e, "unknown"))
        .unwrap_err()
        .unwrap();
    assert_eq!(err, MembershipError::TraitDoesNotExist.into());

    for key in ["role", "nqg"] {
        let err = setup
            .contract
            .try_trait_value(&42, &String::from_str(e, key))
            .unwrap_err()
            .unwrap();
        assert_eq!(err, MembershipError::NonExistentToken.into());
    }

    let err = setup.contract.try_token_uri(&42).unwrap_err().unwrap();
    assert_eq!(err, MembershipError::NonExistentToken.into());
    let err = setup.contract.try_member(&42).unwrap_err().unwrap();
    assert_eq!(err, MembershipError::NonExistentToken.into());
    let err = setup.contract.try_owner_of(&42).unwrap_err().unwrap();
    assert_eq!(err, MembershipError::NonExistentToken.into());
}
