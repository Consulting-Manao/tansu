use soroban_sdk::testutils::{MockAuth, MockAuthInvoke};
use soroban_sdk::{IntoVal, String, vec};

use super::utils::*;
use crate::errors::MembershipError;
use crate::{events, types};

#[test]
fn test_set_role() {
    let setup = create_test_data();
    let e = &setup.env;
    let token_id = mint(&setup, &setup.grogu, "1");

    setup.contract.set_role(&token_id, &types::Role::Navigator);
    assert_events(
        &setup,
        &[&events::RoleSet {
            token_id,
            role: types::Role::Navigator,
        }],
    );
    assert_authorized(
        &setup,
        &setup.admin,
        "set_role",
        args(e, (token_id, types::Role::Navigator)),
    );
    assert_eq!(
        setup.contract.member(&token_id).role,
        types::Role::Navigator
    );

    let err = setup
        .contract
        .try_set_role(&42, &types::Role::Pilot)
        .unwrap_err()
        .unwrap();
    assert_eq!(err, MembershipError::NonExistentToken.into());
}

#[test]
fn test_set_role_admin_only() {
    let setup = create_test_data();
    let e = &setup.env;
    let token_id = mint(&setup, &setup.grogu, "1");

    for address in [&setup.grogu, &setup.attester] {
        e.mock_auths(&[MockAuth {
            address,
            invoke: &MockAuthInvoke {
                contract: &setup.contract_id,
                fn_name: "set_role",
                args: (token_id, types::Role::Pilot).into_val(e),
                sub_invokes: &[],
            },
        }]);
        assert!(
            setup
                .contract
                .try_set_role(&token_id, &types::Role::Pilot)
                .is_err()
        );
    }
}

#[test]
fn test_set_bio_and_projects() {
    let setup = create_test_data();
    let e = &setup.env;
    let token_id = mint(&setup, &setup.grogu, "1");

    let new_bio = String::from_str(e, "bafynewbio");
    setup.contract.set_bio(&setup.grogu, &token_id, &new_bio);
    assert_events(
        &setup,
        &[&events::BioSet {
            token_id,
            bio: new_bio.clone(),
        }],
    );
    assert_authorized(
        &setup,
        &setup.grogu,
        "set_bio",
        args(e, (setup.grogu.clone(), token_id, new_bio.clone())),
    );

    // replaced, not appended
    let new_projects = projects(e, 1);
    setup
        .contract
        .set_projects(&setup.grogu, &token_id, &new_projects);
    assert_events(
        &setup,
        &[&events::ProjectsSet {
            token_id,
            projects: new_projects.clone(),
        }],
    );

    let member = setup.contract.member(&token_id);
    assert_eq!(member.bio, new_bio);
    assert_eq!(member.projects, new_projects);

    // the admin can moderate
    setup
        .contract
        .set_bio(&setup.admin, &token_id, &String::from_str(e, ""));
    setup
        .contract
        .set_projects(&setup.admin, &token_id, &projects(e, 0));
    let member = setup.contract.member(&token_id);
    assert_eq!(member.bio, String::from_str(e, ""));
    assert_eq!(member.projects.len(), 0);

    let err = setup
        .contract
        .try_set_projects(
            &setup.grogu,
            &token_id,
            &projects(e, types::MAX_PROJECTS + 1),
        )
        .unwrap_err()
        .unwrap();
    assert_eq!(err, MembershipError::TooManyProjects.into());
}

#[test]
fn test_set_bio_unauthorized() {
    let setup = create_test_data();
    let e = &setup.env;
    let token_id = mint(&setup, &setup.grogu, "1");
    mint(&setup, &setup.mando, "2");

    // another member, even when authenticated
    let err = setup
        .contract
        .try_set_bio(&setup.mando, &token_id, &bio(e))
        .unwrap_err()
        .unwrap();
    assert_eq!(err, MembershipError::UnauthorizedSigner.into());
    let err = setup
        .contract
        .try_set_projects(&setup.attester, &token_id, &projects(e, 1))
        .unwrap_err()
        .unwrap();
    assert_eq!(err, MembershipError::UnauthorizedSigner.into());

    // the owner without signing
    e.mock_auths(&[]);
    assert!(
        setup
            .contract
            .try_set_bio(&setup.grogu, &token_id, &bio(e))
            .is_err()
    );
}

