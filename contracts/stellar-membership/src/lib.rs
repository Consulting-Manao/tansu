//! Stellar Membership
//!
//! A member of the Stellar community is represented by a soulbound SEP-50
//! NFT. The token ID is the authoritative identity of a person: the address
//! owning it is only the current key and can be rotated or recovered.
//!
//! Onboarding is done by the member with an attester co-signing the
//! verified external accounts (Discord, GitHub, X, email hash). The member
//! manages its bio (IPFS CID) and projects (DAOIP-5 identifiers).
//!
//! Additional traits are defined following ERC-7496:
//! - role,
//! - Neural Quorum Governance Score, pulled from the NQG contract.
//!
//! Any address can be a member: classic (G) or contract (C) accounts.
//! Every change is published as an event with the token ID as topic.
#![no_std]

#[cfg(test)]
extern crate std;

use soroban_sdk::{Address, BytesN, Env, String, Vec, contract, contractmeta};

contractmeta!(key = "Description", val = "Stellar Membership");

mod governance;
mod keys;
mod member;
mod storage;
mod token;

mod errors;
mod events;
mod types;

#[cfg(test)]
mod tests;

#[contract]
pub struct StellarMembership;

pub trait TokenTrait {
    /// # Arguments
    ///
    /// * `admin` - Account managing members and upgrades.
    /// * `attester` - Account co-signing verified external accounts.
    /// * `name` - Token collection name.
    /// * `symbol` - Token collection symbol.
    /// * `uri` - Base URI, token URI is `{uri}/{role}`.
    /// * `uri_trait` - URI of the ERC-7496 trait metadata.
    /// * `nqg_contract` - Neural Quorum Governance contract.
    #[allow(clippy::too_many_arguments)]
    fn __constructor(
        e: &Env,
        admin: Address,
        attester: Address,
        name: String,
        symbol: String,
        uri: String,
        uri_trait: String,
        nqg_contract: Address,
    );

    /// Upgrade the contract. Admin only.
    fn upgrade(e: &Env, wasm_hash: BytesN<32>);

    /// Replace the attester. Admin only.
    ///
    /// # Events
    ///
    /// * topics - `["attester_set"]`
    /// * data - `{attester: Address}`
    fn set_attester(e: &Env, attester: Address);

    fn admin(e: &Env) -> Address;

    fn attester(e: &Env) -> Address;

    /// Mint a member.
    ///
    /// Requires the auth of `to` and of the attester over
    /// `(to, role, external_accounts)`. The bio and projects are the
    /// member's own declaration.
    ///
    /// # Arguments
    ///
    /// * `to` - Address of the member.
    /// * `role` - Role of the member.
    /// * `external_accounts` - Verified external accounts.
    /// * `bio` - IPFS CID of the profile, can be empty.
    /// * `projects` - DAOIP-5 project identifiers, at most `MAX_PROJECTS`.
    ///
    /// # Returns
    ///
    /// The token ID.
    ///
    /// # Panics
    ///
    /// * If `to` already holds a token.
    /// * If an external account is bound to another token.
    /// * If a value exceeds its bounds.
    ///
    /// # Events
    ///
    /// * topics - `["minted", token_id: u32, to: Address]`
    /// * data - `{role, external_accounts, bio, projects}`
    fn mint(
        e: &Env,
        to: Address,
        role: types::Role,
        external_accounts: types::ExternalAccounts,
        bio: String,
        projects: Vec<String>,
    ) -> u32;

    /// Revoke a token. Admin only.
    ///
    /// The member record and external accounts are kept, only the address
    /// is released. Cancels a pending recovery. `recover` reinstates it.
    ///
    /// # Panics
    ///
    /// * If the token does not exist or is already revoked.
    ///
    /// # Events
    ///
    /// * topics - `["revoked", token_id: u32]`
    /// * data - `{from: Address}`
    fn revoke(e: &Env, token_id: u32);

    /// Returns 1 if `owner` holds a token, 0 otherwise.
    fn balance(e: &Env, owner: Address) -> u32;

    /// Returns the address holding `token_id`.
    ///
    /// # Panics
    ///
    /// * If the token does not exist or is revoked.
    fn owner_of(e: &Env, token_id: u32) -> Address;

    /// Returns the token held by `owner`, if any.
    fn token_of(e: &Env, owner: Address) -> Option<u32>;

    fn name(e: &Env) -> String;

    fn symbol(e: &Env) -> String;

    /// Returns `{uri}/{role}`.
    ///
    /// # Panics
    ///
    /// * If the token does not exist.
    fn token_uri(e: &Env, token_id: u32) -> String;

    /// Returns the next token ID to mint, i.e. the number of tokens minted.
    fn next_token_id(e: &Env) -> u32;
}

pub trait MemberTrait {
    /// Returns the member record of `token_id`.
    ///
    /// # Panics
    ///
    /// * If the token does not exist.
    fn member(e: &Env, token_id: u32) -> types::Member;

