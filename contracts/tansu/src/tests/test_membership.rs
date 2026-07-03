use super::test_utils::{create_test_data, init_contract};
use crate::errors::ContractErrors;
use crate::events::{BadgesUpdated, MemberAdded};
use crate::types::{Badge, ProjectBadges};
use soroban_sdk::testutils::{Address as _, Events};
use soroban_sdk::{Address, BytesN, Event, String, vec};
extern crate alloc;
use alloc::vec::Vec;

use ed25519_dalek::{Signer, SigningKey};

#[test]
fn membership_badges() {
    let setup = create_test_data();
    let id = init_contract(&setup);

    let member = Address::generate(&setup.env);
    let meta = String::from_str(&setup.env, "abcd");
    setup
        .contract
        .add_member(&member, &meta, &None, &None, &None);

    // Verify member added event
    let all_events = setup
        .env
        .events()
        .all()
        .filter_by_contract(&setup.contract_id);
    let event = MemberAdded {
        member_address: member.clone(),
        git_identity: None,
    };

    assert_eq!(all_events, [event.to_xdr(&setup.env, &setup.contract_id)]);

    let badges = vec![&setup.env, Badge::Community];
    setup
        .contract
        .set_badges(&setup.mando, &id, &member, &badges);

    // Verify badges updated event
    let all_events = setup
        .env
        .events()
        .all()
        .filter_by_contract(&setup.contract_id);
    let event = BadgesUpdated {
        project_key: id.clone(),
        maintainer: setup.mando.clone(),
        member: member.clone(),
        badges_count: 1u32,
    };

    assert_eq!(all_events, [event.to_xdr(&setup.env, &setup.contract_id)]);

    let info = setup.contract.get_member(&member);
    assert_eq!(
        info.projects,
        vec![
            &setup.env,
            ProjectBadges {
                project: id.clone(),
                badges: badges.clone()
            }
        ]
    );

    let project_badges = setup.contract.get_badges(&id);
    assert_eq!(project_badges.community, vec![&setup.env, member.clone()]);

    let weight = setup.contract.get_max_weight(&id, &member);
    assert_eq!(weight, Badge::Community as u32);

    // remove badge by giving empty vector
    let empty = vec![&setup.env];
    setup
        .contract
        .set_badges(&setup.mando, &id, &member, &empty);
    let project_badges = setup.contract.get_badges(&id);
    assert!(project_badges.community.is_empty());

    let info = setup.contract.get_member(&member);
    assert_eq!(
        info.projects,
        vec![
            &setup.env,
            ProjectBadges {
                project: id.clone(),
                badges: empty
            }
        ]
    );
}

#[test]
fn membership_double_set_badges() {
    let setup = create_test_data();
    let id = init_contract(&setup);

    let member = Address::generate(&setup.env);
    let meta = String::from_str(&setup.env, "abcd");
    setup
        .contract
        .add_member(&member, &meta, &None, &None, &None);

    let badges = vec![&setup.env, Badge::Community];
    setup
        .contract
        .set_badges(&setup.mando, &id, &member, &badges);

    // Try to set the same badge again
    setup
        .contract
        .set_badges(&setup.mando, &id, &member, &badges);

    // Verify that the badge was not added multiple times
    let project_badges = setup.contract.get_badges(&id);
    assert_eq!(project_badges.community, vec![&setup.env, member.clone()]);
    assert_eq!(project_badges.community.len(), 1);

    let info = setup.contract.get_member(&member);
    assert_eq!(
        info.projects,
        vec![
            &setup.env,
            ProjectBadges {
                project: id.clone(),
                badges: badges.clone()
            }
        ]
    );
}

