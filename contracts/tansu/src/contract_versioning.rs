use soroban_sdk::{Address, Bytes, Env, String, Vec, contractimpl, panic_with_error, token};

use crate::{Tansu, TansuArgs, TansuClient, TansuTrait, VersioningTrait, errors, events, types};

const MAX_PROJECTS_PER_PAGE: u32 = 10;
const REGISTER_COLLATERAL: i128 = 5 * 10_000_000;

// Durability for evidence entries. Evidence is meant to be a long-lived,
// backend-less historical record, so each entry is bumped towards the network
// maximum persistent TTL on write (and can be re-bumped permissionlessly via
// `bump_evidence`). Values stay below the protocol `max_entry_ttl` (6_312_000
// ledgers, ~1 year) to avoid overflowing it. If rent still lapses, persistent
// entries are archived (not deleted) and remain restorable on-chain.
const EVIDENCE_BUMP_THRESHOLD: u32 = 2_592_000; // re-extend when remaining TTL drops below ~150 days
const EVIDENCE_BUMP_AMOUNT: u32 = 6_000_000; // extend live window to ~347 days

impl Tansu {
    /// Panic with `InvalidKey` if the project does not exist.
    fn require_project(env: &Env, project_key: &Bytes) {
        if env
            .storage()
            .persistent()
            .get::<types::ProjectKey, types::Project>(&types::ProjectKey::Key(project_key.clone()))
            .is_none()
        {
            panic_with_error!(env, &errors::ContractErrors::InvalidKey);
        }
    }

    /// Number of evidence entries stored for a commit and kind (0 if none).
    fn evidence_count(
        env: &Env,
        project_key: &Bytes,
        commit_hash: &String,
        kind: &types::EvidenceKind,
    ) -> u32 {
        env.storage()
            .persistent()
            .get(&types::ProjectKey::EvidenceCount(
                project_key.clone(),
                commit_hash.clone(),
                kind.clone(),
            ))
            .unwrap_or(0)
    }

