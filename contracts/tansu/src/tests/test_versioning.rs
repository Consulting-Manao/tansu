use super::test_utils::{create_test_data, init_contract};
use crate::errors::ContractErrors;
use crate::events::{Commit, EvidenceSet};
use crate::types::EvidenceKind;
use soroban_sdk::testutils::{Address as _, Events, Ledger};
use soroban_sdk::{Address, Bytes, Event, String, vec};

#[test]
fn commit_flow() {
    let setup = create_test_data();
    let id = init_contract(&setup);

    let hash = String::from_str(&setup.env, "6663520bd9e6ede248fef8157b2af0b6b6b41046");
    setup.contract.commit(&setup.mando, &id, &hash);

    let stored = setup.contract.get_commit(&id);
    assert_eq!(stored, hash);
}

#[test]
fn commit_events() {
    let setup = create_test_data();
    let id = init_contract(&setup);

    let hash_commit = String::from_str(&setup.env, "6663520bd9e6ede248fef8157b2af0b6b6b41046");
    setup.contract.commit(&setup.mando, &id, &hash_commit);

    let event = Commit {
        project_key: id.clone(),
        hash: hash_commit,
    };

    assert_eq!(
        setup
            .env
            .events()
            .all()
            .filter_by_contract(&setup.contract_id),
        [event.to_xdr(&setup.env, &setup.contract_id)]
    );
}

#[test]
fn commit_unregistered_maintainer_error() {
    let setup = create_test_data();
    let id = init_contract(&setup);

    // unregistered maintainer commit
    let bob = Address::generate(&setup.env);
    let hash_commit = String::from_str(&setup.env, "deadbeef");
    let err = setup
        .contract
        .try_commit(&bob, &id, &hash_commit)
        .unwrap_err()
        .unwrap();
    assert_eq!(err, ContractErrors::UnauthorizedSigner.into());
}

#[test]
fn test_anonymous_vote_commitment_validation() {
    let setup = create_test_data();
    let id = init_contract(&setup);

    // Setup anonymous voting first
    setup.contract.anonymous_voting_setup(
        &setup.grogu,
        &id,
        &String::from_str(&setup.env, "test_public_key"),
    );

    // Test mismatched votes and seeds length
    let result = setup.contract.try_build_commitments_from_votes(
        &id,
        &vec![&setup.env, 1u128, 2u128], // 2 votes
        &vec![&setup.env, 1u128],        // 1 seed - mismatch!
    );

    assert_eq!(
        result,
        Err(Ok(soroban_sdk::Error::from_contract_error(
            ContractErrors::TallySeedError as u32
        )))
    );
}

/// Test malformed inputs for build_commitments_from_votes with mismatched lengths
#[test]
fn test_malformed_commitments_mismatched_lengths() {
    let setup = create_test_data();
    let id = init_contract(&setup);

    // Setup anonymous voting
    setup.contract.anonymous_voting_setup(
        &setup.grogu,
        &id,
        &String::from_str(&setup.env, "test_public_key"),
    );

    // Test mismatched votes and seeds length - votes longer
    let result = setup.contract.try_build_commitments_from_votes(
        &id,
        &vec![&setup.env, 1u128, 2u128, 3u128, 4u128], // 4 votes
        &vec![&setup.env, 1u128, 2u128, 3u128],        // 3 seeds - mismatch!
    );

    assert_eq!(
        result,
        Err(Ok(soroban_sdk::Error::from_contract_error(
            ContractErrors::TallySeedError as u32
        )))
    );

    // Test mismatched votes and seeds length - seeds longer
    let result2 = setup.contract.try_build_commitments_from_votes(
        &id,
        &vec![&setup.env, 1u128, 2u128],        // 2 votes
        &vec![&setup.env, 1u128, 2u128, 3u128], // 3 seeds - mismatch!
    );

    assert_eq!(
        result2,
        Err(Ok(soroban_sdk::Error::from_contract_error(
            ContractErrors::TallySeedError as u32
        )))
    );
}

// --------- Evidence --------- //

#[test]
fn set_evidence_stores_and_emits_event() {
    let setup = create_test_data();
    let project_key = init_contract(&setup);

    setup.env.ledger().set_timestamp(12_345);

    let commit_hash = String::from_str(&setup.env, "6663520bd9e6ede248fef8157b2af0b6b6b41046");
    let kind = EvidenceKind::Sbom;
    let cid = String::from_str(&setup.env, "bafybeigdyrzt");

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

    let history = setup
        .contract
        .get_evidence(&project_key, &commit_hash, &kind);
    assert_eq!(history.len(), 1);
    let latest = history.last().unwrap();
    assert_eq!(latest.cid, cid);
    assert_eq!(latest.created_at, 12_345);
}

