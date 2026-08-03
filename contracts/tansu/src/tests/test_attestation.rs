use super::test_utils::{create_test_data, init_contract};
use crate::errors::ContractErrors;
use crate::events::{AttestationRevoked, AttestationThresholdSet, Attested};
use crate::types;
use soroban_sdk::testutils::{Address as _, Events, Ledger, MockAuth, MockAuthInvoke};
use soroban_sdk::{Address, Bytes, Event, IntoVal, String, vec};

fn register_revocable_project(setup: &super::test_utils::TestSetup, third: &Address) -> Bytes {
    let name = String::from_str(&setup.env, "revocable");
    let url = String::from_str(&setup.env, "github.com/revocable");
    let ipfs = String::from_str(&setup.env, "2ef4f49fdd8fa9dc463f1f06a094c26b88710992");
    let maintainers = vec![
        &setup.env,
        setup.grogu.clone(),
        setup.mando.clone(),
        third.clone(),
    ];

    setup
        .token_stellar
        .mint(&setup.grogu, &(1_000_000_000 * 10_000_000));

    setup.contract.register(
        &setup.grogu,
        &name,
        &maintainers,
        &url,
        &ipfs,
        &None,
        &None,
        &Some(100),
    )
}

fn register_second_project(setup: &super::test_utils::TestSetup) -> Bytes {
    let name = String::from_str(&setup.env, "tansu2");
    let url = String::from_str(&setup.env, "github.com/tansu2");
    let ipfs = String::from_str(&setup.env, "2ef4f49fdd8fa9dc463f1f06a094c26b88710991");
    let maintainers = vec![&setup.env, setup.grogu.clone(), setup.mando.clone()];

    setup.contract.register(
        &setup.grogu,
        &name,
        &maintainers,
        &url,
        &ipfs,
        &None,
        &None,
        &None,
    )
}

#[test]
fn attest_records_and_emits_event() {
    let setup = create_test_data();
    let project_key = init_contract(&setup);

    setup.env.ledger().set_timestamp(12_345);

    let commit_hash = String::from_str(&setup.env, "6663520bd9e6ede248fef8157b2af0b6b6b41046");

    setup.contract.attest(
        &setup.mando,
        &project_key,
        &commit_hash,
        &types::AttestationTarget::Commit,
        &None,
    );

    let event = Attested {
        project_key: project_key.clone(),
        commit_hash: commit_hash.clone(),
        target: types::AttestationTarget::Commit,
        attester: setup.mando.clone(),
        weight: types::Badge::Default as u32,
    };

    assert_eq!(
        setup
            .env
            .events()
            .all()
            .filter_by_contract(&setup.contract_id),
        [event.to_xdr(&setup.env, &setup.contract_id)]
    );

    let attestations = setup.contract.get_attestations(
        &project_key,
        &commit_hash,
        &types::AttestationTarget::Commit,
    );

    assert_eq!(attestations.len(), 1);

    let recorded = attestations.get(0).unwrap();

    assert_eq!(recorded.attester, setup.mando);
    assert_eq!(recorded.created_at, 12_345);
}

#[test]
fn attest_on_evidence_target() {
    let setup = create_test_data();
    let project_key = init_contract(&setup);

    let commit_hash = String::from_str(&setup.env, "6663520bd9e6ede248fef8157b2af0b6b6b41046");

    let target = types::AttestationTarget::Evidence(
        types::EvidenceKind::Sbom,
        String::from_str(
            &setup.env,
            "bafybeib6ioupho3p3pliusx7tgs7dvi6mpu2bwfhayj6w6ie44lo3vvc4i",
        ),
    );

    setup
        .contract
        .attest(&setup.mando, &project_key, &commit_hash, &target, &None);

    let attestations = setup
        .contract
        .get_attestations(&project_key, &commit_hash, &target);

    assert_eq!(attestations.len(), 1);
}

#[test]
fn attest_rejects_second_attestation_from_same_maintainer() {
    let setup = create_test_data();
    let project_key = init_contract(&setup);

    let commit_hash = String::from_str(&setup.env, "6663520bd9e6ede248fef8157b2af0b6b6b41046");

    setup.env.ledger().set_timestamp(100);

    setup.contract.attest(
        &setup.mando,
        &project_key,
        &commit_hash,
        &types::AttestationTarget::Commit,
        &None,
    );

    setup.env.ledger().set_timestamp(200);

    let err = setup
        .contract
        .try_attest(
            &setup.mando,
            &project_key,
            &commit_hash,
            &types::AttestationTarget::Commit,
            &None,
        )
        .unwrap_err()
        .unwrap();

    assert_eq!(err, ContractErrors::AlreadyAttested.into());

    let attestations = setup.contract.get_attestations(
        &project_key,
        &commit_hash,
        &types::AttestationTarget::Commit,
    );

    assert_eq!(attestations.len(), 1);
    assert_eq!(attestations.get(0).unwrap().created_at, 100);
}

#[test]
fn attest_allows_same_maintainer_on_distinct_targets() {
    let setup = create_test_data();
    let project_key = init_contract(&setup);

    let commit_hash = String::from_str(&setup.env, "6663520bd9e6ede248fef8157b2af0b6b6b41046");
    let cid = String::from_str(
        &setup.env,
        "bafybeib6ioupho3p3pliusx7tgs7dvi6mpu2bwfhayj6w6ie44lo3vvc4i",
    );

    setup.contract.attest(
        &setup.mando,
        &project_key,
        &commit_hash,
        &types::AttestationTarget::Commit,
        &None,
    );

    let evidence_target = types::AttestationTarget::Evidence(types::EvidenceKind::Sbom, cid);

    setup.contract.attest(
        &setup.mando,
        &project_key,
        &commit_hash,
        &evidence_target,
        &None,
    );

    assert_eq!(
        setup
            .contract
            .get_attestations(
                &project_key,
                &commit_hash,
                &types::AttestationTarget::Commit
            )
            .len(),
        1
    );
    assert_eq!(
        setup
            .contract
            .get_attestations(&project_key, &commit_hash, &evidence_target)
            .len(),
        1
    );
}

#[test]
fn attest_requires_maintainer() {
    let setup = create_test_data();
    let project_key = init_contract(&setup);

    let outsider = Address::generate(&setup.env);
    let commit_hash = String::from_str(&setup.env, "6663520bd9e6ede248fef8157b2af0b6b6b41046");

    let err = setup
        .contract
        .try_attest(
            &outsider,
            &project_key,
            &commit_hash,
            &types::AttestationTarget::Commit,
            &None,
        )
        .unwrap_err()
        .unwrap();

    assert_eq!(err, ContractErrors::UnauthorizedSigner.into());
}

#[test]
fn attest_rejects_empty_commit_hash() {
    let setup = create_test_data();
    let project_key = init_contract(&setup);

    let empty = String::from_str(&setup.env, "");

    let err = setup
        .contract
        .try_attest(
            &setup.mando,
            &project_key,
            &empty,
            &types::AttestationTarget::Commit,
            &None,
        )
        .unwrap_err()
        .unwrap();

    assert_eq!(err, ContractErrors::InvalidAttestation.into());
}