#[test]
fn membership_multiple_different_badges() {
    let setup = create_test_data();
    let id = init_contract(&setup);

    let member = Address::generate(&setup.env);
    let meta = String::from_str(&setup.env, "abcd");
    setup
        .contract
        .add_member(&member, &meta, &None, &None, &None);

    // Set both Community and Triage badges in a single call
    let both_badges = vec![&setup.env, Badge::Community, Badge::Triage];
    setup
        .contract
        .set_badges(&setup.mando, &id, &member, &both_badges);

    // Verify get_badges shows member in both categories
    let project_badges = setup.contract.get_badges(&id);
    assert_eq!(project_badges.community, vec![&setup.env, member.clone()]);
    assert_eq!(project_badges.triage, vec![&setup.env, member.clone()]);

    // CRITICAL: Verify get_member shows ALL badges for the member
    let member_info = setup.contract.get_member(&member);
    let expected_badges = vec![&setup.env, Badge::Community, Badge::Triage];
    assert_eq!(
        member_info.projects,
        vec![
            &setup.env,
            ProjectBadges {
                project: id.clone(),
                badges: expected_badges
            }
        ]
    );

    // Verify weight calculation includes both badges
    let weight = setup.contract.get_max_weight(&id, &member);
    assert_eq!(weight, (Badge::Community as u32) + (Badge::Triage as u32));

    // TEST BADGE REMOVAL: Remove Community badge, keep Triage
    let triage_only_badges = vec![&setup.env, Badge::Triage];
    setup
        .contract
        .set_badges(&setup.mando, &id, &member, &triage_only_badges);

    // Verify get_badges shows member only in Triage category
    let project_badges_after_removal = setup.contract.get_badges(&id);
    assert_eq!(project_badges_after_removal.community, vec![&setup.env]);
    assert_eq!(
        project_badges_after_removal.triage,
        vec![&setup.env, member.clone()]
    );

    // Verify get_member shows only Triage badge
    let member_info_after_removal = setup.contract.get_member(&member);
    let expected_badges_after_removal = vec![&setup.env, Badge::Triage];
    assert_eq!(
        member_info_after_removal.projects,
        vec![
            &setup.env,
            ProjectBadges {
                project: id.clone(),
                badges: expected_badges_after_removal
            }
        ]
    );

    // Verify weight calculation includes only Triage badge
    let weight_after_removal = setup.contract.get_max_weight(&id, &member);
    assert_eq!(weight_after_removal, Badge::Triage as u32);
}

#[test]
fn membership_errors() {
    let setup = create_test_data();

    let member = Address::generate(&setup.env);
    let meta = String::from_str(&setup.env, "abcd");
    setup
        .contract
        .add_member(&member, &meta, &None, &None, &None);

    // Adding the same twice
    let error = setup
        .contract
        .try_add_member(&member, &meta, &None, &None, &None)
        .unwrap_err()
        .unwrap();
    assert_eq!(error, ContractErrors::MemberAlreadyExist.into());

    // Unknown
    let not_member = Address::generate(&setup.env);
    let error = setup
        .contract
        .try_get_member(&not_member)
        .unwrap_err()
        .unwrap();
    assert_eq!(error, ContractErrors::UnknownMember.into());
}
fn signed_git_params(
    env: &soroban_sdk::Env,
    member_address: &Address,
    identity: &str,
) -> (Option<String>, Option<BytesN<32>>, Option<BytesN<64>>) {
    let secret = [0x42u8; 32];
    let signing_key = SigningKey::from_bytes(&secret);
    let verifying_key = signing_key.verifying_key();
    let pubkey_bytes = verifying_key.to_bytes();

    let member_str: soroban_sdk::String = member_address.to_string();
    let mut msg = soroban_sdk::Bytes::new(env);
    msg.append(&soroban_sdk::Bytes::from_slice(
        env,
        b"Stellar Signed Message:\n",
    ));
    msg.append(&member_str.into());
    msg.append(&soroban_sdk::Bytes::from_slice(env, &pubkey_bytes));
    let identity_s = soroban_sdk::String::from_str(env, identity);
    msg.append(&identity_s.into());

    let mut msg_rust = Vec::new();
    for b in msg.iter() {
        msg_rust.push(b);
    }

    use sha2::{Digest, Sha256};
    let hash = Sha256::digest(&msg_rust);

    let mut tosign = Vec::new();
    tosign.extend_from_slice(b"SSHSIG");
    tosign.extend_from_slice(&5u32.to_be_bytes());
    tosign.extend_from_slice(b"tansu");
    tosign.extend_from_slice(&0u32.to_be_bytes());
    tosign.extend_from_slice(&6u32.to_be_bytes());
    tosign.extend_from_slice(b"sha256");
    tosign.extend_from_slice(&32u32.to_be_bytes());
    tosign.extend_from_slice(&hash);

    let signature: ed25519_dalek::Signature = signing_key.sign(&tosign);
    let sig_bytes = signature.to_bytes();

    (
        Some(String::from_str(env, identity)),
        Some(BytesN::from_array(env, &pubkey_bytes)),
        Some(BytesN::from_array(env, &sig_bytes)),
    )
}

// ── Happy path ──────────────────────────────────────────────────────────────

