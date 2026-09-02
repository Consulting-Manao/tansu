#![allow(clippy::too_many_arguments)]

use soroban_sdk::{Address, Bytes, Env, String, Vec, contractimpl, panic_with_error, token};

use crate::{
    MembershipTrait, Tansu, TansuArgs, TansuClient, TansuTrait, VersioningTrait, errors, events,
    types::{self, DEFAULT_FINALITY_THRESHOLD_PERCENT},
};

const MAX_PROJECTS_PER_PAGE: u32 = 10;
const REGISTER_COLLATERAL: i128 = 5 * 10_000_000;

/// Maximum number of evidence entries kept on-chain per (project, commit, kind).
/// Older entries roll off once this is exceeded; the full history stays
/// recoverable from `EvidenceSet` events via an indexer.
const MAX_EVIDENCE: u32 = 10;
const MAX_ATTESTATIONS: u32 = 25;
const MAX_MAINTAINERS: u32 = MAX_ATTESTATIONS;

/// Length of a hex-encoded SHA-1 Git object name (Git's current default).
const GIT_SHA1_HEX_LENGTH: u32 = 40;
/// Length of a hex-encoded SHA-256 Git object name (Git's SHA-256 object format).
const GIT_SHA256_HEX_LENGTH: u32 = 64;

/// Structural check for a Git commit hash: a hex-encoded SHA-1 (40 chars) or
/// SHA-256 (64 chars) object name. Both lengths are accepted so validation
/// stays correct through Git's SHA-256 ("git v3") transition; hex is matched
/// case-insensitively. Bytes equal chars here because the input is ASCII hex.
fn is_valid_commit_hash(hash: &String) -> bool {
    let len = hash.len();
    if len != GIT_SHA1_HEX_LENGTH && len != GIT_SHA256_HEX_LENGTH {
        return false;
    }
    hash.to_bytes().iter().all(|b| b.is_ascii_hexdigit())
}