    /// Returns the token bound to an external account, if any.
    fn token_by_account(e: &Env, provider: types::Provider, id: String) -> Option<u32>;

    /// Set the role. Admin only.
    ///
    /// # Events
    ///
    /// * topics - `["role_set", token_id: u32]`
    /// * data - `{role}`
    fn set_role(e: &Env, token_id: u32, role: types::Role);

    /// Replace the external accounts.
    ///
    /// Requires the auth of the owner and of the attester.
    ///
    /// # Panics
    ///
    /// * If the token does not exist or is revoked.
    /// * If an external account is bound to another token.
    ///
    /// # Events
    ///
    /// * topics - `["external_accounts_set", token_id: u32]`
    /// * data - `{external_accounts}`
    fn set_external_accounts(e: &Env, token_id: u32, external_accounts: types::ExternalAccounts);

    /// Set the bio. Owner or admin.
    ///
    /// # Events
    ///
    /// * topics - `["bio_set", token_id: u32]`
    /// * data - `{bio}`
    fn set_bio(e: &Env, caller: Address, token_id: u32, bio: String);

    /// Set the projects. Owner or admin.
    ///
    /// # Events
    ///
    /// * topics - `["projects_set", token_id: u32]`
    /// * data - `{projects}`
    fn set_projects(e: &Env, caller: Address, token_id: u32, projects: Vec<String>);
}

pub trait KeyTrait {
    /// Move a token to a new address.
    ///
    /// Requires the auth of the owner and of `new_address`.
    /// Cancels a pending recovery.
    ///
    /// # Panics
    ///
    /// * If the token does not exist or is revoked.
    /// * If `new_address` already holds a token.
    ///
    /// # Events
    ///
    /// * topics - `["key_rotated", token_id: u32]`
    /// * data - `{from, to}`
    fn rotate_key(e: &Env, token_id: u32, new_address: Address);

    /// Propose to move a token to `new_address` after `RECOVERY_DELAY`.
    ///
    /// Used when the key is lost. Requires the auth of the attester, who
    /// verified the external accounts of the member, and of `new_address`.
    ///
    /// # Panics
    ///
    /// * If the token does not exist or is revoked.
    /// * If a recovery is already pending.
    /// * If `new_address` already holds a token.
    ///
    /// # Events
    ///
    /// * topics - `["recovery_proposed", token_id: u32]`
    /// * data - `{new_address, executable_at}`
    fn propose_recovery(e: &Env, token_id: u32, new_address: Address);

    /// Cancel a pending recovery. Owner or admin.
    ///
    /// # Events
    ///
    /// * topics - `["recovery_cancelled", token_id: u32]`
    fn cancel_recovery(e: &Env, caller: Address, token_id: u32);

    /// Execute a pending recovery.
    ///
    /// Anyone once `RECOVERY_DELAY` elapsed. Before that, requires the auth
    /// of the admin, which approves the recovery early.
    ///
    /// # Panics
    ///
    /// * If no recovery is pending.
    /// * If the new address holds a token in the meantime.
    ///
    /// # Events
    ///
    /// * topics - `["recovered", token_id: u32]`
    /// * data - `{from, to}`
    fn finalize_recovery(e: &Env, token_id: u32);

    /// Move a token to `new_address` immediately. Admin only.
    ///
    /// Only the admin signs: the member is not present when the key is lost
    /// without attested accounts, or when a revoked token is reinstated.
    /// Clears a pending recovery.
    ///
    /// # Panics
    ///
    /// * If the token does not exist.
    /// * If `new_address` already holds a token.
    ///
    /// # Events
    ///
    /// * topics - `["recovered", token_id: u32]`
    /// * data - `{from: Option<Address>, to}`
    fn recover(e: &Env, token_id: u32, new_address: Address);

    /// Returns the pending recovery of `token_id`, if any.
    fn recovery(e: &Env, token_id: u32) -> Option<types::RecoveryRequest>;
}

pub trait GovernanceTrait {
    /// Returns the trait value of a token.
    ///
    /// # Arguments
    ///
    /// * `token_id` - Token ID.
    /// * `trait_key` - One of "nqg", "role".
    ///
    /// # Panics
    ///
    /// * If the token does not exist.
    /// * If the trait does not exist.
    /// * For "nqg", if the token is revoked.
    fn trait_value(e: &Env, token_id: u32, trait_key: String) -> i128;

    /// Returns the trait values of a token.
    fn trait_values(e: &Env, token_id: u32, trait_keys: Vec<String>) -> Vec<i128>;

    /// Returns the URI of the trait metadata.
    fn trait_metadata_uri(e: &Env) -> String;

    /// Returns the role and NQG score of a token.
    ///
    /// NQG is 0 for members without NQG score.
    ///
    /// # Panics
    ///
    /// * If the token does not exist or is revoked.
    fn governance(e: &Env, token_id: u32) -> types::Governance;
}
