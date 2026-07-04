use crate::{MembershipTrait, Tansu, TansuArgs, TansuClient, TansuTrait, errors, events, types};
use soroban_sdk::{
    Address, Bytes, BytesN, Env, I256, InvokeError, String, Symbol, Vec, contractimpl,
    panic_with_error, vec,
};

#[contractimpl]
impl MembershipTrait for Tansu {
    /// Add a new member to the system with metadata.
    ///
    /// Optionally binds a Git identity. When provided, the identity is verified
    /// by checking an Ed25519 signature against the caller's address, public key,
    /// and identity string. Only `git_identity` and `git_pubkey` are persisted.
    ///
    /// # Arguments
    /// * `env` - The environment object
    /// * `member_address` - The address of the member to add
    /// * `meta` - Metadata string associated with the member (e.g., IPFS hash)
    /// * `git_identity` - Git handle (e.g., "github:alice")
    /// * `git_pubkey` - Ed25519 public key
    /// * `git_sig` - Ed25519 signature
    ///
    /// # Panics
    /// * If the member already exists
    /// * If git params are incomplete (identity, key, sig must be all Some or None)
    /// * If the signature verification fails
    fn add_member(
        env: Env,
        member_address: Address,
        meta: String,
        git_identity: Option<String>,
        git_pubkey: Option<BytesN<32>>,
        git_sig: Option<BytesN<64>>,
    ) {
        Tansu::require_not_paused(env.clone());

        member_address.require_auth();

        let member_key_ = types::DataKey::Member(member_address.clone());
        if env
            .storage()
            .persistent()
            .get::<types::DataKey, types::Member>(&member_key_)
            .is_some()
        {
            panic_with_error!(&env, &errors::ContractErrors::MemberAlreadyExist)
        }

        if git_identity.is_some() {
            if git_pubkey.is_none() || git_sig.is_none() {
                panic_with_error!(&env, &errors::ContractErrors::InvalidGitIdentity);
            }
            verify_git_signature(
                &env,
                &member_address,
                &git_pubkey.clone().unwrap(),
                &git_identity.clone().unwrap(),
                &git_sig.clone().unwrap(),
            );
        }

        events::MemberAdded {
            member_address: member_address.clone(),
            git_identity: git_identity.clone(),
        }
        .publish(&env);

        let member = types::Member {
            projects: Vec::new(&env),
            meta,
            git_identity,
            git_pubkey,
        };
        env.storage().persistent().set(&member_key_, &member);
    }

    /// Update the metadata and optionally the Git identity of an existing member.
    ///
    /// When `git_identity` is `Some`, the signature is verified the same way
    /// as in `add_member` to prevent identity impersonation.
    ///
    /// # Arguments
    /// * `env` - The environment object
    /// * `member_address` - The address of the member to update
    /// * `meta` - New metadata string
    /// * `git_identity` - Git handle (e.g., "github:alice")
    /// * `git_pubkey` - Ed25519 public key
    /// * `git_sig` - Ed25519 signature
    ///
    /// # Panics
    /// * If the member doesn't exist
    /// * If git params are incomplete (identity, key, sig must be all Some or None)
    /// * If the signature verification fails
    fn update_member(
        env: Env,
        member_address: Address,
        meta: String,
        git_identity: Option<String>,
        git_pubkey: Option<BytesN<32>>,
        git_sig: Option<BytesN<64>>,
    ) {
        Tansu::require_not_paused(env.clone());

        member_address.require_auth();

        let member_key_ = types::DataKey::Member(member_address.clone());
        match env
            .storage()
            .persistent()
            .get::<types::DataKey, types::Member>(&member_key_)
        {
            None => panic_with_error!(&env, &errors::ContractErrors::UnknownMember),
            Some(mut member) => {
                member.meta = meta;

                if git_identity.is_some() {
                    if git_pubkey.is_none() || git_sig.is_none() {
                        panic_with_error!(&env, &errors::ContractErrors::InvalidGitIdentity);
                    }
                    verify_git_signature(
                        &env,
                        &member_address,
                        &git_pubkey.clone().unwrap(),
                        &git_identity.clone().unwrap(),
                        &git_sig.clone().unwrap(),
                    );

                    member.git_identity = git_identity.clone();
                    member.git_pubkey = git_pubkey.clone();
                }

                env.storage().persistent().set(&member_key_, &member);

                events::MemberAdded {
                    member_address,
                    git_identity: member.git_identity.clone(),
                }
                .publish(&env);
            }
        };
    }