#[contractimpl]
impl VersioningTrait for Tansu {
    /// Register a new project.
    ///
    /// Creates a new project entry with maintainers, URL, and commit hash.
    /// Also registers the name in the domain contract if needed.
    /// The project key is generated using keccak256 hash of the project name.
    ///
    /// # Arguments
    /// * `env` - The environment object
    /// * `maintainer` - The address of the maintainer calling this function
    /// * `name` - The project name (max 15 characters)
    /// * `maintainers` - List of maintainer addresses for the project
    /// * `url` - The project's Git repository URL
    /// * `ipfs` - CID of the tansu.toml file with associated metadata
    /// * `min_voting_period` - Optional minimum voting period override, in seconds
    /// * `execute_delay` - Optional DAO execute timelock override, in seconds
    /// * `attestation_threshold` - Optional finality threshold percent; when
    ///   `None` the project is set to `DEFAULT_FINALITY_THRESHOLD_PERCENT`. Can
    ///   be changed later with `set_attestation_threshold`.
    ///
    /// # Returns
    /// * `Bytes` - The project key (keccak256 hash of the name)
    ///
    /// # Panics
    /// * If the project name is longer than 15 characters
    /// * If the project already exists
    /// * If the maintainer is not authorized
    /// * If the maintainer has insufficient collateral balance
    /// * If an override is zero or exceeds `MAX_VOTING_PERIOD`
    /// * If `maintainers` is empty, longer than `MAX_MAINTAINERS`, or contains duplicates
    /// * If `attestation_threshold` is outside `MIN_FINALITY_THRESHOLD_PERCENT..=100`
    fn register(
        env: Env,
        maintainer: Address,
        name: String,
        maintainers: Vec<Address>,
        url: String,
        ipfs: String,
        min_voting_period: Option<u64>,
        execute_delay: Option<u64>,
        attestation_threshold: Option<u32>,
    ) -> Bytes {
        Tansu::require_not_paused(env.clone());

        // None -> global defaults (MIN_VOTING_PERIOD / TIMELOCK_DELAY). execute_delay
        // only governs DAO execute(); the admin upgrade timelock is separate.
        for v in [min_voting_period, execute_delay].iter().flatten() {
            if *v == 0 || *v > crate::contract_dao::MAX_VOTING_PERIOD {
                panic_with_error!(&env, &errors::ContractErrors::InvalidVotingPeriod);
            }
        }

        let project = types::Project {
            name: name.clone(),
            config: types::Config { url, ipfs },
            maintainers: maintainers.clone(),
            sub_projects: None,
        };
        let str_len = name.len() as usize;
        if str_len > 30 {
            panic_with_error!(&env, &errors::ContractErrors::InvalidProjectName);
        }

        let name_b = name.to_bytes();
        for b in name_b.iter() {
            if !(b.is_ascii_lowercase() || b.is_ascii_uppercase() || b.is_ascii_digit()) {
                panic_with_error!(&env, &errors::ContractErrors::InvalidProjectName);
            }
        }
        let key: Bytes = env.crypto().keccak256(&name_b).into();

        let key_ = types::ProjectKey::Key(key.clone());
        if env
            .storage()
            .persistent()
            .get::<types::ProjectKey, types::Project>(&key_)
            .is_some()
        {
            panic_with_error!(&env, &errors::ContractErrors::ProjectAlreadyExist);
        } else {
            maintainer.require_auth();
            if !project.maintainers.contains(&maintainer) {
                panic_with_error!(&env, &errors::ContractErrors::UnauthorizedSigner);
            }

            validate_maintainers(&env, &project.maintainers);

            let sac_contract = crate::retrieve_contract(&env, types::ContractKey::Collateral);
            let token_stellar = token::StellarAssetClient::new(&env, &sac_contract.address);

            match token_stellar.try_transfer(
                &maintainer,
                env.current_contract_address(),
                &REGISTER_COLLATERAL,
            ) {
                Ok(..) => (),
                _ => panic_with_error!(&env, &errors::ContractErrors::CollateralError),
            }

            env.storage().persistent().set(&key_, &project);

            // Add to project list
            let total_projects = env
                .storage()
                .persistent()
                .get(&types::ProjectKey::TotalProjects)
                .unwrap_or(0u32);
            let page = total_projects / MAX_PROJECTS_PER_PAGE;

            let mut project_keys: Vec<Bytes> = env
                .storage()
                .persistent()
                .get(&types::ProjectKey::ProjectKeys(page))
                .unwrap_or(Vec::new(&env));

            project_keys.push_back(key.clone());

            env.storage()
                .persistent()
                .set(&types::ProjectKey::ProjectKeys(page), &project_keys);

            env.storage()
                .persistent()
                .set(&types::ProjectKey::TotalProjects, &(total_projects + 1));

            if let Some(v) = min_voting_period {
                env.storage()
                    .persistent()
                    .set(&types::ProjectKey::MinVotingPeriod(key.clone()), &v);
            }

            if let Some(v) = execute_delay {
                env.storage()
                    .persistent()
                    .set(&types::ProjectKey::ExecuteDelay(key.clone()), &v);
            }

            set_attestation_threshold(&env, &key, attestation_threshold);

            events::ProjectRegistered {
                project_key: key.clone(),
                name,
                maintainer,
            }
            .publish(&env);

            key
        }
    }

