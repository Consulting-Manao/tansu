extern crate std;
use super::test_utils::{create_test_data, init_contract, init_contract_with_threshold};
use crate::errors::ContractErrors;
use crate::events::{AttestationThresholdSet, ProjectConfigUpdated, ProjectRegistered};
use crate::types;
use crate::types::Project;
use soroban_sdk::testutils::{Address as _, Events};
use soroban_sdk::{Address, Bytes, Event, String, Vec, vec};

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
        .register(&setup.grogu, &name, &maintainers, &url, &ipfs, &None);

    let threshold_event = AttestationThresholdSet {
        project_key: id.clone(),
        percent: types::DEFAULT_FINALITY_THRESHOLD_PERCENT,
    };
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
        [
            threshold_event.to_xdr(&setup.env, &setup.contract_id),
            event.to_xdr(&setup.env, &setup.contract_id)
        ]
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
        .try_register(&setup.grogu, &name, &maintainers, &url, &ipfs, &None)
        .unwrap_err()
        .unwrap();
    assert_eq!(err, ContractErrors::ProjectAlreadyExist.into());
}

#[test]
fn register_name_too_long_error() {
    let setup = create_test_data();
    let _id = init_contract(&setup);

    let name_long = String::from_str(&setup.env, "tansutansutansutansutansutansux");
    let url = String::from_str(&setup.env, "github.com/tansu");
    let ipfs = String::from_str(&setup.env, "2ef4f49fdd8fa9dc463f1f06a094c26b88710990");
    let maintainers = vec![&setup.env, setup.grogu.clone(), setup.mando.clone()];

    // name too long
    let err = setup
        .contract
        .try_register(&setup.grogu, &name_long, &maintainers, &url, &ipfs, &None)
        .unwrap_err()
        .unwrap();
    assert_eq!(err, ContractErrors::InvalidProjectName.into());
}

#[test]
fn register_invalid_name_chars_error() {
    let setup = create_test_data();
    let _id = init_contract(&setup);

    // name with a dash — special chars are not allowed
    let name_invalid = String::from_str(&setup.env, "my-project");
    let url = String::from_str(&setup.env, "github.com/tansu");
    let ipfs = String::from_str(&setup.env, "2ef4f49fdd8fa9dc463f1f06a094c26b88710990");
    let maintainers = vec![&setup.env, setup.grogu.clone(), setup.mando.clone()];

    let err = setup
        .contract
        .try_register(
            &setup.grogu,
            &name_invalid,
            &maintainers,
            &url,
            &ipfs,
            &None,
        )
        .unwrap_err()
        .unwrap();
    assert_eq!(err, ContractErrors::InvalidProjectName.into());
}

#[test]
fn register_insufficient_collateral_error() {
    let setup = create_test_data();

    let name = String::from_str(&setup.env, "newproject");
    let url = String::from_str(&setup.env, "github.com/newproject");
    let ipfs = String::from_str(&setup.env, "2ef4f49fdd8fa9dc463f1f06a094c26b88710990");
    let maintainers = vec![&setup.env, setup.grogu.clone()];

    // grogu has no tokens — collateral transfer should fail
    let err = setup
        .contract
        .try_register(&setup.grogu, &name, &maintainers, &url, &ipfs, &None)
        .unwrap_err()
        .unwrap();
    assert_eq!(err, ContractErrors::CollateralError.into());
}

#[test]
fn register_without_threshold_uses_default() {
    let setup = create_test_data();
    let id = init_contract_with_threshold(&setup, None);

    assert_eq!(
        setup.contract.get_attestation_threshold(&id),
        types::DEFAULT_FINALITY_THRESHOLD_PERCENT
    );
}

#[test]
fn register_with_threshold_stores_it() {
    let setup = create_test_data();
    let id = init_contract_with_threshold(&setup, Some(80));

    assert_eq!(setup.contract.get_attestation_threshold(&id), 80);
}

#[test]
fn register_with_boundary_thresholds() {
    let setup = create_test_data();
    let id = init_contract_with_threshold(&setup, Some(types::MIN_FINALITY_THRESHOLD_PERCENT));
    assert_eq!(
        setup.contract.get_attestation_threshold(&id),
        types::MIN_FINALITY_THRESHOLD_PERCENT
    );

    let name = String::from_str(&setup.env, "tansutwo");
    let url = String::from_str(&setup.env, "github.com/tansutwo");
    let ipfs = String::from_str(&setup.env, "2ef4f49fdd8fa9dc463f1f06a094c26b88710991");
    let maintainers = vec![&setup.env, setup.grogu.clone()];

    let id_2 = setup
        .contract
        .register(&setup.grogu, &name, &maintainers, &url, &ipfs, &Some(100));
    assert_eq!(setup.contract.get_attestation_threshold(&id_2), 100);
}