#[test]
fn attest_rejected_when_paused() {
    let setup = create_test_data();
    let project_key = init_contract(&setup);

    setup.contract.pause(&setup.contract_admin, &true);

    let commit_hash = String::from_str(&setup.env, "6663520bd9e6ede248fef8157b2af0b6b6b41046");
    let err = setup
        .contract
        .try_attest(
            &setup.mando,
            &project_key,
            &commit_hash,
            &types::AttestationTarget::Commit,
            &None,
        )
        .unwrap_err()
        .unwrap();

    assert_eq!(err, ContractErrors::ContractPaused.into());
}

#[test]
fn finality_reached_when_all_maintainers_attest() {
    let setup = create_test_data();
    let project_key = init_contract(&setup);

    let commit_hash = String::from_str(&setup.env, "6663520bd9e6ede248fef8157b2af0b6b6b41046");
    let target = types::AttestationTarget::Commit;

    setup
        .contract
        .attest(&setup.mando, &project_key, &commit_hash, &target, &None);

    let status = setup
        .contract
        .get_attestation_finality(&project_key, &commit_hash, &target);
    assert_eq!(status.attested, 1);
    assert_eq!(status.total, 2);
    assert!(!status.is_final);

    setup
        .contract
        .attest(&setup.grogu, &project_key, &commit_hash, &target, &None);

    let status = setup
        .contract
        .get_attestation_finality(&project_key, &commit_hash, &target);
    assert_eq!(status.attested, 2);
    assert!(status.is_final);
}

#[test]
fn get_attestation_threshold_defaults_when_unset() {
    let setup = create_test_data();
    let project_key = init_contract(&setup);

    assert_eq!(
        setup.contract.get_attestation_threshold(&project_key),
        types::DEFAULT_FINALITY_THRESHOLD_PERCENT
    );
}

#[test]
fn set_attestation_threshold_stores_and_emits_event() {
    let setup = create_test_data();
    let project_key = init_contract(&setup);

    setup
        .contract
        .set_attestation_threshold(&setup.mando, &project_key, &Some(75));

    let event = AttestationThresholdSet {
        project_key: project_key.clone(),
        percent: 75,
    };

    assert_eq!(
        setup
            .env
            .events()
            .all()
            .filter_by_contract(&setup.contract_id),
        [event.to_xdr(&setup.env, &setup.contract_id)]
    );

    assert_eq!(setup.contract.get_attestation_threshold(&project_key), 75);
}

#[test]
fn set_attestation_threshold_accepts_boundary_values() {
    let setup = create_test_data();
    let project_key = init_contract(&setup);

    setup.contract.set_attestation_threshold(
        &setup.mando,
        &project_key,
        &Some(types::MIN_FINALITY_THRESHOLD_PERCENT),
    );

    assert_eq!(
        setup.contract.get_attestation_threshold(&project_key),
        types::MIN_FINALITY_THRESHOLD_PERCENT
    );

    setup
        .contract
        .set_attestation_threshold(&setup.mando, &project_key, &Some(100));

    assert_eq!(setup.contract.get_attestation_threshold(&project_key), 100);
}

#[test]
fn set_attestation_threshold_rejects_below_floor() {
    let setup = create_test_data();
    let project_key = init_contract(&setup);

    let too_low = types::MIN_FINALITY_THRESHOLD_PERCENT - 1;
    let err = setup
        .contract
        .try_set_attestation_threshold(&setup.mando, &project_key, &Some(too_low))
        .unwrap_err()
        .unwrap();
    assert_eq!(err, ContractErrors::InvalidAttestationThreshold.into());
}

#[test]
fn set_attestation_threshold_rejects_above_100() {
    let setup = create_test_data();
    let project_key = init_contract(&setup);

    let err = setup
        .contract
        .try_set_attestation_threshold(&setup.mando, &project_key, &Some(101))
        .unwrap_err()
        .unwrap();

    assert_eq!(err, ContractErrors::InvalidAttestationThreshold.into());
}

#[test]
fn set_attestation_threshold_requires_maintainer() {
    let setup = create_test_data();
    let project_key = init_contract(&setup);

    let outsider = Address::generate(&setup.env);
    let err = setup
        .contract
        .try_set_attestation_threshold(&outsider, &project_key, &Some(70))
        .unwrap_err()
        .unwrap();

    assert_eq!(err, ContractErrors::UnauthorizedSigner.into());
}

#[test]
fn set_attestation_threshold_rejected_when_paused() {
    let setup = create_test_data();
    let project_key = init_contract(&setup);

    setup.contract.pause(&setup.contract_admin, &true);

    let err = setup
        .contract
        .try_set_attestation_threshold(&setup.mando, &project_key, &Some(70))
        .unwrap_err()
        .unwrap();

    assert_eq!(err, ContractErrors::ContractPaused.into());
}

#[test]
fn set_attestation_threshold_is_per_project() {
    let setup = create_test_data();
    let project_a = init_contract(&setup);
    let project_b = register_second_project(&setup);

    setup
        .contract
        .set_attestation_threshold(&setup.mando, &project_a, &Some(80));

    assert_eq!(setup.contract.get_attestation_threshold(&project_a), 80);
    assert_eq!(
        setup.contract.get_attestation_threshold(&project_b),
        types::DEFAULT_FINALITY_THRESHOLD_PERCENT
    );
}

#[test]
fn get_finality_uses_threshold_with_no_attestations() {
    let setup = create_test_data();
    let project_key = init_contract(&setup);

    let commit_hash = String::from_str(&setup.env, "6663520bd9e6ede248fef8157b2af0b6b6b41046");

    let status = setup.contract.get_attestation_finality(
        &project_key,
        &commit_hash,
        &types::AttestationTarget::Commit,
    );

    assert_eq!(status.attested, 0);
    assert_eq!(status.total, 2);
    assert!(!status.is_final);

    setup.contract.set_attestation_threshold(
        &setup.mando,
        &project_key,
        &Some(types::MIN_FINALITY_THRESHOLD_PERCENT),
    );

    let status = setup.contract.get_attestation_finality(
        &project_key,
        &commit_hash,
        &types::AttestationTarget::Commit,
    );

    assert!(!status.is_final);
}

#[test]
fn get_attestations_empty_when_none_recorded() {
    let setup = create_test_data();
    let project_key = init_contract(&setup);

    let commit_hash = String::from_str(&setup.env, "6663520bd9e6ede248fef8157b2af0b6b6b41046");

    let commit_attestations = setup.contract.get_attestations(
        &project_key,
        &commit_hash,
        &types::AttestationTarget::Commit,
    );
    assert_eq!(commit_attestations.len(), 0);

    let evidence_target = types::AttestationTarget::Evidence(
        types::EvidenceKind::Sbom,
        String::from_str(
            &setup.env,
            "bafybeib6ioupho3p3pliusx7tgs7dvi6mpu2bwfhayj6w6ie44lo3vvc4i",
        ),
    );
    let evidence_attestations =
        setup
            .contract
            .get_attestations(&project_key, &commit_hash, &evidence_target);
    assert_eq!(evidence_attestations.len(), 0);
}

