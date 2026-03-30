use soroban_sdk::{Address, contracttype};

// Storage keys types

#[contracttype]
pub enum DataKey {
    Admin,
    NextTokenId,
    Name,
    Symbol,
    Uri,
    UriTrait,
    NqgContract,
}

#[contracttype]
pub enum NFTStorageKey {
    Owner(u32),
    Balance(Address),
    Role(u32), // SCF Role
}

// Types

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum Role {
    Pilot = 3,
    Navigator = 2,
    Pathfinder = 1,
    Verified = 0,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct Governance {
    pub role: Role,
    pub nqg: i128,
}
