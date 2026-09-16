use soroban_sdk::testutils::{Address as _, Ledger, MockAuth, MockAuthInvoke};
use soroban_sdk::{Address, IntoVal};

use super::utils::*;
use crate::errors::MembershipError;
use crate::{events, types};

#[test]
fn test_recovery_after_delay() {
    let setup = create_test_data();
    let e = &setup.env;
    let token_id = mint(&setup, &setup.grogu, "1");
    let member = setup.contract.member(&token_id);
    let new_key = Address::generate(e);

    setup.contract.propose_recovery(&token_id, &new_key);
    let executable_at = 1_000 + types::RECOVERY_DELAY;
    assert_events(
        &setup,
        &[&events::RecoveryProposed {
            token_id,
            new_address: new_key.clone(),
            executable_at,
        }],
    );
    assert_authorized(
        &setup,
        &setup.attester,
        "propose_recovery",
        args(e, (token_id, new_key.clone())),
    );
    assert_authorized(
        &setup,
        &new_key,
        "propose_recovery",
        args(e, (token_id, new_key.clone())),
    );
    assert_eq!(
        setup.contract.recovery(&token_id),
        Some(types::RecoveryRequest {
            new_address: new_key.clone(),
            executable_at,
        })
    );

    // the current key keeps the token during the delay
    assert_eq!(setup.contract.owner_of(&token_id), setup.grogu);
    e.ledger().set_timestamp(executable_at - 1);
    e.mock_auths(&[]);
    assert!(setup.contract.try_finalize_recovery(&token_id).is_err());

    // anyone can finalize once the delay elapsed
    e.ledger().set_timestamp(executable_at);
    setup.contract.finalize_recovery(&token_id);
    assert!(e.auths().is_empty());
    assert_events(
        &setup,
        &[&events::Recovered {
            token_id,
            from: Some(setup.grogu.clone()),
            to: new_key.clone(),
        }],
    );

    assert_eq!(setup.contract.owner_of(&token_id), new_key);
    assert_eq!(setup.contract.token_of(&setup.grogu), None);
    assert_eq!(setup.contract.recovery(&token_id), None);
    assert_eq!(setup.contract.member(&token_id), member);

    let err = setup
        .contract
        .try_finalize_recovery(&token_id)
        .unwrap_err()
        .unwrap();
    assert_eq!(err, MembershipError::NoRecovery.into());
}

#[test]
fn test_propose_recovery_requires_both_auths() {
    let setup = create_test_data();
    let e = &setup.env;
    let token_id = mint(&setup, &setup.grogu, "1");
    let new_key = Address::generate(e);

    // an attester alone cannot direct a token to an address it does not
    // control, and nobody can propose without the attester
    for address in [&setup.attester, &new_key, &setup.admin] {
        e.mock_auths(&[MockAuth {
            address,
            invoke: &MockAuthInvoke {
                contract: &setup.contract_id,
                fn_name: "propose_recovery",
                args: (token_id, new_key.clone()).into_val(e),
                sub_invokes: &[],
            },
        }]);
        assert!(
            setup
                .contract
                .try_propose_recovery(&token_id, &new_key)
                .is_err()
        );
    }
}

#[test]
fn test_propose_recovery_errors() {
    let setup = create_test_data();
    let e = &setup.env;
    let token_id = mint(&setup, &setup.grogu, "1");
    mint(&setup, &setup.mando, "2");
    let new_key = Address::generate(e);

    let err = setup
        .contract
        .try_propose_recovery(&42, &new_key)
        .unwrap_err()
        .unwrap();
    assert_eq!(err, MembershipError::NonExistentToken.into());

    let err = setup
        .contract
        .try_propose_recovery(&token_id, &setup.mando)
        .unwrap_err()
        .unwrap();
    assert_eq!(err, MembershipError::MemberAlreadyExist.into());

    setup.contract.propose_recovery(&token_id, &new_key);
    let err = setup
        .contract
        .try_propose_recovery(&token_id, &Address::generate(e))
        .unwrap_err()
        .unwrap();
    assert_eq!(err, MembershipError::RecoveryPending.into());
}

#[test]
fn test_cancel_recovery() {
    let setup = create_test_data();
    let e = &setup.env;
    let token_id = mint(&setup, &setup.grogu, "1");
    let attacker = Address::generate(e);

    for caller in [&setup.grogu, &setup.admin] {
        setup.contract.propose_recovery(&token_id, &attacker);
        setup.contract.cancel_recovery(caller, &token_id);
        assert_events(&setup, &[&events::RecoveryCancelled { token_id }]);
        assert_authorized(
            &setup,
            caller,
            "cancel_recovery",
            args(e, (caller.clone(), token_id)),
        );
        assert_eq!(setup.contract.recovery(&token_id), None);
    }

    let err = setup
        .contract
        .try_cancel_recovery(&setup.grogu, &token_id)
        .unwrap_err()
        .unwrap();
    assert_eq!(err, MembershipError::NoRecovery.into());

    // neither the attester nor the proposed address can cancel
    setup.contract.propose_recovery(&token_id, &attacker);
    for caller in [&setup.attester, &attacker] {
        let err = setup
            .contract
            .try_cancel_recovery(caller, &token_id)
            .unwrap_err()
            .unwrap();
        assert_eq!(err, MembershipError::UnauthorizedSigner.into());
    }

    e.ledger().set_timestamp(1_000 + types::RECOVERY_DELAY);
    setup.contract.cancel_recovery(&setup.grogu, &token_id);
    let err = setup
        .contract
        .try_finalize_recovery(&token_id)
        .unwrap_err()
        .unwrap();
    assert_eq!(err, MembershipError::NoRecovery.into());
}