#[test]
fn get_finality_for_evidence_target() {
    let setup = create_test_data();
    let project_key = init_contract(&setup);

    let commit_hash = String::from_str(&setup.env, "6663520bd9e6ede248fef8157b2af0b6b6b41046");
    let target = types::AttestationTarget::Evidence(
        types::EvidenceKind::Sbom,
        String::from_str(
            &setup.env,
            "bafybeib6ioupho3p3pliusx7tgs7dvi6mpu2bwfhayj6w6ie44lo3vvc4i",
        ),
    );

    let status = setup
        .contract
        .get_attestation_finality(&project_key, &commit_hash, &target);

    assert_eq!(status.attested, 0);
    assert_eq!(status.total, 2);
    assert!(!status.is_final);
}

#[test]
fn get_finality_unknown_project_fails() {
    let setup = create_test_data();
    init_contract(&setup);

    let missing = Bytes::from_array(&setup.env, &[9u8; 32]);
    let commit_hash = String::from_str(&setup.env, "6663520bd9e6ede248fef8157b2af0b6b6b41046");

    let err = setup
        .contract
        .try_get_attestation_finality(&missing, &commit_hash, &types::AttestationTarget::Commit)
        .unwrap_err()
        .unwrap();

    assert_eq!(err, ContractErrors::InvalidKey.into());
}

#[test]
fn attest_evidence_target_key_fits_ledger_limit_for_long_cids() {
    let setup = create_test_data();
    let project_key = init_contract(&setup);

    let commit_hash = String::from_str(&setup.env, "6663520bd9e6ede248fef8157b2af0b6b6b41046");
    let long_cid = String::from_str(
        &setup.env,
        "bafybeib6ioupho3p3pliusx7tgs7dvi6mpu2bwfhayj6w6ie44lo3vvc4ibafybeib6ioupho3p3pliusx7tgs7dvi6mpu2bwfhayj6w6ie44lo3vvc4i",
    );
    let target = types::AttestationTarget::Evidence(types::EvidenceKind::Cve, long_cid);

    setup
        .contract
        .attest(&setup.mando, &project_key, &commit_hash, &target, &None);

    assert_eq!(
        setup
            .contract
            .get_attestations(&project_key, &commit_hash, &target)
            .len(),
        1
    );
}

#[test]
fn attestations_are_scoped_per_evidence_cid() {
    let setup = create_test_data();
    let project_key = init_contract(&setup);

    let commit_hash = String::from_str(&setup.env, "6663520bd9e6ede248fef8157b2af0b6b6b41046");
    let first = types::AttestationTarget::Evidence(
        types::EvidenceKind::Sbom,
        String::from_str(
            &setup.env,
            "bafybeib6ioupho3p3pliusx7tgs7dvi6mpu2bwfhayj6w6ie44lo3vvc4i",
        ),
    );
    let second = types::AttestationTarget::Evidence(
        types::EvidenceKind::Sbom,
        String::from_str(
            &setup.env,
            "bafybeicnbbhyc4vhbuokk57lrmg4hkbvkmtcp6p3ubaptbus6kl2idthki",
        ),
    );

    setup
        .contract
        .attest(&setup.mando, &project_key, &commit_hash, &first, &None);

    assert_eq!(
        setup
            .contract
            .get_attestations(&project_key, &commit_hash, &first)
            .len(),
        1
    );
    assert_eq!(
        setup
            .contract
            .get_attestations(&project_key, &commit_hash, &second)
            .len(),
        0
    );
}

#[test]
fn attest_fails_without_any_authorization() {
    let setup = create_test_data();
    let project_key = init_contract(&setup);

    let commit_hash = String::from_str(&setup.env, "6663520bd9e6ede248fef8157b2af0b6b6b41046");

    setup.env.mock_auths(&[]);

    let result = setup.contract.try_attest(
        &setup.mando,
        &project_key,
        &commit_hash,
        &types::AttestationTarget::Commit,
        &None,
    );

    assert!(
        result.is_err(),
        "attest must require the attester's authorization"
    );
}

#[test]
fn attest_fails_when_a_different_address_authorizes() {
    let setup = create_test_data();
    let project_key = init_contract(&setup);

    let commit_hash = String::from_str(&setup.env, "6663520bd9e6ede248fef8157b2af0b6b6b41046");

    setup.env.mock_auths(&[MockAuth {
        address: &setup.grogu,
        invoke: &MockAuthInvoke {
            contract: &setup.contract_id,
            fn_name: "attest",
            args: (
                setup.mando.clone(),
                project_key.clone(),
                commit_hash.clone(),
                types::AttestationTarget::Commit,
                None::<String>,
            )
                .into_val(&setup.env),
            sub_invokes: &[],
        },
    }]);

    let result = setup.contract.try_attest(
        &setup.mando,
        &project_key,
        &commit_hash,
        &types::AttestationTarget::Commit,
        &None,
    );

    assert!(
        result.is_err(),
        "authorization from another maintainer must not stand in for the attester's"
    );
}

#[test]
fn attest_succeeds_with_scoped_attester_authorization() {
    let setup = create_test_data();
    let project_key = init_contract(&setup);

    let commit_hash = String::from_str(&setup.env, "6663520bd9e6ede248fef8157b2af0b6b6b41046");

    setup.env.mock_auths(&[MockAuth {
        address: &setup.mando,
        invoke: &MockAuthInvoke {
            contract: &setup.contract_id,
            fn_name: "attest",
            args: (
                setup.mando.clone(),
                project_key.clone(),
                commit_hash.clone(),
                types::AttestationTarget::Commit,
                None::<String>,
            )
                .into_val(&setup.env),
            sub_invokes: &[],
        },
    }]);

    setup.contract.attest(
        &setup.mando,
        &project_key,
        &commit_hash,
        &types::AttestationTarget::Commit,
        &None,
    );

    let attestations = setup.contract.get_attestations(
        &project_key,
        &commit_hash,
        &types::AttestationTarget::Commit,
    );

    assert_eq!(attestations.len(), 1);
    assert_eq!(attestations.get(0).unwrap().attester, setup.mando);
}

#[test]
fn set_attestation_threshold_fails_without_any_authorization() {
    let setup = create_test_data();
    let project_key = init_contract(&setup);

    setup.env.mock_auths(&[]);

    let result =
        setup
            .contract
            .try_set_attestation_threshold(&setup.mando, &project_key, &Some(75));

    assert!(
        result.is_err(),
        "set_attestation_threshold must require the maintainer's authorization"
    );
}

#[test]
fn read_paths_work_while_paused() {
    let setup = create_test_data();
    let project_key = init_contract(&setup);
    let commit_hash = String::from_str(&setup.env, "6663520bd9e6ede248fef8157b2af0b6b6b41046");
    let target = types::AttestationTarget::Commit;

    setup
        .contract
        .attest(&setup.mando, &project_key, &commit_hash, &target, &None);
    setup
        .contract
        .set_attestation_threshold(&setup.grogu, &project_key, &Some(75));

    setup.contract.pause(&setup.contract_admin, &true);

    assert_eq!(
        setup
            .contract
            .get_attestations(&project_key, &commit_hash, &target)
            .len(),
        1
    );
    assert_eq!(setup.contract.get_attestation_threshold(&project_key), 75);

    let status = setup
        .contract
        .get_attestation_finality(&project_key, &commit_hash, &target);

    assert_eq!(status.attested, 1);
    assert_eq!(status.total, 2);
}

