//! SCF Membership
//!
//! Members are verified members of the community. After verification,
//! the admin can add a member. A member is represented with a SEP-50 NFT.
//! This is a soulbound NFT which can only be clawed backed by an admin.
//!
//! Additional traits are defined following ERC-7496:
//! - SCF role,
//! - Neural Quorum Governance Score.
//!
//! We pull NQG score from the NQG contract itself. So only the role can be
//! set via this contract.
//!
#![no_std]

use soroban_sdk::{Address, BytesN, Env, String, contract, contractmeta, Vec, Bytes};

contractmeta!(key = "Description", val = "SCF Membership");

mod scf_token;
mod scf_governance;

mod errors;
mod events;
// #[cfg(test)]
// mod test;

#[contract]
pub struct SCFMembership;

pub trait SCFTokenTrait {
    fn __constructor(e: &Env, admin: Address, name: String, symbol: String, uri: String);

    fn upgrade(e: &Env, wasm_hash: BytesN<32>);

    /// Mint a member.
    ///
    /// # Arguments
    ///
    /// * `e` - The environment object.
    /// * `to` - Account of the token's owner.
    ///
    /// # Returns
    ///
    /// The u32 token_id.
    ///
    /// # Panics
    ///
    /// * If the caller is not the admin.
    /// * If the token was already minted.
    /// * If there are no more tokens to be minted.
    ///
    /// # Events
    ///
    /// * topics - `["mint", to: Address]`
    /// * data - `[token_id: u32]`
    fn mint(e: &Env, to: Address) -> u32;

    /// Clawback `token_id` token from owner.
    ///
    /// Only the admin can execute this function which sends the token to the
    /// admin address. This is an extreme measure which quarantines
    /// the token. Used in case of terms breach or key rotation.
    /// For audit purposes tokens are kept and not burned.
    ///
    /// # Arguments
    ///
    /// * `e` - The environment object.
    /// * `token_id` - Token id as a number.
    ///
    /// # Events
    ///
    /// * topics - `["clawback", from: Address]`
    /// * data - `[token_id: u32]`
    fn clawback(e: &Env, token_id: u32);

    /// Returns the number of tokens in `owner`'s account.
    ///
    /// # Arguments
    ///
    /// * `e` - The environment object.
    /// * `owner` - Account of the token's owner.
    fn balance(e: &Env, owner: Address) -> u32;

    /// Returns the address of the owner of the given `token_id`.
    ///
    /// # Arguments
    ///
    /// * `e` - The environment object.
    /// * `token_id` - Token id as a number.
    ///
    /// # Notes
    ///
    /// If the token does not exist, this function is expected to panic.
    fn owner_of(e: &Env, token_id: u32) -> Address;

    /// Returns the token collection name.
    ///
    /// # Arguments
    ///
    /// * `e` - The environment object.
    fn name(e: &Env) -> String;

    /// Returns the token collection symbol.
    ///
    /// # Arguments
    ///
    /// * `e` - The environment object.
    fn symbol(e: &Env) -> String;

    /// Returns the Uniform Resource Identifier (URI) for `token_id` token.
    ///
    /// # Arguments
    ///
    /// * `e` - The environment object.
    /// * `token_id` - Token id as a number.
    ///
    /// # Returns
    ///
    /// The URI of the specific `token_id`.
    ///
    /// # Panics
    ///
    /// * If the token does not exist.
    fn token_uri(e: &Env, token_id: u32) -> String;
}

pub trait SCFGovernanceTrait {
    /// Returns the trait value of a token.
    ///
    /// # Arguments
    ///
    /// * `e` - The environment object.
    /// * `token_id` - Token id as a number.
    /// * `trait_key` - Trait key as a string.
    ///
    /// # Returns
    ///
    /// The trait value.
    ///
    /// # Panics
    ///
    /// * If the token does not exist.
    /// * If the trait does not exist.
    fn get_trait_value(e: &Env, token_id: u32, trait_key: String) -> i128;

    /// Returns the trait values of a token.
    ///
    /// # Arguments
    ///
    /// * `e` - The environment object.
    /// * `token_id` - Token id as a number.
    /// * `trait_keys` - Trait keys as strings.
    ///
    /// # Returns
    ///
    /// The traits value.
    ///
    /// # Panics
    ///
    /// * If the token does not exist.
    /// * If one of the trait does not exist.
    fn get_trait_values(e: &Env, token_id: u32, trait_keys: Vec<String>) -> Vec<i128>;

    /// Set the trait value of a token.
    ///
    /// # Arguments
    ///
    /// * `e` - The environment object.
    /// * `token_id` - Token id as a number.
    /// * `trait_key` - Trait key as a string.
    /// * `new_value` - The value of the trait.
    ///
    /// # Panics
    ///
    /// * If the token does not exist.
    /// * If the trait does not exist.
    /// * If the new value is out of bound.
    fn set_trait(e: &Env, token_id: u32, trait_key: String, new_value: i128);

    /// Returns the Uniform Resource Identifier (URI) for trait definition.
    ///
    /// Specifies metadata for trait representation and usage.
    ///
    /// # Arguments
    ///
    /// * `e` - The environment object.
    ///
    /// # Returns
    ///
    /// The URI of the specification.
    fn get_trait_metadata_uri(e: &Env) -> String;
}
