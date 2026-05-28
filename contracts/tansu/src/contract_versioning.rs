use soroban_sdk::{Address, Bytes, Env, String, Vec, contractimpl, panic_with_error, token};

use crate::{Tansu, TansuArgs, TansuClient, TansuTrait, VersioningTrait, errors, events, types};

const MAX_PROJECTS_PER_PAGE: u32 = 10;
const REGISTER_COLLATERAL: i128 = 5 * 10_000_000;

/// Maximum number of evidence entries kept on-chain per (project, commit, kind).
/// Older entries roll off once this is exceeded; the full history stays
/// recoverable from `EvidenceSet` events via an indexer.
const MAX_EVIDENCE: u32 = 10;

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
    /// Also registers the project name in the domain contract if not already registered.
    /// The project key is generated using keccak256 hash of the project name.
    ///
    /// # Arguments
    /// * `env` - The environment object
    /// * `maintainer` - The address of the maintainer calling this function
    /// * `name` - The project name (max 15 characters)
    /// * `maintainers` - List of maintainer addresses for the project
    /// * `url` - The project's Git repository URL
    /// * `ipfs` - CID of the tansu.toml file with associated metadata
    /// * `min_voting_period` - Optional per-project minimum voting period in seconds.
    ///   When `None`, the global default is used. When `Some(v)`, `v` must be > 0 and
    ///   <= `MAX_VOTING_PERIOD`.
    ///
    /// # Returns
    /// * `Bytes` - The project key (keccak256 hash of the name)
    ///
    /// # Panics
    /// * If the project name is longer than 15 characters
    /// * If the project already exists
    /// * If the maintainer is not authorized
    /// * If the maintainer has insufficient collateral balance
    /// * If `min_voting_period` is `Some(0)` or exceeds `MAX_VOTING_PERIOD`
    fn register(
        env: Env,
        maintainer: Address,
        name: String,
        maintainers: Vec<Address>,
        url: String,
        ipfs: String,
        min_voting_period: Option<u64>,
    ) -> Bytes {
        Tansu::require_not_paused(env.clone());

        if let Some(v) = min_voting_period
            && (v == 0 || v > crate::contract_dao::MAX_VOTING_PERIOD)
        {
            panic_with_error!(&env, &errors::ContractErrors::InvalidVotingPeriod);
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
    /// Allows maintainers to change the project's URL, IPFS metadata, and maintainer list.
    ///
    /// # Arguments
    /// * `env` - The environment object
    /// * `maintainer` - The address of the maintainer calling this function
    /// * `key` - The project key identifier
    /// * `maintainers` - New list of maintainer addresses
    /// * `url` - New Git repository URL
    /// * `ipfs` - New CID of the tansu.toml file with metadata
    ///
    /// # Panics
    /// * If the project doesn't exist
    /// * If the maintainer is not authorized
    fn update_config(
        env: Env,
        maintainer: Address,
        key: Bytes,
        maintainers: Vec<Address>,
        url: String,
        ipfs: String,
    ) {
        Tansu::require_not_paused(env.clone());

        let key_ = types::ProjectKey::Key(key.clone());

        let mut project = crate::auth_maintainers(&env, &maintainer, &key);

        if maintainers.is_empty() {
            panic_with_error!(&env, &errors::ContractErrors::MissingMaintainer);
        }

        let config = types::Config { url, ipfs };
        project.config = config;
        project.maintainers = maintainers;
        env.storage().persistent().set(&key_, &project);

        events::ProjectConfigUpdated {
            project_key: key,
            maintainer,
        }
        .publish(&env);
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

    /// Get the effective minimum voting period for a project in seconds.
    ///
    /// Returns the per-project override stored at registration if set, otherwise
    /// the global `MIN_VOTING_PERIOD` default.
    fn get_min_voting_period(env: Env, project_key: Bytes) -> u64 {
        env.storage()
            .persistent()
            .get(&types::ProjectKey::MinVotingPeriod(project_key))
            .unwrap_or(crate::contract_dao::MIN_VOTING_PERIOD)
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
}