#[test]
fn register_invalid_threshold_error() {
    let setup = create_test_data();
    let _id = init_contract(&setup);

    let url = String::from_str(&setup.env, "github.com/tansutwo");
    let ipfs = String::from_str(&setup.env, "2ef4f49fdd8fa9dc463f1f06a094c26b88710991");
    let maintainers = vec![&setup.env, setup.grogu.clone()];

    let too_low = types::MIN_FINALITY_THRESHOLD_PERCENT - 1;
    let err = setup
        .contract
        .try_register(
            &setup.grogu,
            &String::from_str(&setup.env, "tansutwo"),
            &maintainers,
            &url,
            &ipfs,
            &Some(too_low),
        )
        .unwrap_err()
        .unwrap();
    assert_eq!(err, ContractErrors::InvalidAttestationThreshold.into());

    let err = setup
        .contract
        .try_register(
            &setup.grogu,
            &String::from_str(&setup.env, "tansuthree"),
            &maintainers,
            &url,
            &ipfs,
            &Some(101),
        )
        .unwrap_err()
        .unwrap();
    assert_eq!(err, ContractErrors::InvalidAttestationThreshold.into());
}

#[test]
fn update_config_updates_project_and_threshold() {
    let setup = create_test_data();
    let id = init_contract_with_threshold(&setup, Some(80));

    let url = String::from_str(&setup.env, "github.com/tansu-new");
    let ipfs = String::from_str(&setup.env, "2ef4f49fdd8fa9dc463f1f06a094c26b88710991");
    let maintainers = vec![&setup.env, setup.grogu.clone()];

    setup
        .contract
        .update_config(&setup.grogu, &id, &maintainers, &url, &ipfs, &Some(90));

    let project = setup.contract.get_project(&id);
    assert_eq!(project.config.url, url);
    assert_eq!(project.config.ipfs, ipfs);
    assert_eq!(project.maintainers, maintainers);
    assert_eq!(setup.contract.get_attestation_threshold(&id), 90);
}

#[test]
fn update_config_without_threshold_leaves_it_unchanged() {
    let setup = create_test_data();
    let id = init_contract_with_threshold(&setup, Some(80));
    assert_eq!(setup.contract.get_attestation_threshold(&id), 80);

    let url = String::from_str(&setup.env, "github.com/tansu-new");
    let ipfs = String::from_str(&setup.env, "2ef4f49fdd8fa9dc463f1f06a094c26b88710991");
    let maintainers = vec![&setup.env, setup.grogu.clone(), setup.mando.clone()];

    setup
        .contract
        .update_config(&setup.grogu, &id, &maintainers, &url, &ipfs, &None);

    assert_eq!(setup.contract.get_attestation_threshold(&id), 80);
}

#[test]
fn set_attestation_threshold_none_resets_to_default() {
    let setup = create_test_data();
    let id = init_contract_with_threshold(&setup, Some(80));
    assert_eq!(setup.contract.get_attestation_threshold(&id), 80);

    setup
        .contract
        .set_attestation_threshold(&setup.grogu, &id, &None);

    assert_eq!(
        setup.contract.get_attestation_threshold(&id),
        types::DEFAULT_FINALITY_THRESHOLD_PERCENT
    );
}

#[test]
fn register_rejects_duplicate_maintainers() {
    let setup = create_test_data();

    let name = String::from_str(&setup.env, "dupes");
    let url = String::from_str(&setup.env, "github.com/tansu");
    let ipfs = String::from_str(&setup.env, "2ef4f49fdd8fa9dc463f1f06a094c26b88710990");
    let maintainers = vec![
        &setup.env,
        setup.grogu.clone(),
        setup.mando.clone(),
        setup.grogu.clone(),
    ];

    setup
        .token_stellar
        .mint(&setup.grogu, &(1_000_000_000 * 10_000_000));

    let err = setup
        .contract
        .try_register(&setup.grogu, &name, &maintainers, &url, &ipfs, &None)
        .unwrap_err()
        .unwrap();

    assert_eq!(err, ContractErrors::DuplicateMaintainer.into());
}

