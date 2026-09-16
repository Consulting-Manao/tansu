use soroban_sdk::testutils::{Address as _, MockAuth, MockAuthInvoke};
use soroban_sdk::{Address, IntoVal, String, vec};

use super::utils::*;
use crate::errors::MembershipError;
use crate::{events, types};

#[test]
fn test_metadata() {
    let setup = create_test_data();

    assert_eq!(
        setup.contract.name(),
        String::from_str(&setup.env, "Stellar Members")
    );
    assert_eq!(
        setup.contract.symbol(),
        String::from_str(&setup.env, "SMBR")
    );
    assert_eq!(
        setup.contract.trait_metadata_uri(),
        String::from_str(&setup.env, "ipfs://wxyz")
    );
    assert_eq!(setup.contract.admin(), setup.admin);
    assert_eq!(setup.contract.attester(), setup.attester);
    assert_eq!(setup.contract.next_token_id(), 0);
}

#[test]
fn test_mint() {
    let setup = create_test_data();
    let e = &setup.env;

    let role = types::Role::Pilot;
    let external_accounts = accounts(e, "1");
    let token_id = setup.contract.mint(
        &setup.grogu,
        &role,
        &external_accounts,
        &bio(e),
        &projects(e, 2),
    );
    assert_eq!(token_id, 0);

    assert_events(
        &setup,
        &[&events::Minted {
            token_id,
            to: setup.grogu.clone(),
            role,
            external_accounts: external_accounts.clone(),
            bio: bio(e),
            projects: projects(e, 2),
        }],
    );

    // the member consents and the attester vouches only for the verified data
    assert_authorized(
        &setup,
        &setup.grogu,
        "mint",
        args(
            e,
            (
                setup.grogu.clone(),
                role,
                external_accounts.clone(),
                bio(e),
                projects(e, 2),
            ),
        ),
    );
    assert_authorized(
        &setup,
        &setup.attester,
        "mint",
        args(e, (setup.grogu.clone(), role, external_accounts.clone())),
    );

    assert_eq!(setup.contract.owner_of(&token_id), setup.grogu);
    assert_eq!(setup.contract.token_of(&setup.grogu), Some(token_id));
    assert_eq!(setup.contract.balance(&setup.grogu), 1);
    assert_eq!(setup.contract.balance(&setup.mando), 0);
    assert_eq!(setup.contract.token_of(&setup.mando), None);
    assert_eq!(setup.contract.next_token_id(), 1);
    assert_eq!(
        setup.contract.member(&token_id),
        types::Member {
            status: types::Status::Active,
            role,
            external_accounts,
            bio: bio(e),
            projects: projects(e, 2),
        }
    );
    assert_eq!(
        setup.contract.token_by_account(
            &types::Provider::Discord,
            &String::from_str(e, &discord_id("1"))
        ),
        Some(token_id)
    );
    assert_eq!(
        setup
            .contract
            .token_by_account(&types::Provider::Github, &String::from_str(e, "1")),
        Some(token_id)
    );
    assert_eq!(
        setup
            .contract
            .token_by_account(&types::Provider::X, &String::from_str(e, "1")),
        None
    );

    let second = mint(&setup, &setup.mando, "2");
    assert_eq!(second, 1);
    assert_eq!(setup.contract.next_token_id(), 2);
}

#[test]
fn test_mint_minimal_profile() {
    let setup = create_test_data();
    let e = &setup.env;

    let external_accounts = types::ExternalAccounts {
        accounts: vec![e, account(e, types::Provider::Discord, "42", "")],
        email_hash: None,
    };
    let token_id = setup.contract.mint(
        &setup.grogu,
        &types::Role::Verified,
        &external_accounts,
        &String::from_str(e, ""),
        &projects(e, 0),
    );
    assert_eq!(
        setup.contract.member(&token_id).external_accounts,
        external_accounts
    );
}

