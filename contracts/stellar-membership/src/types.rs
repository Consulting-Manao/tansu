use soroban_sdk::{Address, BytesN, String, Vec, contracttype};

/// Maximum number of projects a member can declare.
pub const MAX_PROJECTS: u32 = 10;
/// Maximum length of a project identifier, e.g. `daoip-5:scf:application:tansu`.
pub const MAX_PROJECT_LEN: u32 = 128;
/// Maximum length of the bio IPFS CID.
pub const MAX_BIO_LEN: u32 = 128;
/// Maximum length of an external account id or handle.
pub const MAX_ACCOUNT_LEN: u32 = 64;

/// Delay before an attested recovery can be finalized (7 days).
pub const RECOVERY_DELAY: u64 = 7 * 24 * 3600;

const DAY_IN_LEDGERS: u32 = 17_280;
pub const TTL_THRESHOLD: u32 = 30 * DAY_IN_LEDGERS;
pub const TTL_EXTEND_TO: u32 = 120 * DAY_IN_LEDGERS;

// Storage keys

#[contracttype]
pub enum DataKey {
    Admin,
    Attester,
    NextTokenId,
    Name,
    Symbol,
    Uri,
    UriTrait,
    NqgContract,
}

#[contracttype]
pub enum MemberKey {
    /// token_id -> current address. Absent when revoked.
    Owner(u32),
    /// address -> token_id. Absent when the address is not a member.
    TokenOf(Address),
    /// token_id -> Member.
    Member(u32),
    /// (provider, account id) -> token_id.
    Account(Provider, String),
    /// token_id -> pending RecoveryRequest.
    Recovery(u32),
}

// Types

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Role {
    Verified = 0,
    Pathfinder = 1,
    Navigator = 2,
    Pilot = 3,
}

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Status {
    Active = 0,
    Revoked = 1,
}

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Provider {
    Discord = 0,
    Github = 1,
    X = 2,
}

/// An account on an external platform verified by the attester.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SocialAccount {
    pub provider: Provider,
    /// Stable identifier on the platform (e.g. Discord snowflake).
    pub id: String,
    /// Display handle at the time of verification.
    pub handle: String,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ExternalAccounts {
    /// At most one account per provider.
    pub accounts: Vec<SocialAccount>,
    /// sha256 of the trimmed, lowercased email.
    pub email_hash: Option<BytesN<32>>,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Member {
    pub status: Status,
    pub role: Role,
    pub external_accounts: ExternalAccounts,
    /// IPFS CID of the profile directory.
    pub bio: String,
    /// DAOIP-5 project identifiers.
    pub projects: Vec<String>,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RecoveryRequest {
    pub new_address: Address,
    pub executable_at: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Governance {
    pub role: Role,
    pub nqg: i128,
}