#[test]
fn read_paths_require_no_authorization() {
    let setup = create_test_data();
    let project_key = init_contract(&setup);
    let commit_hash = String::from_str(&setup.env, "6663520bd9e6ede248fef8157b2af0b6b6b41046");
    let target = types::AttestationTarget::Commit;

    setup
        .contract
        .attest(&setup.mando, &project_key, &commit_hash, &target, &None);

    setup.env.mock_auths(&[]);

    assert_eq!(
        setup
            .contract
            .get_attestations(&project_key, &commit_hash, &target)
            .len(),
        1
    );
    assert_eq!(
        setup
            .contract
            .get_attestation_finality(&project_key, &commit_hash, &target)
            .attested,
        1
    );
    assert_eq!(
        setup.contract.get_attestation_threshold(&project_key),
        types::DEFAULT_FINALITY_THRESHOLD_PERCENT
    );
}

#[test]
fn revoke_attestation_removes_it_and_emits_event() {
    let setup = create_test_data();
    let project_key = init_contract(&setup);
    let commit_hash = String::from_str(&setup.env, "6663520bd9e6ede248fef8157b2af0b6b6b41046");
    let target = types::AttestationTarget::Commit;

    setup
        .contract
        .attest(&setup.mando, &project_key, &commit_hash, &target, &None);

    assert_eq!(
        setup
            .contract
            .get_attestations(&project_key, &commit_hash, &target)
            .len(),
        1
    );

    setup
        .contract
        .revoke_attestation(&setup.mando, &project_key, &commit_hash, &target);

    let revoked = AttestationRevoked {
        project_key: project_key.clone(),
        commit_hash: commit_hash.clone(),
        target: target.clone(),
        attester: setup.mando.clone(),
    };

    assert_eq!(
        setup
            .env
            .events()
            .all()
            .filter_by_contract(&setup.contract_id),
        [revoked.to_xdr(&setup.env, &setup.contract_id)]
    );

    assert_eq!(
        setup
            .contract
            .get_attestations(&project_key, &commit_hash, &target)
            .len(),
        0
    );
}

#[test]
fn revoke_attestation_lowers_finality() {
    let setup = create_test_data();

    init_contract(&setup);

    let third = Address::generate(&setup.env);
    let project_key = register_revocable_project(&setup, &third);
    let commit_hash = String::from_str(&setup.env, "6663520bd9e6ede248fef8157b2af0b6b6b41046");
    let target = types::AttestationTarget::Commit;

    setup
        .contract
        .attest(&setup.mando, &project_key, &commit_hash, &target, &None);
    setup
        .contract
        .attest(&setup.grogu, &project_key, &commit_hash, &target, &None);

    let status = setup
        .contract
        .get_attestation_finality(&project_key, &commit_hash, &target);

    assert_eq!(status.attested, 2);
    assert_eq!(status.total, 3);
    assert!(!status.is_final);

    setup
        .contract
        .revoke_attestation(&setup.grogu, &project_key, &commit_hash, &target);

    let status = setup
        .contract
        .get_attestation_finality(&project_key, &commit_hash, &target);
    assert_eq!(status.attested, 1);
    assert_eq!(status.total, 3);
    assert!(!status.is_final);
}

#[test]
fn revoke_attestation_rejected_once_target_is_final() {
    let setup = create_test_data();
    let project_key = init_contract(&setup);
    let commit_hash = String::from_str(&setup.env, "6663520bd9e6ede248fef8157b2af0b6b6b41046");
    let target = types::AttestationTarget::Commit;

    setup
        .contract
        .attest(&setup.mando, &project_key, &commit_hash, &target, &None);
    setup
        .contract
        .attest(&setup.grogu, &project_key, &commit_hash, &target, &None);

    assert!(
        setup
            .contract
            .get_attestation_finality(&project_key, &commit_hash, &target)
            .is_final
    );

    let err = setup
        .contract
        .try_revoke_attestation(&setup.grogu, &project_key, &commit_hash, &target)
        .unwrap_err()
        .unwrap();

    assert_eq!(err, ContractErrors::AttestationFinalized.into());

    assert_eq!(
        setup
            .contract
            .get_attestations(&project_key, &commit_hash, &target)
            .len(),
        2
    );
}

#[test]
fn revoke_attestation_rejected_after_window_closes() {
    let setup = create_test_data();
    let project_key = init_contract(&setup);
    let commit_hash = String::from_str(&setup.env, "6663520bd9e6ede248fef8157b2af0b6b6b41046");
    let target = types::AttestationTarget::Commit;

    setup.env.ledger().set_timestamp(1_000);
    setup
        .contract
        .attest(&setup.mando, &project_key, &commit_hash, &target, &None);

    setup
        .env
        .ledger()
        .set_timestamp(1_000 + types::ATTESTATION_REVOCATION_WINDOW + 1);

    let err = setup
        .contract
        .try_revoke_attestation(&setup.mando, &project_key, &commit_hash, &target)
        .unwrap_err()
        .unwrap();

    assert_eq!(err, ContractErrors::AttestationRevocationExpired.into());

    assert_eq!(
        setup
            .contract
            .get_attestations(&project_key, &commit_hash, &target)
            .len(),
        1
    );
}

#[test]
fn revoke_attestation_allowed_at_the_window_boundary() {
    let setup = create_test_data();
    let project_key = init_contract(&setup);
    let commit_hash = String::from_str(&setup.env, "6663520bd9e6ede248fef8157b2af0b6b6b41046");
    let target = types::AttestationTarget::Commit;

    setup.env.ledger().set_timestamp(1_000);
    setup
        .contract
        .attest(&setup.mando, &project_key, &commit_hash, &target, &None);

    setup
        .env
        .ledger()
        .set_timestamp(1_000 + types::ATTESTATION_REVOCATION_WINDOW);

    setup
        .contract
        .revoke_attestation(&setup.mando, &project_key, &commit_hash, &target);

    assert_eq!(
        setup
            .contract
            .get_attestations(&project_key, &commit_hash, &target)
            .len(),
        0
    );
}

#[test]
fn revoke_attestation_only_removes_the_callers_own() {
    let setup = create_test_data();

    init_contract(&setup);

    let third = Address::generate(&setup.env);
    let project_key = register_revocable_project(&setup, &third);
    let commit_hash = String::from_str(&setup.env, "6663520bd9e6ede248fef8157b2af0b6b6b41046");
    let target = types::AttestationTarget::Commit;

    setup
        .contract
        .attest(&setup.mando, &project_key, &commit_hash, &target, &None);
    setup
        .contract
        .attest(&setup.grogu, &project_key, &commit_hash, &target, &None);

    setup
        .contract
        .revoke_attestation(&setup.mando, &project_key, &commit_hash, &target);

    let remaining = setup
        .contract
        .get_attestations(&project_key, &commit_hash, &target);
    assert_eq!(remaining.len(), 1);
    assert_eq!(remaining.get(0).unwrap().attester, setup.grogu);
}