    /// Update the configuration of an existing project.
    ///
    /// Changes the project's URL, IPFS metadata, and maintainer list, and
    /// optionally its governance overrides. `None` governance params leave
    /// the current values untouched; to restore a default, pass it explicitly.
    ///
    /// Tightening (new >= current) applies immediately; loosening activates
    /// after a notice window of current `min_voting_period + execute_delay`.
    /// In-flight proposals keep their creation-time timelock.
    ///
    /// # Arguments
    /// * `env` - The environment object
    /// * `maintainer` - The address of the maintainer calling this function
    /// * `key` - The project key identifier
    /// * `maintainers` - New list of maintainer addresses
    /// * `url` - New Git repository URL
    /// * `ipfs` - New CID of the tansu.toml file with metadata
    /// * `min_voting_period` - Optional new minimum voting period, in seconds
    /// * `execute_delay` - Optional new DAO execute timelock, in seconds
    /// * `attestation_threshold` - Optional new finality threshold percent;
    ///   when `None` the project's current threshold is left unchanged
    ///
    /// # Panics
    /// * If the project doesn't exist
    /// * If the maintainer is not authorized
    /// * If a governance value is zero or exceeds `MAX_VOTING_PERIOD`
    /// * If `maintainers` is empty, longer than `MAX_MAINTAINERS`, or contains duplicates
    /// * If `attestation_threshold` is outside `MIN_FINALITY_THRESHOLD_PERCENT..=100`
    fn update_config(
        env: Env,
        maintainer: Address,
        key: Bytes,
        maintainers: Vec<Address>,
        url: String,
        ipfs: String,
        min_voting_period: Option<u64>,
        execute_delay: Option<u64>,
        attestation_threshold: Option<u32>,
    ) {
        Tansu::require_not_paused(env.clone());

        let key_ = types::ProjectKey::Key(key.clone());

        let mut project = crate::auth_maintainers(&env, &maintainer, &key);

        validate_maintainers(&env, &maintainers);

        for v in [min_voting_period, execute_delay].iter().flatten() {
            if *v == 0 || *v > crate::contract_dao::MAX_VOTING_PERIOD {
                panic_with_error!(&env, &errors::ContractErrors::InvalidVotingPeriod);
            }
        }

        let config = types::Config { url, ipfs };
        project.config = config;
        project.maintainers = maintainers;
        env.storage().persistent().set(&key_, &project);

        if attestation_threshold.is_some() {
            set_attestation_threshold(&env, &key, attestation_threshold);
        }

        events::ProjectConfigUpdated {
            project_key: key.clone(),
            maintainer: maintainer.clone(),
        }
        .publish(&env);

        crate::contract_dao::promote_pending_governance(&env, &key);

        if min_voting_period.is_some() || execute_delay.is_some() {
            let storage = env.storage().persistent();
            let old_min: u64 = storage
                .get(&types::ProjectKey::MinVotingPeriod(key.clone()))
                .unwrap_or(crate::contract_dao::MIN_VOTING_PERIOD);
            let old_delay: u64 = storage
                .get(&types::ProjectKey::ExecuteDelay(key.clone()))
                .unwrap_or(types::TIMELOCK_DELAY);
            let new_min = min_voting_period.unwrap_or(old_min);
            let new_delay = execute_delay.unwrap_or(old_delay);

            let activates_at = if new_min >= old_min && new_delay >= old_delay {
                crate::contract_dao::apply_governance(&env, &key, min_voting_period, execute_delay);
                storage.remove(&types::ProjectKey::PendingGovernance(key.clone()));
                env.ledger().timestamp()
            } else {
                let activates_at = env.ledger().timestamp() + old_min + old_delay;
                storage.set(
                    &types::ProjectKey::PendingGovernance(key.clone()),
                    &types::PendingGovernance {
                        min_voting_period,
                        execute_delay,
                        activates_at,
                    },
                );
                activates_at
            };

            events::ProjectGovernanceUpdated {
                project_key: key,
                maintainer,
                min_voting_period,
                execute_delay,
                activates_at,
            }
            .publish(&env);
        }
    }

    /// Set the latest commit hash for a project.
    ///
    /// Updates the current commit hash for the specified project.
    ///
    /// # Arguments
    /// * `env` - The environment object
    /// * `maintainer` - The address of the maintainer calling this function
    /// * `project_key` - The project key identifier
    /// * `hash` - The new commit hash
    ///
    /// # Panics
    /// * If the project doesn't exist
    /// * If the maintainer is not authorized
    /// * If the hash is not a valid SHA-1 (40 hex) or SHA-256 (64 hex) object name
    fn commit(env: Env, maintainer: Address, project_key: Bytes, hash: String) {
        Tansu::require_not_paused(env.clone());

        crate::auth_maintainers(&env, &maintainer, &project_key);

        // Guard against malformed hashes before they are written on-chain.
        // Accepts SHA-1 (40 hex) and SHA-256 (64 hex) object names.
        if !is_valid_commit_hash(&hash) {
            panic_with_error!(&env, &errors::ContractErrors::InvalidCommitHash);
        }

        env.storage()
            .persistent()
            .set(&types::ProjectKey::LastHash(project_key.clone()), &hash);

        events::Commit { project_key, hash }.publish(&env);
    }

    /// Get the latest commit hash for a project.
    ///
    /// # Arguments
    /// * `env` - The environment object
    /// * `project_key` - The project key identifier
    ///
    /// # Returns
    /// * `String` - The current commit hash
    ///
    /// # Panics
    /// * If the project doesn't exist
    fn get_commit(env: Env, project_key: Bytes) -> String {
        let key_ = types::ProjectKey::Key(project_key.clone());
        if env
            .storage()
            .persistent()
            .get::<types::ProjectKey, types::Project>(&key_)
            .is_some()
        {
            env.storage()
                .persistent()
                .get(&types::ProjectKey::LastHash(project_key))
                .unwrap_or_else(|| {
                    panic_with_error!(&env, &errors::ContractErrors::NoHashFound);
                })
        } else {
            panic_with_error!(&env, &errors::ContractErrors::InvalidKey);
        }
    }