#[test]
fn test_set_external_accounts() {
    let setup = create_test_data();
    let e = &setup.env;
    let token_id = mint(&setup, &setup.grogu, "1");

    // keep Discord, change GitHub, add X
    let new_accounts = types::ExternalAccounts {
        accounts: vec![
            e,
            account(e, types::Provider::Discord, &discord_id("1"), "grogu"),
            account(e, types::Provider::Github, "99", "grogu-new"),
            account(e, types::Provider::X, "77", "grogu_x"),
        ],
        email_hash: None,
    };
    setup
        .contract
        .set_external_accounts(&token_id, &new_accounts);
    assert_events(
        &setup,
        &[&events::ExternalAccountsSet {
            token_id,
            external_accounts: new_accounts.clone(),
        }],
    );
    assert_authorized(
        &setup,
        &setup.grogu,
        "set_external_accounts",
        args(e, (token_id, new_accounts.clone())),
    );
    assert_authorized(
        &setup,
        &setup.attester,
        "set_external_accounts",
        args(e, (token_id, new_accounts.clone())),
    );

    assert_eq!(
        setup.contract.member(&token_id).external_accounts,
        new_accounts
    );
    let by_account = |provider: types::Provider, id: &str| {
        setup
            .contract
            .token_by_account(&provider, &String::from_str(e, id))
    };
    assert_eq!(
        by_account(types::Provider::Discord, &discord_id("1")),
        Some(token_id)
    );
    assert_eq!(by_account(types::Provider::Github, "1"), None);
    assert_eq!(by_account(types::Provider::Github, "99"), Some(token_id));
    assert_eq!(by_account(types::Provider::X, "77"), Some(token_id));

    // the released account can be used by someone else
    let mando_accounts = types::ExternalAccounts {
        accounts: vec![e, account(e, types::Provider::Github, "1", "mando")],
        email_hash: None,
    };
    mint_with(&setup, &mando_accounts);

    // clearing every account
    let empty = types::ExternalAccounts {
        accounts: vec![e],
        email_hash: None,
    };
    setup.contract.set_external_accounts(&token_id, &empty);
    assert_eq!(by_account(types::Provider::Discord, &discord_id("1")), None);
}

fn mint_with(setup: &TestSetup, external_accounts: &types::ExternalAccounts) -> u32 {
    setup.contract.mint(
        &setup.mando,
        &types::Role::Verified,
        external_accounts,
        &bio(&setup.env),
        &projects(&setup.env, 0),
    )
}

#[test]
fn test_set_external_accounts_bound_elsewhere() {
    let setup = create_test_data();
    let e = &setup.env;
    let token_id = mint(&setup, &setup.grogu, "1");
    mint(&setup, &setup.mando, "2");

    let err = setup
        .contract
        .try_set_external_accounts(&token_id, &accounts(e, "2"))
        .unwrap_err()
        .unwrap();
    assert_eq!(err, MembershipError::AccountAlreadyBound.into());
}

#[test]
fn test_set_external_accounts_requires_both_auths() {
    let setup = create_test_data();
    let e = &setup.env;
    let token_id = mint(&setup, &setup.grogu, "1");
    let new_accounts = accounts(e, "3");

    for address in [&setup.grogu, &setup.attester] {
        e.mock_auths(&[MockAuth {
            address,
            invoke: &MockAuthInvoke {
                contract: &setup.contract_id,
                fn_name: "set_external_accounts",
                args: (token_id, new_accounts.clone()).into_val(e),
                sub_invokes: &[],
            },
        }]);
        assert!(
            setup
                .contract
                .try_set_external_accounts(&token_id, &new_accounts)
                .is_err()
        );
    }
}