#[test]
fn revoke_attestation_is_scoped_to_the_target() {
    let setup = create_test_data();
    let project_key = init_contract(&setup);
    let commit_hash = String::from_str(&setup.env, "6663520bd9e6ede248fef8157b2af0b6b6b41046");
    let cid = String::from_str(
        &setup.env,
        "bafybeib6ioupho3p3pliusx7tgs7dvi6mpu2bwfhayj6w6ie44lo3vvc4i",
    );
    let evidence_target = types::AttestationTarget::Evidence(types::EvidenceKind::Sbom, cid);

    setup.contract.attest(
        &setup.mando,
        &project_key,
        &commit_hash,
        &types::AttestationTarget::Commit,
        &None,
    );
    setup.contract.attest(
        &setup.mando,
        &project_key,
        &commit_hash,
        &evidence_target,
        &None,
    );

    setup.contract.revoke_attestation(
        &setup.mando,
        &project_key,
        &commit_hash,
        &types::AttestationTarget::Commit,
    );

    assert_eq!(
        setup
            .contract
            .get_attestations(
                &project_key,
                &commit_hash,
                &types::AttestationTarget::Commit
            )
            .len(),
        0
    );
    assert_eq!(
        setup
            .contract
            .get_attestations(&project_key, &commit_hash, &evidence_target)
            .len(),
        1
    );
}

#[test]
fn revoke_then_attest_again_is_allowed_with_fresh_timestamp() {
    let setup = create_test_data();
    let project_key = init_contract(&setup);
    let commit_hash = String::from_str(&setup.env, "6663520bd9e6ede248fef8157b2af0b6b6b41046");
    let target = types::AttestationTarget::Commit;

    setup.env.ledger().set_timestamp(100);
    setup
        .contract
        .attest(&setup.mando, &project_key, &commit_hash, &target, &None);

    setup
        .contract
        .revoke_attestation(&setup.mando, &project_key, &commit_hash, &target);

    setup.env.ledger().set_timestamp(500);
    setup
        .contract
        .attest(&setup.mando, &project_key, &commit_hash, &target, &None);

    let attestations = setup
        .contract
        .get_attestations(&project_key, &commit_hash, &target);
    assert_eq!(attestations.len(), 1);
    assert_eq!(attestations.get(0).unwrap().created_at, 500);
}

#[test]
fn revoke_attestation_without_one_fails() {
    let setup = create_test_data();
    let project_key = init_contract(&setup);
    let commit_hash = String::from_str(&setup.env, "6663520bd9e6ede248fef8157b2af0b6b6b41046");
    let target = types::AttestationTarget::Commit;

    setup
        .contract
        .attest(&setup.mando, &project_key, &commit_hash, &target, &None);

    let err = setup
        .contract
        .try_revoke_attestation(&setup.grogu, &project_key, &commit_hash, &target)
        .unwrap_err()
        .unwrap();

    assert_eq!(err, ContractErrors::AttestationNotFound.into());
}

#[test]
fn revoke_attestation_on_untouched_target_fails() {
    let setup = create_test_data();
    let project_key = init_contract(&setup);
    let commit_hash = String::from_str(&setup.env, "6663520bd9e6ede248fef8157b2af0b6b6b41046");

    let err = setup
        .contract
        .try_revoke_attestation(
            &setup.mando,
            &project_key,
            &commit_hash,
            &types::AttestationTarget::Commit,
        )
        .unwrap_err()
        .unwrap();

    assert_eq!(err, ContractErrors::AttestationNotFound.into());
}

#[test]
fn revoke_attestation_by_a_stranger_finds_nothing() {
    let setup = create_test_data();
    let project_key = init_contract(&setup);
    let commit_hash = String::from_str(&setup.env, "6663520bd9e6ede248fef8157b2af0b6b6b41046");
    let target = types::AttestationTarget::Commit;

    setup
        .contract
        .attest(&setup.mando, &project_key, &commit_hash, &target, &None);

    let outsider = Address::generate(&setup.env);
    let err = setup
        .contract
        .try_revoke_attestation(&outsider, &project_key, &commit_hash, &target)
        .unwrap_err()
        .unwrap();

    assert_eq!(err, ContractErrors::AttestationNotFound.into());

    assert_eq!(
        setup
            .contract
            .get_attestations(&project_key, &commit_hash, &target)
            .len(),
        1
    );
}

#[test]
fn revoke_attestation_allowed_after_losing_maintainer_status() {
    let setup = create_test_data();
    let project_key = init_contract(&setup);
    let commit_hash = String::from_str(&setup.env, "6663520bd9e6ede248fef8157b2af0b6b6b41046");
    let target = types::AttestationTarget::Commit;

    setup
        .contract
        .attest(&setup.mando, &project_key, &commit_hash, &target, &None);

    let url = String::from_str(&setup.env, "github.com/tansu");
    let ipfs = String::from_str(&setup.env, "2ef4f49fdd8fa9dc463f1f06a094c26b88710990");
    let remaining = vec![&setup.env, setup.grogu.clone()];
    setup.contract.update_config(
        &setup.grogu,
        &project_key,
        &remaining,
        &url,
        &ipfs,
        &None,
        &None,
        &None,
    );

    setup
        .contract
        .revoke_attestation(&setup.mando, &project_key, &commit_hash, &target);

    assert_eq!(
        setup
            .contract
            .get_attestations(&project_key, &commit_hash, &target)
            .len(),
        0
    );
}

#[test]
fn revoke_attestation_rejects_empty_commit_hash() {
    let setup = create_test_data();
    let project_key = init_contract(&setup);

    let err = setup
        .contract
        .try_revoke_attestation(
            &setup.mando,
            &project_key,
            &String::from_str(&setup.env, ""),
            &types::AttestationTarget::Commit,
        )
        .unwrap_err()
        .unwrap();

    assert_eq!(err, ContractErrors::InvalidAttestation.into());
}

#[test]
fn revoke_attestation_rejects_empty_evidence_cid() {
    let setup = create_test_data();
    let project_key = init_contract(&setup);
    let commit_hash = String::from_str(&setup.env, "6663520bd9e6ede248fef8157b2af0b6b6b41046");

    let err = setup
        .contract
        .try_revoke_attestation(
            &setup.mando,
            &project_key,
            &commit_hash,
            &types::AttestationTarget::Evidence(
                types::EvidenceKind::Sbom,
                String::from_str(&setup.env, ""),
            ),
        )
        .unwrap_err()
        .unwrap();

    assert_eq!(err, ContractErrors::InvalidAttestation.into());
}