    /// Get member information including all project badges.
    ///
    /// # Arguments
    /// * `env` - The environment object
    /// * `member_address` - The address of the member to retrieve
    ///
    /// # Returns
    /// * `types::Member` - Member information including metadata and project badges
    ///
    /// # Panics
    /// * If the member doesn't exist
    fn get_member(env: Env, member_address: Address) -> types::Member {
        let member_key_ = types::DataKey::Member(member_address.clone());
        env.storage()
            .persistent()
            .get::<types::DataKey, types::Member>(&member_key_)
            .unwrap_or_else(|| {
                panic_with_error!(&env, &errors::ContractErrors::UnknownMember);
            })
    }

    /// Set badges for a member in a specific project.
    ///
    /// This function replaces all existing badges for the member in the specified project
    /// with the new badge list. The member's maximum voting
    /// weight is calculated as the sum of all assigned badge weights.
    ///
    /// # Arguments
    /// * `env` - The environment object
    /// * `maintainer` - The address of the maintainer (must be authorized)
    /// * `key` - The project key identifier
    /// * `member` - The address of the member to set badges for
    /// * `badges` - Vector of badges to assign
    ///
    /// # Panics
    /// * If the maintainer is not authorized
    /// * If the member doesn't exist
    /// * If the project doesn't exist
    fn set_badges(
        env: Env,
        maintainer: Address,
        key: Bytes,
        member: Address,
        badges: Vec<types::Badge>,
    ) {
        Tansu::require_not_paused(env.clone());

        crate::auth_maintainers(&env, &maintainer, &key);

        let member_key_ = types::DataKey::Member(member.clone());
        let mut member_ = if let Some(member_) = env
            .storage()
            .persistent()
            .get::<types::DataKey, types::Member>(&member_key_)
        {
            member_
        } else {
            panic_with_error!(&env, &errors::ContractErrors::UnknownMember)
        };

        // For a member, go over its projects and replace all badges for
        // a project
        'member_projects_badges: {
            for i in 0..member_.projects.len() {
                if let Some(project_badge) = member_.projects.get(i)
                    && project_badge.project == key
                {
                    let mut project_badges = project_badge.clone();
                    project_badges.badges = badges.clone();
                    member_.projects.set(i, project_badges);
                    break 'member_projects_badges;
                }
            }
            let project_badges = types::ProjectBadges {
                project: key.clone(),
                badges: badges.clone(),
            };
            member_.projects.push_back(project_badges);
        }

        // For a project, go over all badges and add the specific member if it
        // has the badge
        let badges_key_ = types::ProjectKey::Badges(key.clone());
        let mut badges_ = <Tansu as MembershipTrait>::get_badges(env.clone(), key.clone());

        for badge_kind in [
            types::Badge::Developer,
            types::Badge::Triage,
            types::Badge::Community,
            types::Badge::Verified,
        ] {
            // Pick the right vector for this badge kind
            let vec_ref: &mut Vec<Address> = match badge_kind {
                types::Badge::Developer => &mut badges_.developer,
                types::Badge::Triage => &mut badges_.triage,
                types::Badge::Community => &mut badges_.community,
                types::Badge::Verified => &mut badges_.verified,
                _ => continue,
            };

            // Build a cleaned-up copy removing all badges from member
            let mut new_vec: Vec<Address> = Vec::new(&env);
            for addr in vec_ref.iter() {
                if addr != member.clone() {
                    new_vec.push_back(addr);
                }
            }
            // Add the member back if they should hold this badge now
            if badges.contains(badge_kind.clone()) {
                new_vec.push_back(member.clone());
            }
            // Replace the old vector
            *vec_ref = new_vec;
        }

        env.storage().persistent().set(&badges_key_, &badges_);
        env.storage().persistent().set(&member_key_, &member_);