#[test]
fn update_config_rejects_duplicate_maintainers() {
    let setup = create_test_data();
    let id = init_contract(&setup);

    let url = String::from_str(&setup.env, "github.com/tansu-new");
    let ipfs = String::from_str(&setup.env, "2ef4f49fdd8fa9dc463f1f06a094c26b88710991");
    let maintainers = vec![&setup.env, setup.grogu.clone(), setup.grogu.clone()];

    let err = setup
        .contract
        .try_update_config(&setup.grogu, &id, &maintainers, &url, &ipfs, &None)
        .unwrap_err()
        .unwrap();

    assert_eq!(err, ContractErrors::DuplicateMaintainer.into());
}

#[test]
fn update_config_invalid_threshold_error() {
    let setup = create_test_data();
    let id = init_contract_with_threshold(&setup, Some(80));

    let url = String::from_str(&setup.env, "github.com/tansu-new");
    let ipfs = String::from_str(&setup.env, "2ef4f49fdd8fa9dc463f1f06a094c26b88710991");
    let maintainers = vec![&setup.env, setup.grogu.clone()];

    let too_low = types::MIN_FINALITY_THRESHOLD_PERCENT - 1;
    let err = setup
        .contract
        .try_update_config(&setup.grogu, &id, &maintainers, &url, &ipfs, &Some(too_low))
        .unwrap_err()
        .unwrap();
    assert_eq!(err, ContractErrors::InvalidAttestationThreshold.into());

    let err = setup
        .contract
        .try_update_config(&setup.grogu, &id, &maintainers, &url, &ipfs, &Some(101))
        .unwrap_err()
        .unwrap();
    assert_eq!(err, ContractErrors::InvalidAttestationThreshold.into());

    assert_eq!(setup.contract.get_attestation_threshold(&id), 80);
    assert_eq!(
        setup.contract.get_project(&id).config.url,
        String::from_str(&setup.env, "github.com/tansu")
    );
}

#[test]
fn update_config_unregistered_maintainer_error() {
    let setup = create_test_data();
    let id = init_contract(&setup);

    let bob = Address::generate(&setup.env);
    let url = String::from_str(&setup.env, "github.com/tansu-new");
    let ipfs = String::from_str(&setup.env, "2ef4f49fdd8fa9dc463f1f06a094c26b88710991");
    let maintainers = vec![&setup.env, bob.clone()];

    let err = setup
        .contract
        .try_update_config(&bob, &id, &maintainers, &url, &ipfs, &Some(90))
        .unwrap_err()
        .unwrap();
    assert_eq!(err, ContractErrors::UnauthorizedSigner.into());
}

#[test]
fn update_config_events() {
    let setup = create_test_data();
    let id = init_contract(&setup);

    let url = String::from_str(&setup.env, "github.com/tansu-new");
    let ipfs = String::from_str(&setup.env, "2ef4f49fdd8fa9dc463f1f06a094c26b88710991");
    let maintainers = vec![&setup.env, setup.grogu.clone(), setup.mando.clone()];

    setup
        .contract
        .update_config(&setup.grogu, &id, &maintainers, &url, &ipfs, &Some(90));

    let threshold_event = AttestationThresholdSet {
        project_key: id.clone(),
        percent: 90,
    };
    let event = ProjectConfigUpdated {
        project_key: id.clone(),
        maintainer: setup.grogu.clone(),
    };

    assert_eq!(
        setup
            .env
            .events()
            .all()
            .filter_by_contract(&setup.contract_id),
        [
            threshold_event.to_xdr(&setup.env, &setup.contract_id),
            event.to_xdr(&setup.env, &setup.contract_id)
        ]
    );
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

        client.register(maintainer, &name, &maintainers, &url, &ipfs, &None);
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
    let sub_project_id = client.register(maintainer, &name2, &maintainers2, &url2, &ipfs2, &None);

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
        let sub_project_id = client.register(maintainer, &name, &maintainers, &url, &ipfs, &None);
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
fn register_rejects_too_many_maintainers() {
    let setup = create_test_data();

    let name = String::from_str(&setup.env, "toomany");
    let url = String::from_str(&setup.env, "github.com/tansu");
    let ipfs = String::from_str(&setup.env, "2ef4f49fdd8fa9dc463f1f06a094c26b88710990");

    let mut maintainers = Vec::new(&setup.env);
    maintainers.push_back(setup.grogu.clone());
    for _ in 0..25 {
        maintainers.push_back(Address::generate(&setup.env));
    }

    setup
        .token_stellar
        .mint(&setup.grogu, &(1_000_000_000 * 10_000_000));

    let err = setup
        .contract
        .try_register(&setup.grogu, &name, &maintainers, &url, &ipfs, &None)
        .unwrap_err()
        .unwrap();

    assert_eq!(err, ContractErrors::TooManyMaintainers.into());
}
