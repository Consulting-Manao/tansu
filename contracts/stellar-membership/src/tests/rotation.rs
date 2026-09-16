use soroban_sdk::testutils::{Address as _, MockAuth, MockAuthInvoke};
use soroban_sdk::{Address, IntoVal};

use super::utils::*;
use crate::errors::MembershipError;
use crate::events;

#[test]
fn test_rotate_key() {
    let setup = create_test_data();
    let e = &setup.env;
    let token_id = mint(&setup, &setup.grogu, "1");
    let member = setup.contract.member(&token_id);
    let new_key = Address::generate(e);

    setup.contract.rotate_key(&token_id, &new_key);
    assert_events(
        &setup,
        &[&events::KeyRotated {
            token_id,
            from: setup.grogu.clone(),
            to: new_key.clone(),
        }],
    );
    assert_authorized(
        &setup,
        &setup.grogu,
        "rotate_key",
        args(e, (token_id, new_key.clone())),
    );
    assert_authorized(
        &setup,
        &new_key,
        "rotate_key",
        args(e, (token_id, new_key.clone())),
    );

    // same identity, new key
    assert_eq!(setup.contract.owner_of(&token_id), new_key);
    assert_eq!(setup.contract.token_of(&new_key), Some(token_id));
    assert_eq!(setup.contract.token_of(&setup.grogu), None);
    assert_eq!(setup.contract.balance(&setup.grogu), 0);
    assert_eq!(setup.contract.member(&token_id), member);

    // the old key can onboard as a different person
    let other = mint(&setup, &setup.grogu, "2");
    assert_eq!(other, 1);
}

#[test]
fn test_rotate_key_requires_both_auths() {
    let setup = create_test_data();
    let e = &setup.env;
    let token_id = mint(&setup, &setup.grogu, "1");
    let new_key = Address::generate(e);

    for address in [&setup.grogu, &new_key] {
        e.mock_auths(&[MockAuth {
            address,
            invoke: &MockAuthInvoke {
                contract: &setup.contract_id,
                fn_name: "rotate_key",
                args: (token_id, new_key.clone()).into_val(e),
                sub_invokes: &[],
            },
        }]);
        assert!(setup.contract.try_rotate_key(&token_id, &new_key).is_err());
    }
}

#[test]
fn test_rotate_key_errors() {
    let setup = create_test_data();
    let token_id = mint(&setup, &setup.grogu, "1");
    mint(&setup, &setup.mando, "2");

    let err = setup
        .contract
        .try_rotate_key(&token_id, &setup.mando)
        .unwrap_err()
        .unwrap();
    assert_eq!(err, MembershipError::MemberAlreadyExist.into());

    let err = setup
        .contract
        .try_rotate_key(&token_id, &setup.grogu)
        .unwrap_err()
        .unwrap();
    assert_eq!(err, MembershipError::MemberAlreadyExist.into());

    let err = setup
        .contract
        .try_rotate_key(&42, &setup.attester)
        .unwrap_err()
        .unwrap();
    assert_eq!(err, MembershipError::NonExistentToken.into());

    setup.contract.revoke(&token_id);
    let err = setup
        .contract
        .try_rotate_key(&token_id, &setup.attester)
        .unwrap_err()
        .unwrap();
    assert_eq!(err, MembershipError::TokenRevoked.into());
}

#[test]
fn test_rotate_key_cancels_recovery() {
    let setup = create_test_data();
    let e = &setup.env;
    let token_id = mint(&setup, &setup.grogu, "1");
    let attacker = Address::generate(e);
    let new_key = Address::generate(e);

    setup.contract.propose_recovery(&token_id, &attacker);
    setup.contract.rotate_key(&token_id, &new_key);
    assert_events(
        &setup,
        &[
            &events::RecoveryCancelled { token_id },
            &events::KeyRotated {
                token_id,
                from: setup.grogu.clone(),
                to: new_key.clone(),
            },
        ],
    );
    assert_eq!(setup.contract.recovery(&token_id), None);
}