#[test]
fn add_member_with_git_identity() {
    let setup = create_test_data();
    let _id = init_contract(&setup);

    let member = Address::generate(&setup.env);
    let meta = String::from_str(&setup.env, "abcd");

    let (git_identity, git_pubkey, git_sig) =
        signed_git_params(&setup.env, &member, "github:testuser");

    setup
        .contract
        .add_member(&member, &meta, &git_identity, &git_pubkey, &git_sig);

    let all_events = setup
        .env
        .events()
        .all()
        .filter_by_contract(&setup.contract_id);

    let event = MemberAdded {
        member_address: member.clone(),
        git_identity: Some(String::from_str(&setup.env, "github:testuser")),
    };

    assert_eq!(all_events, [event.to_xdr(&setup.env, &setup.contract_id)]);

    let info = setup.contract.get_member(&member);
    assert_eq!(
        info.git_identity,
        Some(String::from_str(&setup.env, "github:testuser"))
    );
    assert_eq!(info.git_pubkey, git_pubkey);
}

#[test]
fn add_member_with_git_identity_gitlab() {
    let setup = create_test_data();

    let member = Address::generate(&setup.env);
    let meta = String::from_str(&setup.env, "meta");

    let (git_identity, git_pubkey, git_sig) =
        signed_git_params(&setup.env, &member, "gitlab:devuser");

    setup
        .contract
        .add_member(&member, &meta, &git_identity, &git_pubkey, &git_sig);

    let info = setup.contract.get_member(&member);
    assert_eq!(
        info.git_identity,
        Some(String::from_str(&setup.env, "gitlab:devuser"))
    );
    assert!(info.git_pubkey.is_some());
}

#[test]
fn add_member_without_git_identity_still_works() {
    let setup = create_test_data();

    let member = Address::generate(&setup.env);
    let meta = String::from_str(&setup.env, "plain");

    setup
        .contract
        .add_member(&member, &meta, &None, &None, &None);

    let info = setup.contract.get_member(&member);
    assert_eq!(info.git_identity, None);
    assert_eq!(info.git_pubkey, None);
}

// ── Error cases ─────────────────────────────────────────────────────────────

#[test]
fn add_member_git_identity_missing_pubkey() {
    let setup = create_test_data();

    let member = Address::generate(&setup.env);
    let meta = String::from_str(&setup.env, "x");

    let (git_identity, _, git_sig) = signed_git_params(&setup.env, &member, "github:bob");

    let error = setup
        .contract
        .try_add_member(&member, &meta, &git_identity, &None, &git_sig)
        .unwrap_err()
        .unwrap();
    assert_eq!(error, ContractErrors::InvalidGitIdentity.into());
}

#[test]
fn add_member_git_identity_missing_sig() {
    let setup = create_test_data();

    let member = Address::generate(&setup.env);
    let meta = String::from_str(&setup.env, "x");

    let (git_identity, git_pubkey, _) = signed_git_params(&setup.env, &member, "github:bob");

    let error = setup
        .contract
        .try_add_member(&member, &meta, &git_identity, &git_pubkey, &None)
        .unwrap_err()
        .unwrap();
    assert_eq!(error, ContractErrors::InvalidGitIdentity.into());
}

#[test]
fn add_member_git_identity_bad_signature() {
    let setup = create_test_data();

    let member = Address::generate(&setup.env);
    let meta = String::from_str(&setup.env, "x");

    let (git_identity, git_pubkey, _) = signed_git_params(&setup.env, &member, "github:bob");

    // Use a random/invalid signature (all zeros)
    let bad_sig = BytesN::from_array(&setup.env, &[0u8; 64]);

    let result =
        setup
            .contract
            .try_add_member(&member, &meta, &git_identity, &git_pubkey, &Some(bad_sig));

    // ed25519_verify panics at the host level — we get HostError, not ContractError
    assert!(result.is_err(), "expected host error from ed25519_verify");
}

#[test]
fn add_member_git_identity_wrong_pubkey() {
    let setup = create_test_data();

    let member = Address::generate(&setup.env);
    let meta = String::from_str(&setup.env, "x");

    // Create signature with key A but pass a different pubkey
    let (_, _, git_sig) = signed_git_params(&setup.env, &member, "github:bob");

    let wrong_pubkey = BytesN::from_array(&setup.env, &[0x99u8; 32]);

    let result = setup.contract.try_add_member(
        &member,
        &meta,
        &Some(String::from_str(&setup.env, "github:bob")),
        &Some(wrong_pubkey),
        &git_sig,
    );

    // ed25519_verify panics at the host level — we get HostError, not ContractError
    assert!(result.is_err(), "expected host error from ed25519_verify");
}

// ── Member retrieval with git identity ──────────────────────────────────────