#[test]
fn set_evidence_appends_history_oldest_first() {
    let setup = create_test_data();
    let project_key = init_contract(&setup);

    let commit_hash = String::from_str(&setup.env, "commit-a");
    let kind = EvidenceKind::Cve;
    let first_cid = String::from_str(&setup.env, "bafybeigfirst");
    let second_cid = String::from_str(&setup.env, "bafybeigsecond");

    // A later re-scan of the same commit must not overwrite the first entry.
    setup
        .contract
        .set_evidence(&setup.mando, &project_key, &commit_hash, &kind, &first_cid);
    setup
        .contract
        .set_evidence(&setup.mando, &project_key, &commit_hash, &kind, &second_cid);

    let history = setup
        .contract
        .get_evidence(&project_key, &commit_hash, &kind);
    assert_eq!(history.len(), 2);
    assert_eq!(history.get(0).unwrap().cid, first_cid);
    assert_eq!(history.get(1).unwrap().cid, second_cid);
}

#[test]
fn set_evidence_bounds_history_and_rolls_off_oldest() {
    let setup = create_test_data();
    let project_key = init_contract(&setup);

    let commit_hash = String::from_str(&setup.env, "commit-a");
    let kind = EvidenceKind::Sbom;

    // Record more than the on-chain cap (MAX_EVIDENCE = 10).
    let cids = [
        "c00", "c01", "c02", "c03", "c04", "c05", "c06", "c07", "c08", "c09", "c10", "c11",
    ];
    for cid in cids.iter() {
        setup.contract.set_evidence(
            &setup.mando,
            &project_key,
            &commit_hash,
            &kind,
            &String::from_str(&setup.env, cid),
        );
    }

    let history = setup
        .contract
        .get_evidence(&project_key, &commit_hash, &kind);
    // Only the most recent 10 are kept; the two oldest rolled off.
    assert_eq!(history.len(), 10);
    assert_eq!(
        history.get(0).unwrap().cid,
        String::from_str(&setup.env, "c02")
    );
    assert_eq!(
        history.last().unwrap().cid,
        String::from_str(&setup.env, "c11")
    );
}

#[test]
fn get_evidence_is_empty_when_absent() {
    let setup = create_test_data();
    let commit_hash = String::from_str(&setup.env, "commit-a");

    // No evidence recorded yet for an existing project.
    let project_key = init_contract(&setup);
    let history = setup
        .contract
        .get_evidence(&project_key, &commit_hash, &EvidenceKind::Sbom);
    assert!(history.is_empty());

    // Unknown project: still an empty history rather than a panic.
    let unknown = Bytes::from_array(&setup.env, &[7; 32]);
    let history = setup
        .contract
        .get_evidence(&unknown, &commit_hash, &EvidenceKind::Sbom);
    assert!(history.is_empty());
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
            &String::from_str(&setup.env, "commit-a"),
            &EvidenceKind::Sbom,
            &String::from_str(&setup.env, "bafybeigdyrzt"),
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
            &String::from_str(&setup.env, "bafybeigdyrzt"),
        )
        .unwrap_err()
        .unwrap();
    assert_eq!(err, ContractErrors::InvalidEvidence.into());

    let err = setup
        .contract
        .try_set_evidence(
            &setup.mando,
            &project_key,
            &String::from_str(&setup.env, "commit-a"),
            &kind,
            &String::from_str(&setup.env, ""),
        )
        .unwrap_err()
        .unwrap();
    assert_eq!(err, ContractErrors::InvalidEvidence.into());
}

#[test]
fn evidence_is_scoped_per_commit_hash() {
    let setup = create_test_data();
    let project_key = init_contract(&setup);

    let first_commit = String::from_str(&setup.env, "commit-a");
    let second_commit = String::from_str(&setup.env, "commit-b");
    let first_cid = String::from_str(&setup.env, "bafybeigfirst");
    let second_cid = String::from_str(&setup.env, "bafybeigsecond");

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

    assert_eq!(first.last().unwrap().cid, first_cid);
    assert_eq!(second.last().unwrap().cid, second_cid);
}

#[test]
fn evidence_is_scoped_per_kind() {
    let setup = create_test_data();
    let project_key = init_contract(&setup);
    let commit_hash = String::from_str(&setup.env, "commit-a");

    let sbom_cid = String::from_str(&setup.env, "bafybeigsbom");
    let cve_cid = String::from_str(&setup.env, "bafybeigcve");

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
    let attestation =
        setup
            .contract
            .get_evidence(&project_key, &commit_hash, &EvidenceKind::Attestation);

    assert_eq!(sbom.last().unwrap().cid, sbom_cid);
    assert_eq!(cve.last().unwrap().cid, cve_cid);
    assert!(attestation.is_empty());
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
            &String::from_str(&setup.env, "commit-a"),
            &EvidenceKind::Sbom,
            &String::from_str(&setup.env, "bafybeigdyrzt"),
        )
        .unwrap_err()
        .unwrap();
    assert_eq!(err, ContractErrors::ContractPaused.into());
}
