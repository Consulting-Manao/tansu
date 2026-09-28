use super::test_utils::{create_test_data, init_contract};
use crate::errors::ContractErrors;
use crate::types::{AttestationTarget, EvidenceKind};
use soroban_sdk::testutils::Address as _;
use soroban_sdk::{Address, Bytes, BytesN, String, vec};

const COMMIT: &str = "6663520bd9e6ede248fef8157b2af0b6b6b41046";

fn long_string(env: &soroban_sdk::Env, len: usize) -> String {
    String::from_bytes(env, &[b'a'; 512][..len])
}

#[test]
fn project_names_are_four_to_thirty_characters() {
    let setup = create_test_data();
    let env = &setup.env;
    setup
        .token_stellar
        .mint(&setup.grogu, &(1_000_000_000 * 10_000_000));
    let register = |name: &str| {
        setup.contract.try_register(
            &setup.grogu,
            &String::from_str(env, name),
            &vec![env, setup.grogu.clone()],
            &String::from_str(env, "github.com/tansu"),
            &String::from_str(env, COMMIT),
            &None,
            &None,
            &None,
        )
    };
    for name in ["", "abc"] {
        let err = register(name).unwrap_err().unwrap();
        assert_eq!(err, ContractErrors::InvalidProjectName.into());
    }
    assert!(register("abcd").is_ok());
}

#[test]
fn project_url_and_ipfs_are_bounded() {
    let setup = create_test_data();
    let id = init_contract(&setup);
    let env = &setup.env;
    let err = setup
        .contract
        .try_update_config(
            &setup.grogu,
            &id,
            &vec![env, setup.grogu.clone()],
            &long_string(env, 257),
            &String::from_str(env, COMMIT),
            &None,
            &None,
            &None,
        )
        .unwrap_err()
        .unwrap();
    assert_eq!(err, ContractErrors::InvalidProjectConfig.into());
}

#[test]
fn sub_projects_are_distinct_project_keys() {
    let setup = create_test_data();
    let id = init_contract(&setup);
    let env = &setup.env;
    let other = Bytes::from_array(env, &[1u8; 32]);
    for invalid in [
        vec![env, Bytes::from_array(env, &[1u8; 3])],
        vec![env, other.clone(), other.clone()],
        vec![env, id.clone()],
    ] {
        let err = setup
            .contract
            .try_set_sub_projects(&setup.grogu, &id, &invalid)
            .unwrap_err()
            .unwrap();
        assert_eq!(err, ContractErrors::InvalidProjectConfig.into());
    }
    setup
        .contract
        .set_sub_projects(&setup.grogu, &id, &vec![env, other]);
}

#[test]
fn commit_hashes_are_lowercase_hex() {
    let setup = create_test_data();
    let id = init_contract(&setup);
    let env = &setup.env;
    let upper = String::from_str(env, "6663520BD9E6EDE248FEF8157B2AF0B6B6B41046");
    let err = setup
        .contract
        .try_commit(&setup.grogu, &id, &upper)
        .unwrap_err()
        .unwrap();
    assert_eq!(err, ContractErrors::InvalidCommitHash.into());
}

#[test]
fn attestations_take_a_commit_hash_and_a_bounded_note() {
    let setup = create_test_data();
    let id = init_contract(&setup);
    let env = &setup.env;
    let commit = String::from_str(env, COMMIT);

    let err = setup
        .contract
        .try_attest(
            &setup.grogu,
            &id,
            &String::from_str(env, "not a commit"),
            &AttestationTarget::Commit,
            &None,
        )
        .unwrap_err()
        .unwrap();
    assert_eq!(err, ContractErrors::InvalidAttestation.into());

    let err = setup
        .contract
        .try_attest(
            &setup.grogu,
            &id,
            &commit,
            &AttestationTarget::Commit,
            &Some(long_string(env, 257)),
        )
        .unwrap_err()
        .unwrap();
    assert_eq!(err, ContractErrors::InvalidAttestation.into());

    let err = setup
        .contract
        .try_attest(
            &setup.grogu,
            &id,
            &commit,
            &AttestationTarget::Evidence(EvidenceKind::Sbom, long_string(env, 129)),
            &None,
        )
        .unwrap_err()
        .unwrap();
    assert_eq!(err, ContractErrors::InvalidAttestation.into());

    setup.contract.attest(
        &setup.grogu,
        &id,
        &commit,
        &AttestationTarget::Commit,
        &Some(long_string(env, 256)),
    );
}

#[test]
fn evidence_cid_is_bounded() {
    let setup = create_test_data();
    let id = init_contract(&setup);
    let env = &setup.env;
    let err = setup
        .contract
        .try_set_evidence(
            &setup.grogu,
            &id,
            &String::from_str(env, COMMIT),
            &EvidenceKind::Sbom,
            &long_string(env, 129),
        )
        .unwrap_err()
        .unwrap();
    assert_eq!(err, ContractErrors::InvalidEvidence.into());
}

#[test]
fn git_parameters_come_together() {
    let setup = create_test_data();
    let env = &setup.env;
    let member = Address::generate(env);
    let pubkey = BytesN::from_array(env, &[7u8; 32]);
    let err = setup
        .contract
        .try_add_member(
            &member,
            &String::from_str(env, "meta"),
            &None,
            &Some(pubkey),
            &None,
        )
        .unwrap_err()
        .unwrap();
    assert_eq!(err, ContractErrors::InvalidGitIdentity.into());
}