#[test]
fn test_mint_with_exact_auths() {
    let setup = create_test_data();
    let e = &setup.env;
    let external_accounts = accounts(e, "1");

    // control for the negative tests: exactly these two entries are enough
    e.mock_auths(&[
        MockAuth {
            address: &setup.grogu,
            invoke: &MockAuthInvoke {
                contract: &setup.contract_id,
                fn_name: "mint",
                args: (
                    setup.grogu.clone(),
                    types::Role::Verified,
                    external_accounts.clone(),
                    bio(e),
                    projects(e, 2),
                )
                    .into_val(e),
                sub_invokes: &[],
            },
        },
        MockAuth {
            address: &setup.attester,
            invoke: &MockAuthInvoke {
                contract: &setup.contract_id,
                fn_name: "mint",
                args: (
                    setup.grogu.clone(),
                    types::Role::Verified,
                    external_accounts.clone(),
                )
                    .into_val(e),
                sub_invokes: &[],
            },
        },
    ]);
    setup.contract.mint(
        &setup.grogu,
        &types::Role::Verified,
        &external_accounts,
        &bio(e),
        &projects(e, 2),
    );
}

#[test]
fn test_mint_requires_member_auth() {
    let setup = create_test_data();
    let e = &setup.env;
    let external_accounts = accounts(e, "1");

    e.mock_auths(&[MockAuth {
        address: &setup.attester,
        invoke: &MockAuthInvoke {
            contract: &setup.contract_id,
            fn_name: "mint",
            args: (
                setup.grogu.clone(),
                types::Role::Verified,
                external_accounts.clone(),
            )
                .into_val(e),
            sub_invokes: &[],
        },
    }]);
    let result = setup.contract.try_mint(
        &setup.grogu,
        &types::Role::Verified,
        &external_accounts,
        &bio(e),
        &projects(e, 2),
    );
    assert!(result.is_err());
}

#[test]
fn test_mint_requires_attester_auth() {
    let setup = create_test_data();
    let e = &setup.env;
    let external_accounts = accounts(e, "1");
    let full_args = (
        setup.grogu.clone(),
        types::Role::Verified,
        external_accounts.clone(),
        bio(e),
        projects(e, 2),
    );

    // member only
    e.mock_auths(&[MockAuth {
        address: &setup.grogu,
        invoke: &MockAuthInvoke {
            contract: &setup.contract_id,
            fn_name: "mint",
            args: full_args.clone().into_val(e),
            sub_invokes: &[],
        },
    }]);
    let result = setup.contract.try_mint(
        &setup.grogu,
        &types::Role::Verified,
        &external_accounts,
        &bio(e),
        &projects(e, 2),
    );
    assert!(result.is_err());

    // the admin cannot stand in for the attester
    e.mock_auths(&[
        MockAuth {
            address: &setup.grogu,
            invoke: &MockAuthInvoke {
                contract: &setup.contract_id,
                fn_name: "mint",
                args: full_args.clone().into_val(e),
                sub_invokes: &[],
            },
        },
        MockAuth {
            address: &setup.admin,
            invoke: &MockAuthInvoke {
                contract: &setup.contract_id,
                fn_name: "mint",
                args: (
                    setup.grogu.clone(),
                    types::Role::Verified,
                    external_accounts.clone(),
                )
                    .into_val(e),
                sub_invokes: &[],
            },
        },
    ]);
    let result = setup.contract.try_mint(
        &setup.grogu,
        &types::Role::Verified,
        &external_accounts,
        &bio(e),
        &projects(e, 2),
    );
    assert!(result.is_err());
}