    /// Read the evidence entry at `index`, panicking with `NoEvidenceFound` if absent.
    fn evidence_at(
        env: &Env,
        project_key: &Bytes,
        commit_hash: &String,
        kind: &types::EvidenceKind,
        index: u32,
    ) -> types::Evidence {
        env.storage()
            .persistent()
            .get(&types::ProjectKey::Evidence(
                project_key.clone(),
                commit_hash.clone(),
                kind.clone(),
                index,
            ))
            .unwrap_or_else(|| {
                panic_with_error!(env, &errors::ContractErrors::NoEvidenceFound);
            })
    }
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
    ///
    /// # Returns
    /// * `Bytes` - The project key (keccak256 hash of the name)
    ///
    /// # Panics
    /// * If the project name is longer than 15 characters
    /// * If the project already exists
    /// * If the maintainer is not authorized
    /// * If the maintainer has insufficient collateral balance
    fn register(
        env: Env,
        maintainer: Address,
        name: String,
        maintainers: Vec<Address>,
        url: String,
        ipfs: String,
    ) -> Bytes {
        Tansu::require_not_paused(env.clone());

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
    fn commit(env: Env, maintainer: Address, project_key: Bytes, hash: String) {
        Tansu::require_not_paused(env.clone());

        crate::auth_maintainers(&env, &maintainer, &project_key);
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
    /// one. This keeps a full, backend-less, on-chain timeline (e.g. successive
    /// CVE re-scans of the same commit). `get_evidence` returns the latest entry;
    /// `get_evidence_count` / `get_evidence_at` expose the history.
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
    /// * If commit_hash or cid is empty
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

        if commit_hash.is_empty() || cid.is_empty() {
            panic_with_error!(&env, &errors::ContractErrors::InvalidEvidence);
        }

        let count_key = types::ProjectKey::EvidenceCount(
            project_key.clone(),
            commit_hash.clone(),
            kind.clone(),
        );
        let version: u32 = env.storage().persistent().get(&count_key).unwrap_or(0);

        let evidence = types::Evidence {
            cid: cid.clone(),
            created_at: env.ledger().timestamp(),
        };

        let entry_key = types::ProjectKey::Evidence(
            project_key.clone(),
            commit_hash.clone(),
            kind.clone(),
            version,
        );
        let storage = env.storage().persistent();
        storage.set(&entry_key, &evidence);
        storage.set(&count_key, &(version + 1));

        // Bump both the new entry and the counter towards the maximum TTL so the
        // historical record survives state rent for as long as possible.
        storage.extend_ttl(&entry_key, EVIDENCE_BUMP_THRESHOLD, EVIDENCE_BUMP_AMOUNT);
        storage.extend_ttl(&count_key, EVIDENCE_BUMP_THRESHOLD, EVIDENCE_BUMP_AMOUNT);

        events::EvidenceSet {
            project_key,
            commit_hash,
            kind,
            cid,
            version,
        }
        .publish(&env);
    }

    /// Get the latest external evidence for a specific project commit and kind.
    ///
    /// # Arguments
    /// * `env` - The environment object
    /// * `project_key` - The project key identifier
    /// * `commit_hash` - The commit hash this evidence describes
    /// * `kind` - The evidence category
    ///
    /// # Returns
    /// * `types::Evidence` - The most recent stored evidence pointer
    ///
    /// # Panics
    /// * If the project doesn't exist
    /// * If no evidence exists for the project, commit, and kind
    fn get_evidence(
        env: Env,
        project_key: Bytes,
        commit_hash: String,
        kind: types::EvidenceKind,
    ) -> types::Evidence {
        Self::require_project(&env, &project_key);

        let count = Self::evidence_count(&env, &project_key, &commit_hash, &kind);
        if count == 0 {
            panic_with_error!(&env, &errors::ContractErrors::NoEvidenceFound);
        }

        Self::evidence_at(&env, &project_key, &commit_hash, &kind, count - 1)
    }

    /// Get the number of evidence entries stored for a commit and kind.
    ///
    /// Returns 0 when no evidence has been recorded yet.
    ///
    /// # Panics
    /// * If the project doesn't exist
    fn get_evidence_count(
        env: Env,
        project_key: Bytes,
        commit_hash: String,
        kind: types::EvidenceKind,
    ) -> u32 {
        Self::require_project(&env, &project_key);
        Self::evidence_count(&env, &project_key, &commit_hash, &kind)
    }

    /// Get a specific historical evidence entry by its zero-based index.
    ///
    /// # Panics
    /// * If the project doesn't exist
    /// * If no evidence exists at that index
    fn get_evidence_at(
        env: Env,
        project_key: Bytes,
        commit_hash: String,
        kind: types::EvidenceKind,
        index: u32,
    ) -> types::Evidence {
        Self::require_project(&env, &project_key);
        Self::evidence_at(&env, &project_key, &commit_hash, &kind, index)
    }

    /// Extend the TTL of a historical evidence entry, keeping it alive on-chain.
    ///
    /// Permissionless on purpose: anyone may pay to preserve a project's evidence
    /// history. It can only extend rent, never modify or read out the data.
    ///
    /// # Panics
    /// * If the project doesn't exist
    /// * If no evidence exists at that index
    fn bump_evidence(
        env: Env,
        project_key: Bytes,
        commit_hash: String,
        kind: types::EvidenceKind,
        index: u32,
    ) {
        Self::require_project(&env, &project_key);

        let entry_key = types::ProjectKey::Evidence(project_key, commit_hash, kind, index);
        let storage = env.storage().persistent();
        if !storage.has(&entry_key) {
            panic_with_error!(&env, &errors::ContractErrors::NoEvidenceFound);
        }
        storage.extend_ttl(&entry_key, EVIDENCE_BUMP_THRESHOLD, EVIDENCE_BUMP_AMOUNT);
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