    /// Store generic external evidence for a specific project commit and evidence kind.
    ///
    /// Stores only the verifiable IPFS pointer. Evidence contents remain off-chain.
    ///
    /// Evidence is append-only: each call adds a new entry to the history for
    /// `(project_key, commit_hash, kind)` rather than overwriting the previous
    /// one (e.g. successive CVE re-scans of the same commit). At most
    /// `MAX_EVIDENCE` entries are kept on-chain; older ones roll off but remain
    /// recoverable from `EvidenceSet` events via an indexer.
    ///
    /// # Arguments
    /// * `env` - The environment object
    /// * `maintainer` - The address of the maintainer calling this function
    /// * `project_key` - The project key identifier
    /// * `commit_hash` - The commit hash this evidence describes
    /// * `kind` - The evidence category
    /// * `cid` - The off-chain content identifier
    ///
    /// # Panics
    /// * If the contract is paused
    /// * If the project doesn't exist
    /// * If the maintainer is not authorized
    /// * If commit_hash is not a valid SHA-1 (40 hex) or SHA-256 (64 hex) object name
    /// * If cid is empty
    fn set_evidence(
        env: Env,
        maintainer: Address,
        project_key: Bytes,
        commit_hash: String,
        kind: types::EvidenceKind,
        cid: String,
    ) {
        Tansu::require_not_paused(env.clone());

        crate::auth_maintainers(&env, &maintainer, &project_key);

        // Evidence must reference a real commit, so the hash is validated with
        // the same rule as commit(); an empty hash fails this check too.
        if !is_valid_commit_hash(&commit_hash) {
            panic_with_error!(&env, &errors::ContractErrors::InvalidCommitHash);
        }
        if cid.is_empty() {
            panic_with_error!(&env, &errors::ContractErrors::InvalidEvidence);
        }

        let key =
            types::ProjectKey::Evidence(project_key.clone(), commit_hash.clone(), kind.clone());
        let storage = env.storage().persistent();

        let mut history: Vec<types::Evidence> = storage.get(&key).unwrap_or_else(|| Vec::new(&env));
        history.push_back(types::Evidence {
            cid: cid.clone(),
            created_at: env.ledger().timestamp(),
        });
        // Keep only the most recent MAX_EVIDENCE entries; the full timeline lives in events.
        while history.len() > MAX_EVIDENCE {
            history.remove(0);
        }
        storage.set(&key, &history);

        events::EvidenceSet {
            project_key,
            commit_hash,
            kind,
            cid,
        }
        .publish(&env);
    }

    /// Get the stored evidence history for a specific project commit and kind.
    ///
    /// Entries are returned oldest-first (the last element is the latest), and at
    /// most `MAX_EVIDENCE` are kept on-chain. Returns an empty vector when no
    /// evidence has been recorded; consumers reconstruct the full history from
    /// `EvidenceSet` events via an indexer.
    ///
    /// # Arguments
    /// * `env` - The environment object
    /// * `project_key` - The project key identifier
    /// * `commit_hash` - The commit hash this evidence describes
    /// * `kind` - The evidence category
    ///
    /// # Returns
    /// * `Vec<types::Evidence>` - The stored evidence pointers, oldest-first
    fn get_evidence(
        env: Env,
        project_key: Bytes,
        commit_hash: String,
        kind: types::EvidenceKind,
    ) -> Vec<types::Evidence> {
        env.storage()
            .persistent()
            .get(&types::ProjectKey::Evidence(project_key, commit_hash, kind))
            .unwrap_or_else(|| Vec::new(&env))
    }

    /// Get project information including configuration and maintainers.
    ///
    /// # Arguments
    /// * `env` - The environment object
    /// * `project_key` - The project key identifier
    ///
    /// # Returns
    /// * `types::Project` - Project information including name, config, and maintainers
    ///
    /// # Panics
    /// * If the project doesn't exist
    fn get_project(env: Env, project_key: Bytes) -> types::Project {
        let key_ = types::ProjectKey::Key(project_key.clone());

        env.storage()
            .persistent()
            .get::<types::ProjectKey, types::Project>(&key_)
            .unwrap_or_else(|| {
                panic_with_error!(&env, &errors::ContractErrors::InvalidKey);
            })
    }

