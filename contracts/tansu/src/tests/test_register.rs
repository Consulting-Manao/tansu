extern crate std;
use super::test_utils::{create_test_data, init_contract};
use crate::events::ProjectRegistered;
use crate::types::Project;
use crate::{contract_versioning::domain_register, errors::ContractErrors};
use soroban_sdk::testutils::Events;
use soroban_sdk::{Bytes, Event, String, Vec, vec};

#[test]
fn register_project() {
    let setup = create_test_data();
    let id = init_contract(&setup);
    let project = setup.contract.get_project(&id);
    assert_eq!(project.name, String::from_str(&setup.env, "tansu"));
}

#[test]
fn register_events() {
    let setup = create_test_data();

    let name = String::from_str(&setup.env, "tansu");
    let url = String::from_str(&setup.env, "github.com/tansu");
    let ipfs = String::from_str(&setup.env, "2ef4f49fdd8fa9dc463f1f06a094c26b88710990");
    let maintainers = vec![&setup.env, setup.grogu.clone(), setup.mando.clone()];

    let genesis_amount: i128 = 1_000_000_000 * 10_000_000;
    setup.token_stellar.mint(&setup.grogu, &genesis_amount);

    let id = setup
        .contract
        .register(&setup.grogu, &name, &maintainers, &url, &ipfs, &None, &None);

    let event = ProjectRegistered {
        project_key: id.clone(),
        name: name.clone(),
        maintainer: setup.grogu.clone(),
    };

    assert_eq!(
        setup
            .env
            .events()
            .all()
            .filter_by_contract(&setup.contract_id),
        [event.to_xdr(&setup.env, &setup.contract_id)]
    );

    let expected_id = [
        55, 174, 131, 192, 111, 222, 16, 67, 114, 71, 67, 51, 90, 194, 243, 145, 147, 7, 137, 46,
        230, 48, 124, 206, 140, 12, 99, 234, 165, 73, 225, 86,
    ];
    let expected_id = Bytes::from_array(&setup.env, &expected_id);
    assert_eq!(id, expected_id);
}

#[test]
fn register_double_registration_error() {
    let setup = create_test_data();
    let _id = init_contract(&setup);

    let name = String::from_str(&setup.env, "tansu");
    let url = String::from_str(&setup.env, "github.com/tansu");
    let ipfs = String::from_str(&setup.env, "2ef4f49fdd8fa9dc463f1f06a094c26b88710990");
    let maintainers = vec![&setup.env, setup.grogu.clone(), setup.mando.clone()];

    // double registration
    let err = setup
        .contract
        .try_register(&setup.grogu, &name, &maintainers, &url, &ipfs, &None, &None)
        .unwrap_err()
        .unwrap();
    assert_eq!(err, ContractErrors::ProjectAlreadyExist.into());
}

#[test]
fn register_name_too_long_error() {
    let setup = create_test_data();
    let _id = init_contract(&setup);

    let name_long = String::from_str(&setup.env, "tansutansutansutansu");
    let url = String::from_str(&setup.env, "github.com/tansu");
    let ipfs = String::from_str(&setup.env, "2ef4f49fdd8fa9dc463f1f06a094c26b88710990");
    let maintainers = vec![&setup.env, setup.grogu.clone(), setup.mando.clone()];

    // name too long
    let err = setup
        .contract
        .try_register(
            &setup.grogu,
            &name_long,
            &maintainers,
            &url,
            &ipfs,
            &None,
            &None,
        )
        .unwrap_err()
        .unwrap();
    assert_eq!(err, ContractErrors::InvalidDomainError.into());
}

