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
}

#[contracttype]
pub enum NFTStorageKey {
    Owner(u32),
    Balance(Address),
    Governance(u32),
}

// Types

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct Governance {
    pub role: i128,
}