#[test]
fn test_mint_rejects_data_not_attested() {
    let setup = create_test_data();
    let e = &setup.env;
    let attested = accounts(e, "1");

    let auths = |role: types::Role, external_accounts: types::ExternalAccounts| {
        [
            (
                setup.grogu.clone(),
                (
                    setup.grogu.clone(),
                    role,
                    external_accounts.clone(),
                    bio(e),
                    projects(e, 2),
                )
                    .into_val(e),
            ),
            (
                setup.attester.clone(),
                (setup.grogu.clone(), types::Role::Verified, attested.clone()).into_val(e),
            ),
        ]
    };

    // role upgraded by the member
    let [member_auth, attester_auth] = auths(types::Role::Pilot, attested.clone());
    e.mock_auths(&[
        MockAuth {
            address: &member_auth.0,
            invoke: &MockAuthInvoke {
                contract: &setup.contract_id,
                fn_name: "mint",
                args: member_auth.1,
                sub_invokes: &[],
            },
        },
        MockAuth {
            address: &attester_auth.0,
            invoke: &MockAuthInvoke {
                contract: &setup.contract_id,
                fn_name: "mint",
                args: attester_auth.1,
                sub_invokes: &[],
            },
        },
    ]);
    let result = setup.contract.try_mint(
        &setup.grogu,
        &types::Role::Pilot,
        &attested,
        &bio(e),
        &projects(e, 2),
    );
    assert!(result.is_err());

    // accounts swapped by the member
    let forged = accounts(e, "2");
    let [member_auth, attester_auth] = auths(types::Role::Verified, forged.clone());
    e.mock_auths(&[
        MockAuth {
            address: &member_auth.0,
            invoke: &MockAuthInvoke {
                contract: &setup.contract_id,
                fn_name: "mint",
                args: member_auth.1,
                sub_invokes: &[],
            },
        },
        MockAuth {
            address: &attester_auth.0,
            invoke: &MockAuthInvoke {
                contract: &setup.contract_id,
                fn_name: "mint",
                args: attester_auth.1,
                sub_invokes: &[],
            },
        },
    ]);
    let result = setup.contract.try_mint(
        &setup.grogu,
        &types::Role::Verified,
        &forged,
        &bio(e),
        &projects(e, 2),
    );
    assert!(result.is_err());
}

#[test]
fn test_mint_old_attester_rejected() {
    let setup = create_test_data();
    let e = &setup.env;

    let new_attester = Address::generate(e);
    setup.contract.set_attester(&new_attester);
    assert_events(
        &setup,
        &[&events::AttesterSet {
            attester: new_attester.clone(),
        }],
    );
    assert_authorized(
        &setup,
        &setup.admin,
        "set_attester",
        args(e, (new_attester.clone(),)),
    );
    assert_eq!(setup.contract.attester(), new_attester);

    let external_accounts = accounts(e, "1");
    e.mock_auths(&[
        MockAuth {
            address: &setup.grogu,
            invoke: &MockAuthInvoke {
                contract: &setup.contract_id,
                fn_name: "mint",
                args: (
                    setup.grogu.clone(),
                    types::Role::Verified,
                    external_accounts.clone(),
                    bio(e),
                    projects(e, 2),
                )
                    .into_val(e),
                sub_invokes: &[],
            },
        },
        MockAuth {
            address: &setup.attester,
            invoke: &MockAuthInvoke {
                contract: &setup.contract_id,
                fn_name: "mint",
                args: (
                    setup.grogu.clone(),
                    types::Role::Verified,
                    external_accounts.clone(),
                )
                    .into_val(e),
                sub_invokes: &[],
            },
        },
    ]);
    let result = setup.contract.try_mint(
        &setup.grogu,
        &types::Role::Verified,
        &external_accounts,
        &bio(e),
        &projects(e, 2),
    );
    assert!(result.is_err());
}

#[test]
fn test_set_attester_admin_only() {
    let setup = create_test_data();
    let e = &setup.env;

    e.mock_auths(&[]);
    let result = setup.contract.try_set_attester(&setup.mando);
    assert!(result.is_err());
}