    /// Get a page of projects.
    ///
    /// # Arguments
    /// * `env` - The environment object
    /// * `page` - The page number (0-based)
    ///
    /// # Returns
    /// * `Vec<types::Project>` - List of projects on the requested page
    fn get_projects(env: Env, page: u32) -> Vec<types::Project> {
        if let Some(project_keys) = env
            .storage()
            .persistent()
            .get::<_, Vec<Bytes>>(&types::ProjectKey::ProjectKeys(page))
        {
            let mut projects = Vec::new(&env);
            for key in project_keys {
                let key_ = types::ProjectKey::Key(key.clone());
                let project = env
                    .storage()
                    .persistent()
                    .get::<types::ProjectKey, types::Project>(&key_)
                    .expect("Invalid project key");

                projects.push_back(project);
            }
            projects
        } else {
            panic_with_error!(&env, &errors::ContractErrors::NoProjectPageFound);
        }
    }

    /// Get sub-projects for a project (if it's an organization).
    ///
    /// # Arguments
    /// * `env` - The environment object
    /// * `project_key` - The project key identifier
    ///
    /// # Returns
    /// * `Vec<Bytes>` - List of sub-project keys, empty if not an organization
    fn get_sub_projects(env: Env, project_key: Bytes) -> Vec<Bytes> {
        let key_ = types::ProjectKey::Key(project_key.clone());
        let project = env
            .storage()
            .persistent()
            .get::<types::ProjectKey, types::Project>(&key_)
            .unwrap_or_else(|| {
                panic_with_error!(&env, &errors::ContractErrors::InvalidKey);
            });

        project.sub_projects.unwrap_or_else(|| Vec::new(&env))
    }

    /// Set sub-projects for a project (making it an organization).
    ///
    /// Note: by design, sub-project keys are not validated against existing
    /// projects. This allows reserving a project space before the project is
    /// registered (since the key is derived from the name). A project can
    /// also appear in multiple organizations.
    ///
    /// # Arguments
    /// * `env` - The environment object
    /// * `maintainer` - The maintainer address calling this function
    /// * `project_key` - The project key identifier
    /// * `sub_projects` - List of sub-project keys to associate
    ///
    /// # Panics
    /// * If the project doesn't exist
    /// * If the maintainer is not authorized
    /// * If more than 10 sub-projects are provided
    fn set_sub_projects(
        env: Env,
        maintainer: Address,
        project_key: Bytes,
        sub_projects: Vec<Bytes>,
    ) {
        Tansu::require_not_paused(env.clone());
        let project = crate::auth_maintainers(&env, &maintainer, &project_key);

        if sub_projects.len() > 10 {
            panic_with_error!(&env, &errors::ContractErrors::TooManySubProjects);
        }

        let key_ = types::ProjectKey::Key(project_key.clone());
        let mut updated_project = project;
        updated_project.sub_projects = Some(sub_projects.clone());

        env.storage().persistent().set(&key_, &updated_project);

        events::SubProjectsUpdated {
            project_key,
            sub_projects,
        }
        .publish(&env);
    }

    /// Set the attestation finality threshold (percent) for a project.
    ///
    /// A commit is considered final once the share of current maintainers that
    /// have attested it reaches this percentage. Every project defaults to
    /// `DEFAULT_FINALITY_THRESHOLD_PERCENT` until its maintainers set a value here.
    ///
    /// # Arguments
    /// * `env` - The environment object
    /// * `maintainer` - The address of the maintainer calling this function
    /// * `project_key` - The project key identifier
    /// * `percent` - The threshold percent (in `MIN_FINALITY_THRESHOLD_PERCENT..=100`)
    ///
    /// # Panics
    /// * If the contract is paused
    /// * If the project doesn't exist or the maintainer is not authorized
    /// * If `percent` is below `MIN_FINALITY_THRESHOLD_PERCENT` or above 100
    fn set_attestation_threshold(
        env: Env,
        maintainer: Address,
        project_key: Bytes,
        attestation_threshold: Option<u32>,
    ) {
        Tansu::require_not_paused(env.clone());

        crate::auth_maintainers(&env, &maintainer, &project_key);

        set_attestation_threshold(&env, &project_key, attestation_threshold);
    }

    /// Get the attestation finality threshold (percent) for a project.
    ///
    /// Returns the project's stored threshold, or `DEFAULT_FINALITY_THRESHOLD_PERCENT`
    /// when the project has not set one.
    ///
    /// # Arguments
    /// * `env` - The environment object
    /// * `project_key` - The project key identifier
    ///
    /// # Returns
    /// * `u32` - The finality threshold percent for the project
    fn get_attestation_threshold(env: Env, project_key: Bytes) -> u32 {
        let key = types::ProjectKey::AttestationFinalityThreshold(project_key);

        match env.storage().persistent().get::<_, u32>(&key) {
            Some(percent) => percent,
            None => DEFAULT_FINALITY_THRESHOLD_PERCENT,
        }
    }

