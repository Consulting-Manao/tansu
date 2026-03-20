use soroban_sdk::{Address, contracttype};

#[contracttype]
pub enum DataKey {
    Admin,
    NextTokenId,
    Name,
    Symbol,
    Uri,
}

#[contracttype]
pub enum NFTStorageKey {
    Owner(u32),
    Balance(Address),
}