#[test]
fn register_maintainer_not_domain_owner_error() {
    let setup = create_test_data();
    let _id = init_contract(&setup);

    let _name = String::from_str(&setup.env, "tansu");
    let url = String::from_str(&setup.env, "github.com/tansu");
    let ipfs = String::from_str(&setup.env, "2ef4f49fdd8fa9dc463f1f06a094c26b88710990");
    let maintainers = vec![&setup.env, setup.grogu.clone(), setup.mando.clone()];

    // maintainer not domain owner
    let name_b = Bytes::from_slice(&setup.env, b"bob");
    let genesis_amount: i128 = 1_000_000_000 * 10_000_000;
    setup.token_stellar.mint(&setup.mando, &genesis_amount);
    domain_register(&setup.env, &name_b, &setup.mando, setup.domain_id.clone());
    let name_b_str = String::from_str(&setup.env, "bob");
    let err = setup
        .contract
        .try_register(
            &setup.grogu,
            &name_b_str,
            &maintainers,
            &url,
            &ipfs,
            &None,
            &None,
        )
        .unwrap_err()
        .unwrap();
    assert_eq!(err, ContractErrors::MaintainerNotDomainOwner.into());
}

#[test]
fn test_project_listing() {
    let setup = create_test_data();
    let client = &setup.contract;
    let env = &setup.env;

    let items_per_page = 10;
    let maintainer = &setup.grogu;
    let maintainers = vec![env, maintainer.clone()];
    let url_prefix = "github.com/tansu-";
    let ipfs_prefix = "2ef4f49fdd8fa9dc463f1f06a094c26b8871";

    // Let's mint some tokens to register the domain projects
    let genesis_amount: i128 = 1_000_000_000 * 10_000_000;
    setup.token_stellar.mint(maintainer, &genesis_amount);

    // Register multiple projects (items_per_page projects per page) so we can test pagination
    for i in 0u32..items_per_page + 3 {
        let suffix = std::format!("{}", (b'a' + i as u8) as char);

        let name_str = std::format!("tansu{}", suffix);
        let name = String::from_str(env, &name_str);

        let url_str = std::format!("{}{}", url_prefix, suffix);
        let url = String::from_str(env, &url_str);

        let ipfs_str = std::format!("{}{}", ipfs_prefix, i);
        let ipfs = String::from_str(env, &ipfs_str);

        client.register(maintainer, &name, &maintainers, &url, &ipfs, &None, &None);
    }

    // Check first page (should have items_per_page projects)
    let page_0 = client.get_projects(&0);
    assert_eq!(page_0.len(), items_per_page);
    for i in 0u32..items_per_page {
        let _: Project = page_0.get(i).unwrap();
    }

    // Check second page (should have 3 projects)
    let page_1 = client.get_projects(&1);
    assert_eq!(page_1.len(), 3);
    for i in 0u32..page_1.len() {
        let _: Project = page_1.get(i).unwrap();
    }

    // Check empty page
    let err = setup.contract.try_get_projects(&2).unwrap_err().unwrap();
    assert_eq!(err, ContractErrors::NoProjectPageFound.into());
}

#[test]
fn test_sub_projects() {
    let setup = create_test_data();
    let client = &setup.contract;
    let env = &setup.env;
    let maintainer = &setup.grogu;

    // Register a project
    let project_id = init_contract(&setup);

    // First get: should return empty vector
    let sub_projects_before = client.get_sub_projects(&project_id);
    assert_eq!(sub_projects_before.len(), 0);

    // Register a second project to use as sub-project
    let genesis_amount: i128 = 1_000_000_000 * 10_000_000;
    setup.token_stellar.mint(maintainer, &genesis_amount);

    let name2 = String::from_str(env, "subproject");
    let url2 = String::from_str(env, "github.com/subproject");
    let ipfs2 = String::from_str(env, "2ef4f49fdd8fa9dc463f1f06a094c26b88710991");
    let maintainers2 = vec![env, maintainer.clone()];
    let sub_project_id = client.register(
        maintainer,
        &name2,
        &maintainers2,
        &url2,
        &ipfs2,
        &None,
        &None,
    );

    // Set sub-projects
    let sub_projects = vec![env, sub_project_id.clone()];
    client.set_sub_projects(maintainer, &project_id, &sub_projects);

    // Second get: should return the sub-project we just set
    let sub_projects_after = client.get_sub_projects(&project_id);
    assert_eq!(sub_projects_after.len(), 1);
    assert_eq!(sub_projects_after.get(0).unwrap(), sub_project_id);

    // Clear sub-projects by setting an empty list
    let empty: Vec<Bytes> = Vec::new(env);
    client.set_sub_projects(maintainer, &project_id, &empty);

    // Third get: should return empty vector
    let sub_projects_cleared = client.get_sub_projects(&project_id);
    assert_eq!(sub_projects_cleared.len(), 0);
}