    /// Compute whether an attestation target is final (canonical), on-chain.
    ///
    /// A target is final once the share of the project's *current* maintainers
    /// that have attested it reaches the project's finality threshold. The target
    /// is either the commit itself (`Commit`) or a specific evidence artifact
    /// (`Evidence(kind, cid)`) tied to that commit. Attestations from addresses
    /// that are no longer maintainers are ignored, so a removed maintainer's stale
    /// vouch cannot inflate the count.
    ///
    /// # Arguments
    /// * `env` - The environment object
    /// * `project_key` - The project key identifier
    /// * `commit_hash` - The commit hash being evaluated
    /// * `target` - The attestation target: the commit or a specific evidence artifact
    ///
    /// # Returns
    /// * `types::FinalityStatus` - `{ attested, total, is_final }`
    ///
    /// # Panics
    /// * If the project doesn't exist
    fn get_attestation_finality(
        env: Env,
        project_key: Bytes,
        commit_hash: String,
        target: types::AttestationTarget,
    ) -> types::FinalityStatus {
        let project = Self::get_project(env.clone(), project_key.clone());

        let total = project.maintainers.len();

        let attestations = Self::get_attestations(
            env.clone(),
            project_key.clone(),
            commit_hash.clone(),
            target.clone(),
        );

        let mut attested: u32 = 0;

        for attestation in attestations.iter() {
            if project.maintainers.contains(&attestation.attester) {
                attested += 1;
            }
        }

        let threshold = Self::get_attestation_threshold(env.clone(), project_key.clone());

        let finalized_at =
            env.storage()
                .persistent()
                .get::<types::ProjectKey, u64>(&finalized_key(
                    &env,
                    &project_key,
                    &commit_hash,
                    &target,
                ));

        let is_final = finalized_at.is_some() || (total > 0 && attested * 100 >= threshold * total);

        types::FinalityStatus {
            attested,
            total,
            is_final,
            finalized_at,
        }
    }

    /// Record an endorsement (attestation) of a commit or evidence artifact.
    ///
    /// A multi-party primitive: independent maintainers vouch that they verified the
    /// target. Each maintainer may attest a given target at most once — a second
    /// call from the same attester is rejected rather than replacing the first, so
    /// an attestation is never silently rewritten. Revoking one is an explicit,
    /// separately evented action: see `revoke_attestation`. At most
    /// `MAX_ATTESTATIONS` are kept on-chain; at capacity, vouches from addresses
    /// that are no longer maintainers are pruned, and the call is rejected if
    /// that does not free a slot. Current maintainers' vouches are never evicted.
    ///
    /// # Arguments
    /// * `env` - The environment object
    /// * `attester` - The maintainer recording the attestation
    /// * `project_key` - The project key identifier
    /// * `commit_hash` - The commit hash being endorsed
    /// * `target` - The attestation target: the commit or a specific evidence artifact
    /// * `note` - Optional pointer (e.g. a reproducibility report CID)
    ///
    /// # Panics
    /// * If the contract is paused
    /// * If the project doesn't exist or the attester is not a maintainer
    /// * If `commit_hash` is empty, or the target is `Evidence` with an empty CID
    /// * If the attester has already attested this target
    /// * If the target is at `MAX_ATTESTATIONS` and no stale entry can be pruned
    fn attest(
        env: Env,
        attester: Address,
        project_key: Bytes,
        commit_hash: String,
        target: types::AttestationTarget,
        note: Option<String>,
    ) {
        Tansu::require_not_paused(env.clone());

        let project = crate::auth_maintainers(&env, &attester, &project_key);

        if commit_hash.is_empty() {
            panic_with_error!(&env, &errors::ContractErrors::InvalidAttestation);
        }

        if let types::AttestationTarget::Evidence(_, cid) = &target
            && cid.is_empty()
        {
            panic_with_error!(&env, &errors::ContractErrors::InvalidAttestation);
        }

        let weight = <Tansu as MembershipTrait>::get_max_weight(
            env.clone(),
            project_key.clone(),
            attester.clone(),
        );

        let key = attestation_key(&env, &project_key, &commit_hash, &target);

        let storage = env.storage().persistent();

        let mut attestations: Vec<types::Attestation> =
            storage.get(&key).unwrap_or_else(|| Vec::new(&env));

        let attestation = types::Attestation {
            attester: attester.clone(),
            weight,
            created_at: env.ledger().timestamp(),
            note,
        };

        if attestations.iter().any(|a| a.attester == attester) {
            panic_with_error!(&env, &errors::ContractErrors::AlreadyAttested);
        }

        if attestations.len() >= MAX_ATTESTATIONS {
            let mut retained: Vec<types::Attestation> = Vec::new(&env);

            for existing in attestations.iter() {
                if project.maintainers.contains(&existing.attester) {
                    retained.push_back(existing);
                }
            }

            attestations = retained;
        }

        if attestations.len() >= MAX_ATTESTATIONS {
            panic_with_error!(&env, &errors::ContractErrors::TooManyAttestations);
        }

        attestations.push_back(attestation);

        storage.set(&key, &attestations);

        mark_finalized(&env, &project_key, &commit_hash, &target);

        events::Attested {
            project_key,
            commit_hash,
            target,
            attester,
            weight,
        }
        .publish(&env);
    }