#[test]
fn finality_is_updated_against_a_threshold_raise() {
    let setup = create_test_data();
    init_contract(&setup);
    let third = Address::generate(&setup.env);
    let project_key = register_revocable_project(&setup, &third);
    let commit_hash = String::from_str(&setup.env, "6663520bd9e6ede248fef8157b2af0b6b6b41046");
    let target = types::AttestationTarget::Commit;

    setup
        .contract
        .set_attestation_threshold(&setup.grogu, &project_key, &Some(66));

    setup
        .contract
        .attest(&setup.mando, &project_key, &commit_hash, &target, &None);
    setup
        .contract
        .attest(&setup.grogu, &project_key, &commit_hash, &target, &None);

    let status = setup
        .contract
        .get_attestation_finality(&project_key, &commit_hash, &target);

    assert!(status.is_final);
    assert!(status.finalized_at.is_some());

    setup
        .contract
        .set_attestation_threshold(&setup.grogu, &project_key, &Some(100));

    let status = setup
        .contract
        .get_attestation_finality(&project_key, &commit_hash, &target);

    assert!(status.is_final, "finality must not be reversible");

    let err = setup
        .contract
        .try_revoke_attestation(&setup.grogu, &project_key, &commit_hash, &target)
        .unwrap_err()
        .unwrap();

    assert_eq!(err, ContractErrors::AttestationFinalized.into());
}

#[test]
fn finality_is_updated_against_maintainer_growth() {
    let setup = create_test_data();
    let project_key = init_contract(&setup);
    let commit_hash = String::from_str(&setup.env, "6663520bd9e6ede248fef8157b2af0b6b6b41046");
    let target = types::AttestationTarget::Commit;

    setup.env.ledger().set_timestamp(7_000);

    setup
        .contract
        .attest(&setup.mando, &project_key, &commit_hash, &target, &None);
    setup
        .contract
        .attest(&setup.grogu, &project_key, &commit_hash, &target, &None);

    let status = setup
        .contract
        .get_attestation_finality(&project_key, &commit_hash, &target);

    assert!(status.is_final);
    assert_eq!(status.finalized_at, Some(7_000));

    let url = String::from_str(&setup.env, "github.com/tansu");
    let ipfs = String::from_str(&setup.env, "2ef4f49fdd8fa9dc463f1f06a094c26b88710990");
    let grown = vec![
        &setup.env,
        setup.grogu.clone(),
        setup.mando.clone(),
        Address::generate(&setup.env),
        Address::generate(&setup.env),
    ];

    setup.contract.update_config(
        &setup.grogu,
        &project_key,
        &grown,
        &url,
        &ipfs,
        &None,
        &None,
        &None,
    );

    let status = setup
        .contract
        .get_attestation_finality(&project_key, &commit_hash, &target);

    assert_eq!(status.attested, 2);
    assert_eq!(status.total, 4);
    assert!(status.is_final, "finality must survive maintainer growth");
    assert_eq!(status.finalized_at, Some(7_000));
}

#[test]
fn finality_is_not_updated_before_the_threshold_is_reached() {
    let setup = create_test_data();
    let project_key = init_contract(&setup);
    let commit_hash = String::from_str(&setup.env, "6663520bd9e6ede248fef8157b2af0b6b6b41046");
    let target = types::AttestationTarget::Commit;

    setup
        .contract
        .attest(&setup.mando, &project_key, &commit_hash, &target, &None);

    let status = setup
        .contract
        .get_attestation_finality(&project_key, &commit_hash, &target);

    assert!(!status.is_final);
    assert_eq!(status.finalized_at, None);
}

#[test]
fn revoke_attestation_rejected_when_paused() {
    let setup = create_test_data();
    let project_key = init_contract(&setup);
    let commit_hash = String::from_str(&setup.env, "6663520bd9e6ede248fef8157b2af0b6b6b41046");
    let target = types::AttestationTarget::Commit;

    setup
        .contract
        .attest(&setup.mando, &project_key, &commit_hash, &target, &None);
    setup.contract.pause(&setup.contract_admin, &true);

    let err = setup
        .contract
        .try_revoke_attestation(&setup.mando, &project_key, &commit_hash, &target)
        .unwrap_err()
        .unwrap();

    assert_eq!(err, ContractErrors::ContractPaused.into());
}

#[test]
fn revoke_attestation_fails_without_any_authorization() {
    let setup = create_test_data();
    let project_key = init_contract(&setup);
    let commit_hash = String::from_str(&setup.env, "6663520bd9e6ede248fef8157b2af0b6b6b41046");
    let target = types::AttestationTarget::Commit;

    setup
        .contract
        .attest(&setup.mando, &project_key, &commit_hash, &target, &None);

    setup.env.mock_auths(&[]);

    let result =
        setup
            .contract
            .try_revoke_attestation(&setup.mando, &project_key, &commit_hash, &target);

    assert!(
        result.is_err(),
        "revoke_attestation must require the attester's authorization"
    );
}

fn register_full_project(
    setup: &super::test_utils::TestSetup,
) -> (Bytes, soroban_sdk::Vec<Address>) {
    let name = String::from_str(&setup.env, "capacity");
    let url = String::from_str(&setup.env, "github.com/capacity");
    let ipfs = String::from_str(&setup.env, "2ef4f49fdd8fa9dc463f1f06a094c26b88710994");

    let mut maintainers = soroban_sdk::Vec::new(&setup.env);

    maintainers.push_back(setup.grogu.clone());
    for _ in 1..25 {
        maintainers.push_back(Address::generate(&setup.env));
    }

    setup
        .token_stellar
        .mint(&setup.grogu, &(1_000_000_000 * 10_000_000));

    let project_key = setup.contract.register(
        &setup.grogu,
        &name,
        &maintainers,
        &url,
        &ipfs,
        &None,
        &None,
        &None,
    );

    (project_key, maintainers)
}

#[test]
fn attestations_are_capped_at_the_maintainer_count() {
    let setup = create_test_data();
    let (project_key, maintainers) = register_full_project(&setup);
    let commit_hash = String::from_str(&setup.env, "6663520bd9e6ede248fef8157b2af0b6b6b41046");
    let target = types::AttestationTarget::Commit;

    for maintainer in maintainers.iter() {
        setup
            .contract
            .attest(&maintainer, &project_key, &commit_hash, &target, &None);
    }

    let attestations = setup
        .contract
        .get_attestations(&project_key, &commit_hash, &target);

    assert_eq!(attestations.len(), 25);

    let status = setup
        .contract
        .get_attestation_finality(&project_key, &commit_hash, &target);

    assert_eq!(status.attested, 25);
    assert_eq!(status.total, 25);
    assert!(status.is_final);
}