#[test]
fn test_mint_already_member() {
    let setup = create_test_data();
    mint(&setup, &setup.grogu, "1");

    let err = setup
        .contract
        .try_mint(
            &setup.grogu,
            &types::Role::Verified,
            &accounts(&setup.env, "2"),
            &bio(&setup.env),
            &projects(&setup.env, 0),
        )
        .unwrap_err()
        .unwrap();
    assert_eq!(err, MembershipError::MemberAlreadyExist.into());
}

#[test]
fn test_mint_account_already_bound() {
    let setup = create_test_data();
    let e = &setup.env;
    mint(&setup, &setup.grogu, "1");

    // same Discord account, different GitHub
    let external_accounts = types::ExternalAccounts {
        accounts: vec![
            e,
            account(e, types::Provider::Discord, &discord_id("1"), "grogu"),
            account(e, types::Provider::Github, "2", "mando"),
        ],
        email_hash: None,
    };
    let err = setup
        .contract
        .try_mint(
            &setup.mando,
            &types::Role::Verified,
            &external_accounts,
            &bio(e),
            &projects(e, 0),
        )
        .unwrap_err()
        .unwrap();
    assert_eq!(err, MembershipError::AccountAlreadyBound.into());
}

#[test]
fn test_mint_bounds() {
    let setup = create_test_data();
    let e = &setup.env;
    let long = String::from_str(e, &"a".repeat(129));

    let try_mint = |external_accounts: &types::ExternalAccounts,
                    bio: &String,
                    projects: &soroban_sdk::Vec<String>| {
        setup
            .contract
            .try_mint(
                &setup.grogu,
                &types::Role::Verified,
                external_accounts,
                bio,
                projects,
            )
            .unwrap_err()
            .unwrap()
    };

    let err = try_mint(
        &accounts(e, "1"),
        &bio(e),
        &projects(e, types::MAX_PROJECTS + 1),
    );
    assert_eq!(err, MembershipError::TooManyProjects.into());

    let mut too_long_project = projects(e, 1);
    too_long_project.push_back(long.clone());
    let err = try_mint(&accounts(e, "1"), &bio(e), &too_long_project);
    assert_eq!(err, MembershipError::InvalidLength.into());

    let mut empty_project = projects(e, 1);
    empty_project.push_back(String::from_str(e, ""));
    let err = try_mint(&accounts(e, "1"), &bio(e), &empty_project);
    assert_eq!(err, MembershipError::InvalidLength.into());

    let err = try_mint(&accounts(e, "1"), &long, &projects(e, 1));
    assert_eq!(err, MembershipError::InvalidLength.into());

    let mut empty_id = accounts(e, "1");
    empty_id
        .accounts
        .push_back(account(e, types::Provider::X, "", "handle"));
    let err = try_mint(&empty_id, &bio(e), &projects(e, 1));
    assert_eq!(err, MembershipError::InvalidLength.into());

    let mut long_handle = accounts(e, "1");
    long_handle
        .accounts
        .push_back(account(e, types::Provider::X, "1", &"h".repeat(65)));
    let err = try_mint(&long_handle, &bio(e), &projects(e, 1));
    assert_eq!(err, MembershipError::InvalidLength.into());

    let mut duplicate = accounts(e, "1");
    duplicate
        .accounts
        .push_back(account(e, types::Provider::Github, "2", "other"));
    let err = try_mint(&duplicate, &bio(e), &projects(e, 1));
    assert_eq!(err, MembershipError::DuplicateProvider.into());

    // the upper bounds are inclusive
    let mut max_projects = projects(e, types::MAX_PROJECTS - 1);
    max_projects.push_back(String::from_str(e, &"p".repeat(128)));
    let mut max_accounts = accounts(e, "1");
    max_accounts.accounts.push_back(account(
        e,
        types::Provider::X,
        &"x".repeat(64),
        &"x".repeat(64),
    ));
    setup.contract.mint(
        &setup.grogu,
        &types::Role::Verified,
        &max_accounts,
        &String::from_str(e, &"b".repeat(128)),
        &max_projects,
    );
}