    /// Revoke the caller's own attestation from a target.
    ///
    /// Only the attester can remove their vouch, and only their own: a maintainer
    /// cannot strike another's. Revocation is bounded twice over, so a vouch that
    /// others have already relied on cannot be pulled out from under them:
    ///
    /// 1. **Not once the target is final.** Finality is recorded the first time a
    ///    target reaches its threshold and is never cleared, so raising the
    ///    threshold or growing the maintainer set cannot re-open withdrawal.
    /// 2. **Not after `ATTESTATION_REVOCATION_WINDOW`** has elapsed since
    ///    `created_at`. Past that the vouch is permanent.
    ///
    /// Within those bounds, revoking frees the slot and the caller may attest the
    /// target again with a fresh `created_at` — revoke plus re-attest is the
    /// supported way to amend a `note` or correct a mistaken vouch. The
    /// `Attested` / `AttestationRevoked` event pair is the durable audit trail.
    ///
    /// # Arguments
    /// * `env` - The environment object
    /// * `attester` - The maintainer revoking their attestation
    /// * `project_key` - The project key identifier
    /// * `commit_hash` - The commit hash the attestation relates to
    /// * `target` - The attestation target: the commit or a specific evidence artifact
    ///
    /// # Panics
    /// * If the contract is paused
    /// * If the project doesn't exist or the attester is not a maintainer
    /// * If the attester has no attestation on this target
    /// * If the target has already reached finality
    /// * If the revocation window has closed
    fn revoke_attestation(
        env: Env,
        attester: Address,
        project_key: Bytes,
        commit_hash: String,
        target: types::AttestationTarget,
    ) {
        Tansu::require_not_paused(env.clone());

        attester.require_auth();

        if commit_hash.is_empty() {
            panic_with_error!(&env, &errors::ContractErrors::InvalidAttestation);
        }

        if let types::AttestationTarget::Evidence(_, cid) = &target
            && cid.is_empty()
        {
            panic_with_error!(&env, &errors::ContractErrors::InvalidAttestation);
        }

        let key = attestation_key(&env, &project_key, &commit_hash, &target);
        let storage = env.storage().persistent();

        let mut attestations: Vec<types::Attestation> =
            storage.get(&key).unwrap_or_else(|| Vec::new(&env));

        let index = match attestations.iter().position(|a| a.attester == attester) {
            Some(index) => index as u32,
            None => panic_with_error!(&env, &errors::ContractErrors::AttestationNotFound),
        };

        let finality = Self::get_attestation_finality(
            env.clone(),
            project_key.clone(),
            commit_hash.clone(),
            target.clone(),
        );

        if finality.is_final {
            panic_with_error!(&env, &errors::ContractErrors::AttestationFinalized);
        }

        let created_at = attestations.get(index).unwrap().created_at;
        let expires_at = created_at.saturating_add(types::ATTESTATION_REVOCATION_WINDOW);

        if env.ledger().timestamp() > expires_at {
            panic_with_error!(&env, &errors::ContractErrors::AttestationRevocationExpired);
        }

        attestations.remove(index);

        if attestations.is_empty() {
            storage.remove(&key);
        } else {
            storage.set(&key, &attestations);
        }

        events::AttestationRevoked {
            project_key,
            commit_hash,
            target,
            attester,
        }
        .publish(&env);
    }