#[test]
fn test_sub_projects_limit() {
    let setup = create_test_data();
    let client = &setup.contract;
    let env = &setup.env;
    let maintainer = &setup.grogu;

    // Register a project
    let project_id = init_contract(&setup);

    // Register projects to test the limit (register 11 projects)
    let genesis_amount: i128 = 1_000_000_000 * 10_000_000;
    setup.token_stellar.mint(maintainer, &genesis_amount);

    let mut sub_project_ids = Vec::new(env);
    // Register 11 projects using single character suffixes (like test_project_listing does)
    for i in 0u32..11 {
        let suffix = std::format!("{}", (b'a' + i as u8) as char);
        let name_str = std::format!("sub{}", suffix);
        let name = String::from_str(env, &name_str);
        let url = String::from_str(env, &std::format!("github.com/{}", name_str));
        let ipfs = String::from_str(
            env,
            &std::format!("2ef4f49fdd8fa9dc463f1f06a094c26b8871099{}", i),
        );
        let maintainers = vec![env, maintainer.clone()];
        let sub_project_id =
            client.register(maintainer, &name, &maintainers, &url, &ipfs, &None, &None);
        sub_project_ids.push_back(sub_project_id);
    }

    // Try to set 11 sub-projects (should fail)
    let err = client
        .try_set_sub_projects(maintainer, &project_id, &sub_project_ids)
        .unwrap_err()
        .unwrap();
    assert_eq!(err, ContractErrors::TooManySubProjects.into());

    // Set 10 sub-projects (should succeed)
    let mut sub_project_ids_10 = Vec::new(env);
    for i in 0..10 {
        sub_project_ids_10.push_back(sub_project_ids.get(i).unwrap());
    }
    client.set_sub_projects(maintainer, &project_id, &sub_project_ids_10);

    // Verify 10 sub-projects were set
    let sub_projects_after = client.get_sub_projects(&project_id);
    assert_eq!(sub_projects_after.len(), 10);
}

#[test]
fn min_voting_period_defaults_when_unset() {
    let setup = create_test_data();
    let id = init_contract(&setup);
    // 24h default (also defined in contract_dao but asserted on the public read path)
    assert_eq!(setup.contract.get_min_voting_period(&id), 24 * 3600);
}

#[test]
fn min_voting_period_override_is_stored_and_read() {
    let setup = create_test_data();

    let name = String::from_str(&setup.env, "tansu");
    let url = String::from_str(&setup.env, "github.com/tansu");
    let ipfs = String::from_str(&setup.env, "2ef4f49fdd8fa9dc463f1f06a094c26b88710990");
    let maintainers = vec![&setup.env, setup.grogu.clone(), setup.mando.clone()];

    let genesis_amount: i128 = 1_000_000_000 * 10_000_000;
    setup.token_stellar.mint(&setup.grogu, &genesis_amount);

    let custom = 7 * 24 * 3600u64;
    let id = setup.contract.register(
        &setup.grogu,
        &name,
        &maintainers,
        &url,
        &ipfs,
        &Some(custom),
        &None,
    );
    assert_eq!(setup.contract.get_min_voting_period(&id), custom);
}