#[test]
fn test_finalize_recovery_target_became_member() {
    let setup = create_test_data();
    let token_id = mint(&setup, &setup.grogu, "1");

    setup.contract.propose_recovery(&token_id, &setup.mando);
    mint(&setup, &setup.mando, "2");

    setup
        .env
        .ledger()
        .set_timestamp(1_000 + types::RECOVERY_DELAY);
    let err = setup
        .contract
        .try_finalize_recovery(&token_id)
        .unwrap_err()
        .unwrap();
    assert_eq!(err, MembershipError::MemberAlreadyExist.into());
}

#[test]
fn test_admin_approves_recovery_early() {
    let setup = create_test_data();
    let e = &setup.env;
    let token_id = mint(&setup, &setup.grogu, "1");
    let new_key = Address::generate(e);

    setup.contract.propose_recovery(&token_id, &new_key);
    setup.contract.finalize_recovery(&token_id);
    assert_events(
        &setup,
        &[&events::Recovered {
            token_id,
            from: Some(setup.grogu.clone()),
            to: new_key.clone(),
        }],
    );
    assert_authorized(
        &setup,
        &setup.admin,
        "finalize_recovery",
        args(e, (token_id,)),
    );

    assert_eq!(setup.contract.owner_of(&token_id), new_key);
    assert_eq!(setup.contract.token_of(&setup.grogu), None);
    assert_eq!(setup.contract.recovery(&token_id), None);
}

#[test]
fn test_early_finalize_requires_admin() {
    let setup = create_test_data();
    let e = &setup.env;
    let token_id = mint(&setup, &setup.grogu, "1");
    let new_key = Address::generate(e);
    setup.contract.propose_recovery(&token_id, &new_key);

    for address in [&setup.attester, &new_key, &setup.grogu] {
        e.mock_auths(&[MockAuth {
            address,
            invoke: &MockAuthInvoke {
                contract: &setup.contract_id,
                fn_name: "finalize_recovery",
                args: (token_id,).into_val(e),
                sub_invokes: &[],
            },
        }]);
        assert!(setup.contract.try_finalize_recovery(&token_id).is_err());
    }
}

#[test]
fn test_admin_recover() {
    let setup = create_test_data();
    let e = &setup.env;
    let token_id = mint(&setup, &setup.grogu, "1");
    let proposed = Address::generate(e);
    let new_key = Address::generate(e);

    // a direct move supersedes a pending recovery
    setup.contract.propose_recovery(&token_id, &proposed);
    setup.contract.recover(&token_id, &new_key);
    assert_events(
        &setup,
        &[&events::Recovered {
            token_id,
            from: Some(setup.grogu.clone()),
            to: new_key.clone(),
        }],
    );
    assert_authorized(
        &setup,
        &setup.admin,
        "recover",
        args(e, (token_id, new_key.clone())),
    );
    assert_authorized(
        &setup,
        &new_key,
        "recover",
        args(e, (token_id, new_key.clone())),
    );

    assert_eq!(setup.contract.owner_of(&token_id), new_key);
    assert_eq!(setup.contract.token_of(&setup.grogu), None);
    assert_eq!(setup.contract.recovery(&token_id), None);
}

#[test]
fn test_recover_requires_admin_and_new_address() {
    let setup = create_test_data();
    let e = &setup.env;
    let token_id = mint(&setup, &setup.grogu, "1");
    let new_key = Address::generate(e);

    for address in [&setup.admin, &new_key, &setup.attester] {
        e.mock_auths(&[MockAuth {
            address,
            invoke: &MockAuthInvoke {
                contract: &setup.contract_id,
                fn_name: "recover",
                args: (token_id, new_key.clone()).into_val(e),
                sub_invokes: &[],
            },
        }]);
        assert!(setup.contract.try_recover(&token_id, &new_key).is_err());
    }
}

#[test]
fn test_recover_errors() {
    let setup = create_test_data();
    let token_id = mint(&setup, &setup.grogu, "1");
    mint(&setup, &setup.mando, "2");

    let err = setup
        .contract
        .try_recover(&42, &setup.attester)
        .unwrap_err()
        .unwrap();
    assert_eq!(err, MembershipError::NonExistentToken.into());

    let err = setup
        .contract
        .try_recover(&token_id, &setup.mando)
        .unwrap_err()
        .unwrap();
    assert_eq!(err, MembershipError::MemberAlreadyExist.into());
}
