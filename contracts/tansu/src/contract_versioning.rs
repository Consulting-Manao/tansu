#![allow(clippy::too_many_arguments)]

use soroban_sdk::{Address, Bytes, Env, String, Vec, contractimpl, panic_with_error};

use stellar_registry_types::NormalizedName;

use crate::{Tansu, TansuArgs, TansuClient, TansuTrait, VersioningTrait, errors, events, types};

const MAX_PROJECTS_PER_PAGE: u32 = 10;

#[contractimpl]
impl VersioningTrait for Tansu {
    /// Register a new project.
    ///
    /// Creates a new project entry with maintainers, URL, and commit hash.
    /// The project name is validated/normalized via `NormalizedName` (shared
    /// with the Stellar Registry contract); the project key is the keccak256
    /// hash of the normalized name.
    ///
    /// # Arguments
    /// * `env` - The environment object
    /// * `maintainer` - The address of the maintainer calling this function
    /// * `name` - The project name. Must be a canonical crate-style name:
    ///   non-empty, ≤64 chars, ascii alphanumeric/`-`/`_`, starting with a
    ///   letter, and not a Rust keyword. Uppercase is lowercased and `_` becomes
    ///   `-`.
    /// * `maintainers` - List of maintainer addresses for the project
    /// * `url` - The project's Git repository URL
    /// * `ipfs` - CID of the tansu.toml file with associated metadata
    /// * `min_voting_period` - Optional per-project minimum voting period in seconds.
    ///   When `None`, the global default is used. When `Some(v)`, `v` must be > 0 and
    ///   <= `MAX_VOTING_PERIOD`.
    /// * `execute_delay` - Optional per-project DAO execute timelock in seconds. When
    ///   `None`, the global `TIMELOCK_DELAY` is used. When `Some(v)`, `v` must be > 0
    ///   and <= `MAX_VOTING_PERIOD`. Only affects DAO proposal `execute()`; the admin
    ///   upgrade timelock in `propose_upgrade` is unaffected.
    ///
    /// # Returns
    /// * `Bytes` - The project key (keccak256 hash of the name)
    ///
    /// # Panics
    /// * If the project name is not a valid `NormalizedName`
    /// * If the project already exists
    /// * If the maintainer is not authorized
    /// * If `min_voting_period` or `execute_delay` is `Some(0)` or exceeds `MAX_VOTING_PERIOD`
    fn register(
        env: Env,
        maintainer: Address,
        name: String,
        maintainers: Vec<Address>,
        url: String,
        ipfs: String,
        min_voting_period: Option<u64>,
        execute_delay: Option<u64>,
    ) -> Bytes {
        Tansu::require_not_paused(env.clone());

        for v in [min_voting_period, execute_delay].iter().flatten() {
            if *v == 0 || *v > crate::contract_dao::MAX_VOTING_PERIOD {
                panic_with_error!(&env, &errors::ContractErrors::InvalidVotingPeriod);
            }
        }

        // Validate + normalize the project name. This replaces the old
        // SorobanDomain registration: `NormalizedName` (shared with the Stellar
        // Registry contract) enforces a canonical crate-style name — ≤64 chars,
        // ascii alphanumeric/`-`/`_`, leading alphabetic, no Rust keywords — and
        // lowercases it so the keccak256 project key is collision-free.
        let name = match NormalizedName::new(&name) {
            Ok(normalized) => normalized.to_string(),
            Err(_) => panic_with_error!(&env, &errors::ContractErrors::InvalidProjectName),
        };

        let project = types::Project {
            name: name.clone(),
            config: types::Config { url, ipfs },
            maintainers: maintainers.clone(),
            sub_projects: None,
        };

        let name_b = name.to_bytes();
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

    /// Get the effective DAO execute timelock for a project in seconds.
    ///
    /// Returns the per-project override stored at registration if set, otherwise
    /// the global `TIMELOCK_DELAY` default. Only governs DAO proposal `execute()`;
    /// the admin upgrade timelock in `propose_upgrade` is unaffected.
    fn get_execute_delay(env: Env, project_key: Bytes) -> u64 {
        env.storage()
            .persistent()
            .get(&types::ProjectKey::ExecuteDelay(project_key))
            .unwrap_or(types::TIMELOCK_DELAY)
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
