use super::test_utils::{create_test_data, init_contract};
use crate::errors::ContractErrors;
use crate::events::EvidenceSet;
use crate::types::EvidenceKind;
use soroban_sdk::testutils::{Address as _, Events, Ledger};
use soroban_sdk::{Address, Bytes, Event, String};

fn commit_hash(env: &soroban_sdk::Env, value: &str) -> String {
    String::from_str(env, value)
}

fn cid(env: &soroban_sdk::Env, value: &str) -> String {
    String::from_str(env, value)
}

#[test]
fn set_evidence_stores_retrieves_and_emits_event() {
    let setup = create_test_data();
    let project_key = init_contract(&setup);

    setup.env.ledger().set_timestamp(12_345);

    let commit_hash = commit_hash(&setup.env, "6663520bd9e6ede248fef8157b2af0b6b6b41046");
    let kind = EvidenceKind::Sbom;
    let cid = cid(&setup.env, "bafybeigdyrzt");

    setup
        .contract
        .set_evidence(&setup.mando, &project_key, &commit_hash, &kind, &cid);

    let event = EvidenceSet {
        project_key: project_key.clone(),
        commit_hash: commit_hash.clone(),
        kind: kind.clone(),
        cid: cid.clone(),
    };

    assert_eq!(
        setup
            .env
            .events()
            .all()
            .filter_by_contract(&setup.contract_id),
        [event.to_xdr(&setup.env, &setup.contract_id)]
    );

    let stored = setup
        .contract
        .get_evidence(&project_key, &commit_hash, &kind);
    assert_eq!(stored.cid, cid);
    assert_eq!(stored.created_at, 12_345);
}

#[test]
fn set_evidence_requires_project_maintainer() {
    let setup = create_test_data();
    let project_key = init_contract(&setup);
    let outsider = Address::generate(&setup.env);

    let err = setup
        .contract
        .try_set_evidence(
            &outsider,
            &project_key,
            &commit_hash(&setup.env, "commit-a"),
            &EvidenceKind::Sbom,
            &cid(&setup.env, "bafybeigdyrzt"),
        )
        .unwrap_err()
        .unwrap();

    assert_eq!(err, ContractErrors::UnauthorizedSigner.into());
}

#[test]
fn set_evidence_rejects_empty_commit_hash_or_cid() {
    let setup = create_test_data();
    let project_key = init_contract(&setup);
    let kind = EvidenceKind::Sbom;

    let err = setup
        .contract
        .try_set_evidence(
            &setup.mando,
            &project_key,
            &String::from_str(&setup.env, ""),
            &kind,
            &cid(&setup.env, "bafybeigdyrzt"),
        )
        .unwrap_err()
        .unwrap();
    assert_eq!(err, ContractErrors::InvalidEvidence.into());

    let err = setup
        .contract
        .try_set_evidence(
            &setup.mando,
            &project_key,
            &commit_hash(&setup.env, "commit-a"),
            &kind,
            &String::from_str(&setup.env, ""),
        )
        .unwrap_err()
        .unwrap();
    assert_eq!(err, ContractErrors::InvalidEvidence.into());
}

#[test]
fn get_evidence_fails_when_missing() {
    let setup = create_test_data();
    let project_key = init_contract(&setup);

    let err = setup
        .contract
        .try_get_evidence(
            &project_key,
            &commit_hash(&setup.env, "commit-a"),
            &EvidenceKind::Sbom,
        )
        .unwrap_err()
        .unwrap();

    assert_eq!(err, ContractErrors::NoEvidenceFound.into());
}

#[test]
fn get_evidence_fails_when_project_is_missing() {
    let setup = create_test_data();
    let project_key = Bytes::from_array(&setup.env, &[7; 32]);

    let err = setup
        .contract
        .try_get_evidence(
            &project_key,
            &commit_hash(&setup.env, "commit-a"),
            &EvidenceKind::Sbom,
        )
        .unwrap_err()
        .unwrap();

    assert_eq!(err, ContractErrors::InvalidKey.into());
}

#[test]
fn evidence_is_scoped_per_commit_hash() {
    let setup = create_test_data();
    let project_key = init_contract(&setup);

    let first_commit = commit_hash(&setup.env, "commit-a");
    let second_commit = commit_hash(&setup.env, "commit-b");
    let first_cid = cid(&setup.env, "bafybeigfirst");
    let second_cid = cid(&setup.env, "bafybeigsecond");

    setup.contract.set_evidence(
        &setup.mando,
        &project_key,
        &first_commit,
        &EvidenceKind::Sbom,
        &first_cid,
    );
    setup.contract.set_evidence(
        &setup.mando,
        &project_key,
        &second_commit,
        &EvidenceKind::Sbom,
        &second_cid,
    );

    let first = setup
        .contract
        .get_evidence(&project_key, &first_commit, &EvidenceKind::Sbom);
    let second = setup
        .contract
        .get_evidence(&project_key, &second_commit, &EvidenceKind::Sbom);

    assert_eq!(first.cid, first_cid);
    assert_eq!(second.cid, second_cid);
}

#[test]
fn evidence_is_scoped_per_kind() {
    let setup = create_test_data();
    let project_key = init_contract(&setup);
    let commit_hash = commit_hash(&setup.env, "commit-a");

    let sbom_cid = cid(&setup.env, "bafybeigsbom");
    let cve_cid = cid(&setup.env, "bafybeigcve");

    setup.contract.set_evidence(
        &setup.mando,
        &project_key,
        &commit_hash,
        &EvidenceKind::Sbom,
        &sbom_cid,
    );
    setup.contract.set_evidence(
        &setup.mando,
        &project_key,
        &commit_hash,
        &EvidenceKind::Cve,
        &cve_cid,
    );

    let sbom = setup
        .contract
        .get_evidence(&project_key, &commit_hash, &EvidenceKind::Sbom);
    let cve = setup
        .contract
        .get_evidence(&project_key, &commit_hash, &EvidenceKind::Cve);
    let missing_attestation =
        setup
            .contract
            .try_get_evidence(&project_key, &commit_hash, &EvidenceKind::Attestation);

    assert_eq!(sbom.cid, sbom_cid);
    assert_eq!(cve.cid, cve_cid);
    assert_eq!(
        missing_attestation,
        Err(Ok(ContractErrors::NoEvidenceFound.into()))
    );
}

#[test]
fn set_evidence_fails_when_contract_is_paused() {
    let setup = create_test_data();
    let project_key = init_contract(&setup);

    setup.contract.pause(&setup.contract_admin, &true);

    let err = setup
        .contract
        .try_set_evidence(
            &setup.mando,
            &project_key,
            &commit_hash(&setup.env, "commit-a"),
            &EvidenceKind::Sbom,
            &cid(&setup.env, "bafybeigdyrzt"),
        )
        .unwrap_err()
        .unwrap();

    assert_eq!(err, ContractErrors::ContractPaused.into());
}
