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

const LEDGERS_PER_DAY: u32 = 17280;
const PERSISTENT_EXTEND_TO: u32 = 30 * LEDGERS_PER_DAY;
const PERSISTENT_LIFETIME_THRESHOLD: u32 = PERSISTENT_EXTEND_TO - LEDGERS_PER_DAY;

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
    /// * If `attestation_threshold` is outside `MIN_FINALITY_THRESHOLD_PERCENT..=100`
    fn register(
        env: Env,
        maintainer: Address,
        name: String,
        maintainers: Vec<Address>,
        url: String,
        ipfs: String,
        attestation_threshold: Option<u32>,
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
    /// Allows maintainers to change the project's URL, IPFS metadata, and maintainer list.
    ///
    /// # Arguments
    /// * `env` - The environment object
    /// * `maintainer` - The address of the maintainer calling this function
    /// * `key` - The project key identifier
    /// * `maintainers` - New list of maintainer addresses
    /// * `url` - New Git repository URL
    /// * `ipfs` - New CID of the tansu.toml file with metadata
    /// * `attestation_threshold` - Optional new finality threshold percent;
    ///   when `None` the project is reset to `DEFAULT_FINALITY_THRESHOLD_PERCENT`
    ///
    /// # Panics
    /// * If the project doesn't exist
    /// * If the maintainer is not authorized
    /// * If `attestation_threshold` is outside `MIN_FINALITY_THRESHOLD_PERCENT..=100`
    fn update_config(
        env: Env,
        maintainer: Address,
        key: Bytes,
        maintainers: Vec<Address>,
        url: String,
        ipfs: String,
        attestation_threshold: Option<u32>,
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

        set_attestation_threshold(&env, &key, attestation_threshold);

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
            Some(percent) => {
                extend_persistent_ttl(&env, &key);

                percent
            }
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

        let attestations =
            Self::get_attestations(env.clone(), project_key.clone(), commit_hash, target);

        let mut attested: u32 = 0;

        for attestation in attestations.iter() {
            if project.maintainers.contains(&attestation.attester) {
                attested += 1;
            }
        }

        let threshold = Self::get_attestation_threshold(env.clone(), project_key.clone());

        let is_final = total > 0 && attested * 100 >= threshold * total;

        types::FinalityStatus {
            attested,
            total,
            is_final,
        }
    }

    /// Record an endorsement (attestation) of a commit or evidence artifact.
    ///
    /// A multi-party primitive: independent maintainers vouch that they verified the
    /// target. Attestations are deduped by attester (last-writer-wins) — re-attesting
    /// refreshes the caller's entry rather than adding a duplicate. At most
    /// `MAX_ATTESTATIONS` are kept on-chain; older entries roll off but stay
    /// recoverable from `Attested` events via an indexer.
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
    fn attest(
        env: Env,
        attester: Address,
        project_key: Bytes,
        commit_hash: String,
        target: types::AttestationTarget,
        note: Option<String>,
    ) {
        Tansu::require_not_paused(env.clone());

        crate::auth_maintainers(&env, &attester, &project_key);

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

        let key = types::ProjectKey::Attestation(
            project_key.clone(),
            commit_hash.clone(),
            target.clone(),
        );

        let storage = env.storage().persistent();

        let mut attestations: Vec<types::Attestation> =
            storage.get(&key).unwrap_or_else(|| Vec::new(&env));

        let attestation = types::Attestation {
            attester: attester.clone(),
            weight,
            created_at: env.ledger().timestamp(),
            note,
        };

        match attestations.iter().position(|a| a.attester == attester) {
            Some(index) => attestations.set(index as u32, attestation),
            None => attestations.push_back(attestation),
        }

        while attestations.len() > MAX_ATTESTATIONS {
            attestations.remove(0);
        }

        storage.set(&key, &attestations);

        extend_persistent_ttl(&env, &key);

        events::Attested {
            project_key,
            commit_hash,
            target,
            attester,
            weight,
        }
        .publish(&env);
    }

    /// Get the attestations recorded for a project's commit or evidence target.
    ///
    /// Entries are returned oldest-first (the last element is the most recent) and
    /// are deduped by attester. At most `MAX_ATTESTATIONS` are kept on-chain; the
    /// full history stays recoverable from `Attested` events via an indexer.
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
        let key = types::ProjectKey::Attestation(project_key, commit_hash, target);

        match env.storage().persistent().get(&key) {
            Some(list) => {
                extend_persistent_ttl(&env, &key);

                list
            }
            None => Vec::new(&env),
        }
    }
}

fn extend_persistent_ttl(env: &Env, key: &types::ProjectKey) {
    env.storage()
        .persistent()
        .extend_ttl(key, PERSISTENT_LIFETIME_THRESHOLD, PERSISTENT_EXTEND_TO);
}

fn set_attestation_threshold(env: &Env, project_key: &Bytes, percent: Option<u32>) {
    let percent = percent.unwrap_or(DEFAULT_FINALITY_THRESHOLD_PERCENT);

    if !(types::MIN_FINALITY_THRESHOLD_PERCENT..=100).contains(&percent) {
        panic_with_error!(&env, &errors::ContractErrors::InvalidAttestationThreshold);
    }

    let key = types::ProjectKey::AttestationFinalityThreshold(project_key.clone());

    env.storage().persistent().set(&key, &percent);

    extend_persistent_ttl(env, &key);

    events::AttestationThresholdSet {
        project_key: project_key.clone(),
        percent,
    }
    .publish(env);
}