#[test]
fn attest_at_capacity_prunes_only_stale_maintainers() {
    let setup = create_test_data();
    let (project_key, maintainers) = register_full_project(&setup);
    let commit_hash = String::from_str(&setup.env, "6663520bd9e6ede248fef8157b2af0b6b6b41046");
    let target = types::AttestationTarget::Commit;

    for maintainer in maintainers.iter() {
        setup
            .contract
            .attest(&maintainer, &project_key, &commit_hash, &target, &None);
    }

    let stale = maintainers.get(7).unwrap();
    let new_attester = Address::generate(&setup.env);

    let mut swapped = soroban_sdk::Vec::new(&setup.env);

    for maintainer in maintainers.iter() {
        if maintainer == stale {
            swapped.push_back(new_attester.clone());
        } else {
            swapped.push_back(maintainer);
        }
    }

    let url = String::from_str(&setup.env, "github.com/capacity");
    let ipfs = String::from_str(&setup.env, "2ef4f49fdd8fa9dc463f1f06a094c26b88710994");

    setup.contract.update_config(
        &setup.grogu,
        &project_key,
        &swapped,
        &url,
        &ipfs,
        &None,
        &None,
        &None,
    );

    setup
        .contract
        .attest(&new_attester, &project_key, &commit_hash, &target, &None);

    let attestations = setup
        .contract
        .get_attestations(&project_key, &commit_hash, &target);

    assert_eq!(attestations.len(), 25);

    let mut attesters = soroban_sdk::Vec::new(&setup.env);

    for attestation in attestations.iter() {
        attesters.push_back(attestation.attester);
    }

    assert!(
        !attesters.contains(&stale),
        "the stale maintainer's attestation should have been pruned"
    );
    assert!(attesters.contains(&new_attester));

    for maintainer in swapped.iter() {
        assert!(
            attesters.contains(&maintainer),
            "no current maintainer's attestation may be evicted"
        );
    }
}

#[test]
fn revoking_frees_a_slot_at_capacity() {
    let setup = create_test_data();
    let (project_key, maintainers) = register_full_project(&setup);
    let commit_hash = String::from_str(&setup.env, "6663520bd9e6ede248fef8157b2af0b6b6b41046");
    let target = types::AttestationTarget::Commit;

    for i in 0..16 {
        setup.contract.attest(
            &maintainers.get(i).unwrap(),
            &project_key,
            &commit_hash,
            &target,
            &None,
        );
    }

    assert!(
        !setup
            .contract
            .get_attestation_finality(&project_key, &commit_hash, &target)
            .is_final
    );

    setup
        .contract
        .revoke_attestation(&setup.grogu, &project_key, &commit_hash, &target);

    assert_eq!(
        setup
            .contract
            .get_attestations(&project_key, &commit_hash, &target)
            .len(),
        15
    );

    setup
        .contract
        .attest(&setup.grogu, &project_key, &commit_hash, &target, &None);

    assert_eq!(
        setup
            .contract
            .get_attestations(&project_key, &commit_hash, &target)
            .len(),
        16
    );
}

#[test]
fn stale_attestationes_stop_counting_and_resume_when_re_added() {
    let setup = create_test_data();
    let project_key = init_contract(&setup);
    let commit_hash = String::from_str(&setup.env, "6663520bd9e6ede248fef8157b2af0b6b6b41046");
    let target = types::AttestationTarget::Commit;

    setup
        .contract
        .attest(&setup.mando, &project_key, &commit_hash, &target, &None);

    let status = setup
        .contract
        .get_attestation_finality(&project_key, &commit_hash, &target);

    assert_eq!(status.attested, 1);
    assert_eq!(status.total, 2);

    let url = String::from_str(&setup.env, "github.com/tansu");
    let ipfs = String::from_str(&setup.env, "2ef4f49fdd8fa9dc463f1f06a094c26b88710990");

    let without_mando = vec![&setup.env, setup.grogu.clone()];
    setup.contract.update_config(
        &setup.grogu,
        &project_key,
        &without_mando,
        &url,
        &ipfs,
        &None,
        &None,
        &None,
    );

    let status = setup
        .contract
        .get_attestation_finality(&project_key, &commit_hash, &target);

    assert_eq!(
        status.attested, 0,
        "a former maintainer's attestation must not count"
    );
    assert_eq!(status.total, 1);
    assert!(!status.is_final);

    assert_eq!(
        setup
            .contract
            .get_attestations(&project_key, &commit_hash, &target)
            .len(),
        1
    );

    let with_mando = vec![&setup.env, setup.grogu.clone(), setup.mando.clone()];

    setup.contract.update_config(
        &setup.grogu,
        &project_key,
        &with_mando,
        &url,
        &ipfs,
        &None,
        &None,
        &None,
    );

    let status = setup
        .contract
        .get_attestation_finality(&project_key, &commit_hash, &target);

    assert_eq!(
        status.attested, 1,
        "re-adding the maintainer revives the attestation"
    );
    assert_eq!(status.total, 2);
}

#[test]
fn re_added_maintainer_cannot_attest_twice() {
    let setup = create_test_data();
    let project_key = init_contract(&setup);
    let commit_hash = String::from_str(&setup.env, "6663520bd9e6ede248fef8157b2af0b6b6b41046");
    let target = types::AttestationTarget::Commit;

    setup
        .contract
        .attest(&setup.mando, &project_key, &commit_hash, &target, &None);

    let url = String::from_str(&setup.env, "github.com/tansu");
    let ipfs = String::from_str(&setup.env, "2ef4f49fdd8fa9dc463f1f06a094c26b88710990");

    setup.contract.update_config(
        &setup.grogu,
        &project_key,
        &vec![&setup.env, setup.grogu.clone()],
        &url,
        &ipfs,
        &None,
        &None,
        &None,
    );
    setup.contract.update_config(
        &setup.grogu,
        &project_key,
        &vec![&setup.env, setup.grogu.clone(), setup.mando.clone()],
        &url,
        &ipfs,
        &None,
        &None,
        &None,
    );

    let err = setup
        .contract
        .try_attest(&setup.mando, &project_key, &commit_hash, &target, &None)
        .unwrap_err()
        .unwrap();

    assert_eq!(err, ContractErrors::AlreadyAttested.into());
}

#[test]
fn evidence_kinds_are_independent_targets() {
    let setup = create_test_data();
    let project_key = init_contract(&setup);
    let commit_hash = String::from_str(&setup.env, "6663520bd9e6ede248fef8157b2af0b6b6b41046");
    let cid = String::from_str(
        &setup.env,
        "bafybeib6ioupho3p3pliusx7tgs7dvi6mpu2bwfhayj6w6ie44lo3vvc4i",
    );

    let sbom = types::AttestationTarget::Evidence(types::EvidenceKind::Sbom, cid.clone());
    let cve = types::AttestationTarget::Evidence(types::EvidenceKind::Cve, cid);

    setup
        .contract
        .attest(&setup.mando, &project_key, &commit_hash, &sbom, &None);

    assert_eq!(
        setup
            .contract
            .get_attestations(&project_key, &commit_hash, &sbom)
            .len(),
        1
    );
    assert_eq!(
        setup
            .contract
            .get_attestations(&project_key, &commit_hash, &cve)
            .len(),
        0,
        "same CID under a different evidence kind must be a distinct target"
    );
}

#[test]
fn attestations_are_independent_across_projects() {
    let setup = create_test_data();
    let first = init_contract(&setup);
    let second = register_second_project(&setup);
    let commit_hash = String::from_str(&setup.env, "6663520bd9e6ede248fef8157b2af0b6b6b41046");
    let target = types::AttestationTarget::Commit;

    setup
        .contract
        .attest(&setup.mando, &first, &commit_hash, &target, &None);

    assert_eq!(
        setup
            .contract
            .get_attestations(&first, &commit_hash, &target)
            .len(),
        1
    );
    assert_eq!(
        setup
            .contract
            .get_attestations(&second, &commit_hash, &target)
            .len(),
        0,
        "the same commit in another project must be a distinct target"
    );
}

