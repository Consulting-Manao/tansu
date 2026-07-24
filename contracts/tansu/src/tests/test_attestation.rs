use super::test_utils::{create_test_data, init_contract};
use crate::errors::ContractErrors;
use crate::events::AttestationThresholdSet;
use crate::types;
use soroban_sdk::testutils::{Address as _, Events};
use soroban_sdk::{Address, Bytes, Event, String, vec};

fn register_second_project(setup: &super::test_utils::TestSetup) -> Bytes {
    let name = String::from_str(&setup.env, "tansu2");
    let url = String::from_str(&setup.env, "github.com/tansu2");
    let ipfs = String::from_str(&setup.env, "2ef4f49fdd8fa9dc463f1f06a094c26b88710991");
    let maintainers = vec![&setup.env, setup.grogu.clone(), setup.mando.clone()];

    setup
        .contract
        .register(&setup.grogu, &name, &maintainers, &url, &ipfs)
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
        .set_attestation_threshold(&setup.mando, &project_key, &75);

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
        &types::MIN_FINALITY_THRESHOLD_PERCENT,
    );

    assert_eq!(
        setup.contract.get_attestation_threshold(&project_key),
        types::MIN_FINALITY_THRESHOLD_PERCENT
    );

    setup
        .contract
        .set_attestation_threshold(&setup.mando, &project_key, &100);

    assert_eq!(setup.contract.get_attestation_threshold(&project_key), 100);
}

#[test]
fn set_attestation_threshold_rejects_below_floor() {
    let setup = create_test_data();
    let project_key = init_contract(&setup);

    let too_low = types::MIN_FINALITY_THRESHOLD_PERCENT - 1;
    let err = setup
        .contract
        .try_set_attestation_threshold(&setup.mando, &project_key, &too_low)
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
        .try_set_attestation_threshold(&setup.mando, &project_key, &101)
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
        .try_set_attestation_threshold(&outsider, &project_key, &70)
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
        .try_set_attestation_threshold(&setup.mando, &project_key, &70)
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
        .set_attestation_threshold(&setup.mando, &project_a, &80);

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
        &types::MIN_FINALITY_THRESHOLD_PERCENT,
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
        String::from_str(&setup.env, "bafybeigdyrzt"),
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
        String::from_str(&setup.env, "bafybeigdyrzt"),
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
