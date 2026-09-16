use soroban_sdk::testutils::Address as _;
use soroban_sdk::{Address, String};

use super::utils::*;
use crate::errors::MembershipError;
use crate::{events, types};

#[test]
fn test_revoke() {
    let setup = create_test_data();
    let e = &setup.env;
    let token_id = mint(&setup, &setup.grogu, "1");
    let attacker = Address::generate(e);
    setup.contract.propose_recovery(&token_id, &attacker);

    setup.contract.revoke(&token_id);
    assert_events(
        &setup,
        &[
            &events::RecoveryCancelled { token_id },
            &events::Revoked {
                token_id,
                from: setup.grogu.clone(),
            },
        ],
    );
    assert_authorized(&setup, &setup.admin, "revoke", args(e, (token_id,)));

    // the record is kept for audit, the address is released
    let member = setup.contract.member(&token_id);
    assert_eq!(member.status, types::Status::Revoked);
    assert_eq!(setup.contract.token_of(&setup.grogu), None);
    assert_eq!(setup.contract.balance(&setup.grogu), 0);
    assert_eq!(setup.contract.recovery(&token_id), None);
    let err = setup.contract.try_owner_of(&token_id).unwrap_err().unwrap();
    assert_eq!(err, MembershipError::TokenRevoked.into());
    let err = setup
        .contract
        .try_governance(&token_id)
        .unwrap_err()
        .unwrap();
    assert_eq!(err, MembershipError::TokenRevoked.into());

    // the external accounts stay bound: no new identity with them
    assert_eq!(
        setup.contract.token_by_account(
            &types::Provider::Discord,
            &String::from_str(e, &discord_id("1"))
        ),
        Some(token_id)
    );
    let err = setup
        .contract
        .try_mint(
            &setup.grogu,
            &types::Role::Verified,
            &accounts(e, "1"),
            &bio(e),
            &projects(e, 0),
        )
        .unwrap_err()
        .unwrap();
    assert_eq!(err, MembershipError::AccountAlreadyBound.into());

    // no owner operation on a revoked token
    let err = setup
        .contract
        .try_set_bio(&setup.grogu, &token_id, &bio(e))
        .unwrap_err()
        .unwrap();
    assert_eq!(err, MembershipError::TokenRevoked.into());
    let err = setup
        .contract
        .try_propose_recovery(&token_id, &attacker)
        .unwrap_err()
        .unwrap();
    assert_eq!(err, MembershipError::TokenRevoked.into());

    let err = setup.contract.try_revoke(&token_id).unwrap_err().unwrap();
    assert_eq!(err, MembershipError::TokenRevoked.into());
}

#[test]
fn test_revoke_admin_only() {
    let setup = create_test_data();
    let token_id = mint(&setup, &setup.grogu, "1");

    setup.env.mock_auths(&[]);
    assert!(setup.contract.try_revoke(&token_id).is_err());

    let err = {
        setup.env.mock_all_auths();
        setup.contract.try_revoke(&42).unwrap_err().unwrap()
    };
    assert_eq!(err, MembershipError::NonExistentToken.into());
}

#[test]
fn test_recover_reinstates_revoked() {
    let setup = create_test_data();
    let e = &setup.env;
    let token_id = mint(&setup, &setup.grogu, "1");
    setup.contract.revoke(&token_id);

    let new_key = Address::generate(e);
    setup.contract.recover(&token_id, &new_key);
    assert_events(
        &setup,
        &[&events::Recovered {
            token_id,
            from: None,
            to: new_key.clone(),
        }],
    );

    assert_eq!(setup.contract.owner_of(&token_id), new_key);
    assert_eq!(
        setup.contract.member(&token_id).status,
        types::Status::Active
    );
}