#[test]
fn attest_rejects_empty_evidence_cid() {
    let setup = create_test_data();
    let project_key = init_contract(&setup);
    let commit_hash = String::from_str(&setup.env, "6663520bd9e6ede248fef8157b2af0b6b6b41046");

    let err = setup
        .contract
        .try_attest(
            &setup.mando,
            &project_key,
            &commit_hash,
            &types::AttestationTarget::Evidence(
                types::EvidenceKind::Sbom,
                String::from_str(&setup.env, ""),
            ),
            &None,
        )
        .unwrap_err()
        .unwrap();

    assert_eq!(err, ContractErrors::InvalidAttestation.into());
}

#[test]
fn revoking_from_the_middle_preserves_chronological_order() {
    let setup = create_test_data();
    let (project_key, maintainers) = register_full_project(&setup);
    let commit_hash = String::from_str(&setup.env, "6663520bd9e6ede248fef8157b2af0b6b6b41046");
    let target = types::AttestationTarget::Commit;

    let first = maintainers.get(0).unwrap();
    let middle = maintainers.get(1).unwrap();
    let last = maintainers.get(2).unwrap();

    setup.env.ledger().set_timestamp(100);
    setup
        .contract
        .attest(&first, &project_key, &commit_hash, &target, &None);

    setup.env.ledger().set_timestamp(200);
    setup
        .contract
        .attest(&middle, &project_key, &commit_hash, &target, &None);

    setup.env.ledger().set_timestamp(300);
    setup
        .contract
        .attest(&last, &project_key, &commit_hash, &target, &None);

    setup
        .contract
        .revoke_attestation(&middle, &project_key, &commit_hash, &target);

    let attestations = setup
        .contract
        .get_attestations(&project_key, &commit_hash, &target);

    assert_eq!(attestations.len(), 2);
    assert_eq!(attestations.get(0).unwrap().created_at, 100);
    assert_eq!(attestations.get(1).unwrap().created_at, 300);
    assert_eq!(attestations.get(0).unwrap().attester, first);
    assert_eq!(attestations.get(1).unwrap().attester, last);
}

#[test]
fn revoking_the_last_attestation_removes_the_storage_entry() {
    let setup = create_test_data();
    let project_key = init_contract(&setup);
    let commit_hash = String::from_str(&setup.env, "6663520bd9e6ede248fef8157b2af0b6b6b41046");
    let target = types::AttestationTarget::Commit;

    let key = setup.env.as_contract(&setup.contract_id, || {
        crate::contract_versioning::attestation_key(&setup.env, &project_key, &commit_hash, &target)
    });

    setup
        .contract
        .attest(&setup.mando, &project_key, &commit_hash, &target, &None);

    assert!(setup.env.as_contract(&setup.contract_id, || {
        setup.env.storage().persistent().has(&key)
    }));

    setup
        .contract
        .revoke_attestation(&setup.mando, &project_key, &commit_hash, &target);

    assert!(
        !setup.env.as_contract(&setup.contract_id, || {
            setup.env.storage().persistent().has(&key)
        }),
        "the entry must be removed, not left as an empty vector"
    );
}

#[test]
fn lowering_the_threshold_into_finality_freezes_attestations() {
    let setup = create_test_data();
    init_contract(&setup);
    let third = Address::generate(&setup.env);
    let project_key = register_revocable_project(&setup, &third);
    let commit_hash = String::from_str(&setup.env, "6663520bd9e6ede248fef8157b2af0b6b6b41046");
    let target = types::AttestationTarget::Commit;

    setup
        .contract
        .attest(&setup.grogu, &project_key, &commit_hash, &target, &None);
    setup
        .contract
        .attest(&setup.mando, &project_key, &commit_hash, &target, &None);

    assert!(
        !setup
            .contract
            .get_attestation_finality(&project_key, &commit_hash, &target)
            .is_final
    );

    setup
        .contract
        .set_attestation_threshold(&setup.grogu, &project_key, &Some(66));

    assert!(
        setup
            .contract
            .get_attestation_finality(&project_key, &commit_hash, &target)
            .is_final
    );

    let err = setup
        .contract
        .try_revoke_attestation(&setup.grogu, &project_key, &commit_hash, &target)
        .unwrap_err()
        .unwrap();

    assert_eq!(err, ContractErrors::AttestationFinalized.into());
}

#[test]
fn shrinking_the_maintainer_set_into_finality_freezes_attestations() {
    let setup = create_test_data();

    init_contract(&setup);

    let third = Address::generate(&setup.env);

    let name = String::from_str(&setup.env, "shrinking");
    let url = String::from_str(&setup.env, "github.com/shrinking");
    let ipfs = String::from_str(&setup.env, "2ef4f49fdd8fa9dc463f1f06a094c26b88710995");
    let maintainers = vec![
        &setup.env,
        setup.grogu.clone(),
        setup.mando.clone(),
        third.clone(),
    ];

    setup
        .token_stellar
        .mint(&setup.grogu, &(1_000_000_000 * 10_000_000));

    let project_key = setup.contract.register(
        &setup.grogu,
        &name,
        &maintainers,
        &url,
        &ipfs,
        &None,
        &None,
        &Some(66),
    );

    let commit_hash = String::from_str(&setup.env, "6663520bd9e6ede248fef8157b2af0b6b6b41046");
    let target = types::AttestationTarget::Commit;

    setup
        .contract
        .attest(&setup.mando, &project_key, &commit_hash, &target, &None);

    assert!(
        !setup
            .contract
            .get_attestation_finality(&project_key, &commit_hash, &target)
            .is_final
    );

    setup.contract.update_config(
        &setup.grogu,
        &project_key,
        &vec![&setup.env, setup.mando.clone()],
        &url,
        &ipfs,
        &None,
        &None,
        &None,
    );

    let status = setup
        .contract
        .get_attestation_finality(&project_key, &commit_hash, &target);

    assert_eq!(status.attested, 1);
    assert_eq!(status.total, 1);
    assert!(status.is_final);

    let err = setup
        .contract
        .try_revoke_attestation(&setup.mando, &project_key, &commit_hash, &target)
        .unwrap_err()
        .unwrap();

    assert_eq!(err, ContractErrors::AttestationFinalized.into());
}

#[test]
fn a_rejected_call_emits_no_event() {
    let setup = create_test_data();
    let project_key = init_contract(&setup);
    let commit_hash = String::from_str(&setup.env, "6663520bd9e6ede248fef8157b2af0b6b6b41046");
    let target = types::AttestationTarget::Commit;

    setup
        .contract
        .attest(&setup.mando, &project_key, &commit_hash, &target, &None);

    let rejected =
        setup
            .contract
            .try_attest(&setup.mando, &project_key, &commit_hash, &target, &None);

    assert!(rejected.is_err());

    let empty: [soroban_sdk::xdr::ContractEvent; 0] = [];

    assert_eq!(
        setup
            .env
            .events()
            .all()
            .filter_by_contract(&setup.contract_id),
        empty,
        "a reverted invocation must leave no event behind"
    );
}