    /// Get the attestations recorded for a project's commit or evidence target.
    ///
    /// Entries are returned oldest-first (the last element is the most recent) and
    /// hold at most one entry per attester, capped at `MAX_ATTESTATIONS`. The full
    /// history stays recoverable from `Attested` events via an indexer.
    /// Returns an empty vector when nothing has been attested for the target.
    ///
    /// # Arguments
    /// * `env` - The environment object
    /// * `project_key` - The project key identifier
    /// * `commit_hash` - The commit hash the attestations relate to
    /// * `target` - The attestation target: the commit or a specific evidence artifact
    ///
    /// # Returns
    /// * `Vec<types::Attestation>` - The stored attestations, oldest-first
    fn get_attestations(
        env: Env,
        project_key: Bytes,
        commit_hash: String,
        target: types::AttestationTarget,
    ) -> Vec<types::Attestation> {
        let key = attestation_key(&env, &project_key, &commit_hash, &target);

        match env.storage().persistent().get(&key) {
            Some(attestations) => attestations,
            None => Vec::new(&env),
        }
    }
}

pub(crate) fn attestation_key(
    env: &Env,
    project_key: &Bytes,
    commit_hash: &String,
    target: &types::AttestationTarget,
) -> types::ProjectKey {
    let mut buf = Bytes::new(env);

    let project_key_len = project_key.len();

    buf.extend_from_array(&project_key_len.to_be_bytes());
    buf.append(project_key);

    let commit_bytes: Bytes = commit_hash.clone().into();

    buf.extend_from_array(&commit_bytes.len().to_be_bytes());
    buf.append(&commit_bytes);

    match target {
        types::AttestationTarget::Commit => buf.extend_from_array(&[0u8]),
        types::AttestationTarget::Evidence(kind, cid) => {
            buf.extend_from_array(&[1u8]);

            let kind_tag: u8 = match kind {
                types::EvidenceKind::Sbom => 0,
                types::EvidenceKind::Cve => 1,
                types::EvidenceKind::Attestation => 2,
            };

            buf.extend_from_array(&[kind_tag]);

            let cid_bytes: Bytes = cid.clone().into();

            buf.extend_from_array(&cid_bytes.len().to_be_bytes());
            buf.append(&cid_bytes);
        }
    }

    types::ProjectKey::Attestation(env.crypto().keccak256(&buf).into())
}

pub(crate) fn finalized_key(
    env: &Env,
    project_key: &Bytes,
    commit_hash: &String,
    target: &types::AttestationTarget,
) -> types::ProjectKey {
    match attestation_key(env, project_key, commit_hash, target) {
        types::ProjectKey::Attestation(digest) => types::ProjectKey::AttestationFinalized(digest),
        _ => unreachable!(),
    }
}

fn mark_finalized(
    env: &Env,
    project_key: &Bytes,
    commit_hash: &String,
    target: &types::AttestationTarget,
) {
    let key = finalized_key(env, project_key, commit_hash, target);

    if env.storage().persistent().has(&key) {
        return;
    }

    let status = <Tansu as VersioningTrait>::get_attestation_finality(
        env.clone(),
        project_key.clone(),
        commit_hash.clone(),
        target.clone(),
    );

    if status.is_final {
        env.storage()
            .persistent()
            .set(&key, &env.ledger().timestamp());
    }
}

fn validate_maintainers(env: &Env, maintainers: &Vec<Address>) {
    if maintainers.is_empty() {
        panic_with_error!(env, &errors::ContractErrors::MissingMaintainer);
    }

    if maintainers.len() > MAX_MAINTAINERS {
        panic_with_error!(env, &errors::ContractErrors::TooManyMaintainers);
    }

    for (index, maintainer) in maintainers.iter().enumerate() {
        for other in maintainers.iter().skip(index + 1) {
            if maintainer == other {
                panic_with_error!(env, &errors::ContractErrors::DuplicateMaintainer);
            }
        }
    }
}

fn set_attestation_threshold(env: &Env, project_key: &Bytes, percent: Option<u32>) {
    let percent = percent.unwrap_or(DEFAULT_FINALITY_THRESHOLD_PERCENT);

    if !(types::MIN_FINALITY_THRESHOLD_PERCENT..=100).contains(&percent) {
        panic_with_error!(&env, &errors::ContractErrors::InvalidAttestationThreshold);
    }

    let key = types::ProjectKey::AttestationFinalityThreshold(project_key.clone());

    env.storage().persistent().set(&key, &percent);

    events::AttestationThresholdSet {
        project_key: project_key.clone(),
        percent,
    }
    .publish(env);
}