#[test]
fn min_voting_period_rejects_zero() {
    let setup = create_test_data();

    let name = String::from_str(&setup.env, "tansu");
    let url = String::from_str(&setup.env, "github.com/tansu");
    let ipfs = String::from_str(&setup.env, "2ef4f49fdd8fa9dc463f1f06a094c26b88710990");
    let maintainers = vec![&setup.env, setup.grogu.clone(), setup.mando.clone()];

    let genesis_amount: i128 = 1_000_000_000 * 10_000_000;
    setup.token_stellar.mint(&setup.grogu, &genesis_amount);

    let err = setup
        .contract
        .try_register(
            &setup.grogu,
            &name,
            &maintainers,
            &url,
            &ipfs,
            &Some(0u64),
            &None,
        )
        .unwrap_err()
        .unwrap();
    assert_eq!(err, ContractErrors::InvalidVotingPeriod.into());
}

#[test]
fn min_voting_period_rejects_above_max() {
    let setup = create_test_data();

    let name = String::from_str(&setup.env, "tansu");
    let url = String::from_str(&setup.env, "github.com/tansu");
    let ipfs = String::from_str(&setup.env, "2ef4f49fdd8fa9dc463f1f06a094c26b88710990");
    let maintainers = vec![&setup.env, setup.grogu.clone(), setup.mando.clone()];

    let genesis_amount: i128 = 1_000_000_000 * 10_000_000;
    setup.token_stellar.mint(&setup.grogu, &genesis_amount);

    let too_long = 30 * 24 * 3600u64 + 1; // one second past MAX_VOTING_PERIOD
    let err = setup
        .contract
        .try_register(
            &setup.grogu,
            &name,
            &maintainers,
            &url,
            &ipfs,
            &Some(too_long),
            &None,
        )
        .unwrap_err()
        .unwrap();
    assert_eq!(err, ContractErrors::InvalidVotingPeriod.into());
}

#[test]
fn execute_delay_defaults_when_unset() {
    let setup = create_test_data();
    let id = init_contract(&setup);
    // Mirrors TIMELOCK_DELAY = 24 * 3600.
    assert_eq!(setup.contract.get_execute_delay(&id), 24 * 3600);
}

#[test]
fn execute_delay_override_is_stored_and_read() {
    let setup = create_test_data();

    let name = String::from_str(&setup.env, "tansu");
    let url = String::from_str(&setup.env, "github.com/tansu");
    let ipfs = String::from_str(&setup.env, "2ef4f49fdd8fa9dc463f1f06a094c26b88710990");
    let maintainers = vec![&setup.env, setup.grogu.clone(), setup.mando.clone()];

    let genesis_amount: i128 = 1_000_000_000 * 10_000_000;
    setup.token_stellar.mint(&setup.grogu, &genesis_amount);

    let custom = 60u64;
    let id = setup.contract.register(
        &setup.grogu,
        &name,
        &maintainers,
        &url,
        &ipfs,
        &None,
        &Some(custom),
    );
    assert_eq!(setup.contract.get_execute_delay(&id), custom);
}

#[test]
fn execute_delay_rejects_zero() {
    let setup = create_test_data();

    let name = String::from_str(&setup.env, "tansu");
    let url = String::from_str(&setup.env, "github.com/tansu");
    let ipfs = String::from_str(&setup.env, "2ef4f49fdd8fa9dc463f1f06a094c26b88710990");
    let maintainers = vec![&setup.env, setup.grogu.clone(), setup.mando.clone()];

    let genesis_amount: i128 = 1_000_000_000 * 10_000_000;
    setup.token_stellar.mint(&setup.grogu, &genesis_amount);

    let err = setup
        .contract
        .try_register(
            &setup.grogu,
            &name,
            &maintainers,
            &url,
            &ipfs,
            &None,
            &Some(0u64),
        )
        .unwrap_err()
        .unwrap();
    assert_eq!(err, ContractErrors::InvalidVotingPeriod.into());
}