        events::BadgesUpdated {
            project_key: key,
            maintainer,
            member,
            badges_count: badges.len(),
        }
        .publish(&env);
    }

    /// Get all badges for a specific project, organized by badge type.
    ///
    /// Returns a structure containing vectors of member addresses for each badge type
    /// (Developer, Triage, Community, Verified).
    ///
    /// # Arguments
    /// * `env` - The environment object
    /// * `key` - The project key identifier
    ///
    /// # Returns
    /// * `types::Badges` - Structure containing member addresses for each badge type
    fn get_badges(env: Env, key: Bytes) -> types::Badges {
        let badges_key_ = types::ProjectKey::Badges(key);
        if let Some(badges_) = env
            .storage()
            .persistent()
            .get::<types::ProjectKey, types::Badges>(&badges_key_)
        {
            badges_
        } else {
            types::Badges {
                developer: Vec::new(&env),
                triage: Vec::new(&env),
                community: Vec::new(&env),
                verified: Vec::new(&env),
            }
        }
    }

    /// Get the maximum voting weight for an address in a specific project.
    ///
    /// Calculates the sum of all badge weights for the address in the project.
    /// Returns the Default badge weight (1) if the address has no badges
    /// assigned or is not a registered member.
    ///
    /// There is a special case to use Neural Quorum Governance instead of
    /// badges if we are using a specific project.
    ///
    /// # Arguments
    /// * `env` - The environment object
    /// * `project_key` - The project key identifier
    /// * `member_address` - The address to check
    ///
    /// # Returns
    /// * `u32` - The maximum voting weight for the address
    fn get_max_weight(env: Env, project_key: Bytes, member_address: Address) -> u32 {
        let member_key = types::DataKey::Member(member_address.clone());

        // special case to use Neural Quorum Governance
        let key = env
            .storage()
            .instance()
            .get(&types::DataKey::NqgProjectKey)
            .expect("NQG project key exists");
        if project_key == key {
            return get_nqg(&env, member_address);
        }

        if let Some(member) = env
            .storage()
            .persistent()
            .get::<types::DataKey, types::Member>(&member_key)
        {
            match member
                .projects
                .iter()
                .find(|project_badges| project_badges.project == project_key)
            {
                Some(project_badges) => {
                    if project_badges.badges.is_empty() {
                        types::Badge::Default as u32
                    } else {
                        project_badges
                            .badges
                            .iter()
                            .map(|badge| badge as u32)
                            .sum::<u32>()
                    }
                }
                _ => types::Badge::Default as u32,
            }
        } else {
            types::Badge::Default as u32
        }
    }
}

/// Verify a Git identity binding by checking the Ed25519 signature over
/// a plain message containing the member address, public key, and identity.
///
/// The signed message is:
///   "Stellar Signed Message:\n" || member_address || git_pubkey || git_identity
///
/// The member_address is embedded in the message to tie the SSH key ownership
/// proof to the specific Stellar account authenticated by `require_auth`.
///
/// # Arguments
/// * `env` - The environment object
/// * `member_address` - The address of the member binding the git identity
/// * `git_pubkey` - The Ed25519 public key (32 bytes)
/// * `git_identity` - The bound git identity string (e.g. "github:alice")
/// * `sig` - The Ed25519 signature (64 bytes) over the message
///
/// # Panics
/// * If the signature does not verify
const SSHSIG_PREFIX: [u8; 33] = [
    b'S', b'S', b'H', b'S', b'I', b'G', // magic
    0, 0, 0, 5, // len("tansu")
    b't', b'a', b'n', b's', b'u', // namespace
    0, 0, 0, 0, // reserved
    0, 0, 0, 6, // len("sha256")
    b's', b'h', b'a', b'2', b'5', b'6', // hash algorithm
    0, 0, 0, 32, // len(sha256 output)
];

fn verify_git_signature(
    env: &Env,
    member_address: &Address,
    git_pubkey: &BytesN<32>,
    git_identity: &String,
    sig: &BytesN<64>,
) {
    let mut msg = Bytes::new(env);
    msg.append(&Bytes::from_slice(env, b"Stellar Signed Message:\n"));
    msg.append(&member_address.to_string().into());
    msg.append(&Bytes::from_slice(env, &git_pubkey.to_array()));
    msg.append(&git_identity.clone().into());

    let mut tosign = Bytes::from_slice(env, &SSHSIG_PREFIX);
    tosign.append(&env.crypto().sha256(&msg).into());

    env.crypto().ed25519_verify(git_pubkey, &tosign, sig);
}
fn get_nqg(e: &Env, user: Address) -> u32 {
    let nqg_contract_address = crate::retrieve_contract(e, types::ContractKey::Nqg);

    let r = e.try_invoke_contract::<I256, InvokeError>(
        &nqg_contract_address.address,
        &Symbol::new(e, "get_voting_power_for_user"),
        vec![e, user.to_string().to_val()],
    );
    let nqg: I256 = match r {
        Ok(Ok(v)) => v,
        _ => I256::from_i128(e, 0),
    };
    let scaled = nqg.div(&I256::from_i128(e, 10_i128.pow(12)));
    let nqg = scaled.to_i128().unwrap() as u32;
    // limit to pilots who have at least 4M
    if nqg > 4_000_000 { nqg } else { 0 }
}