#[test]
fn add_member_git_identity_then_get_member() {
    let setup = create_test_data();

    let member = Address::generate(&setup.env);
    let meta = String::from_str(&setup.env, "ipfs_cid");

    let (git_identity, git_pubkey, git_sig) =
        signed_git_params(&setup.env, &member, "github:alice42");

    setup
        .contract
        .add_member(&member, &meta, &git_identity, &git_pubkey, &git_sig);

    let info = setup.contract.get_member(&member);
    assert_eq!(info.meta, String::from_str(&setup.env, "ipfs_cid"));
    assert_eq!(
        info.git_identity,
        Some(String::from_str(&setup.env, "github:alice42"))
    );
    assert_eq!(info.git_pubkey, git_pubkey);
    assert_eq!(info.projects.len(), 0);
}

/// Test that proves byte-level alignment between Rust and TypeScript message construction.
///
/// This test manually builds the message with a KNOWN Stellar address string and a KNOWN
/// keypair, signs it with ed25519-dalek (outside the contract), and verifies it passes
/// the contract's verify_git_signature.
#[test]
fn add_member_git_identity_known_keypair() {
    let setup = create_test_data();
    let _id = init_contract(&setup);

    // Known Ed25519 keypair (seed = 0x42 repeated)
    let secret = [0x42u8; 32];
    let signing_key = SigningKey::from_bytes(&secret);
    let verifying_key = signing_key.verifying_key();
    let pubkey_bytes: [u8; 32] = verifying_key.to_bytes();

    let member = Address::generate(&setup.env);
    let address_string: soroban_sdk::String = member.to_string();
    let identity = "github:testuser";

    // Build raw message EXACTLY as verify_git_signature does
    let mut msg = soroban_sdk::Bytes::new(&setup.env);
    msg.append(&soroban_sdk::Bytes::from_slice(
        &setup.env,
        b"Stellar Signed Message:\n",
    ));
    msg.append(&address_string.clone().into());
    msg.append(&soroban_sdk::Bytes::from_slice(&setup.env, &pubkey_bytes));
    let identity_s = soroban_sdk::String::from_str(&setup.env, identity);
    msg.append(&identity_s.into());

    let mut msg_rust: Vec<u8> = Vec::new();
    for b in msg.iter() {
        msg_rust.push(b);
    }

    // SHA-256 of the raw message
    use sha2::{Digest, Sha256};
    let hash = Sha256::digest(&msg_rust);

    // Build SSHSIG tosign payload (matches verify_git_signature):
    // "SSHSIG" + string("tansu") + string("") + string("sha256") + string(hash)
    let mut tosign: Vec<u8> = Vec::new();
    tosign.extend_from_slice(b"SSHSIG");
    tosign.extend_from_slice(&5u32.to_be_bytes());
    tosign.extend_from_slice(b"tansu");
    tosign.extend_from_slice(&0u32.to_be_bytes());
    tosign.extend_from_slice(&6u32.to_be_bytes());
    tosign.extend_from_slice(b"sha256");
    tosign.extend_from_slice(&32u32.to_be_bytes());
    tosign.extend_from_slice(&hash);

    // Sign the SSHSIG tosign payload
    let signature: ed25519_dalek::Signature = signing_key.sign(&tosign);
    let sig_bytes = signature.to_bytes();

    // Now call the contract with this externally-produced signature
    let meta = String::from_str(&setup.env, "test");
    setup.contract.add_member(
        &member,
        &meta,
        &Some(String::from_str(&setup.env, identity)),
        &Some(BytesN::from_array(&setup.env, &pubkey_bytes)),
        &Some(BytesN::from_array(&setup.env, &sig_bytes)),
    );

    // Verify it was stored correctly
    let info = setup.contract.get_member(&member);
    assert_eq!(
        info.git_identity,
        Some(String::from_str(&setup.env, identity))
    );
    assert_eq!(
        info.git_pubkey,
        Some(BytesN::from_array(&setup.env, &pubkey_bytes))
    );
}

// ── Duplicate member with git identity ──────────────────────────────────────

#[test]
fn add_member_git_identity_duplicate_fails() {
    let setup = create_test_data();

    let member = Address::generate(&setup.env);
    let meta = String::from_str(&setup.env, "x");

    let (git_identity, git_pubkey, git_sig) = signed_git_params(&setup.env, &member, "github:bob");

    setup
        .contract
        .add_member(&member, &meta, &git_identity, &git_pubkey, &git_sig);

    let error = setup
        .contract
        .try_add_member(&member, &meta, &git_identity, &git_pubkey, &git_sig)
        .unwrap_err()
        .unwrap();
    assert_eq!(error, ContractErrors::MemberAlreadyExist.into());
}
