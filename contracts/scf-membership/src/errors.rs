use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum NonFungibleTokenError {
    /// Indicates a non-existent `token_id`.
    NonExistentToken = 201,
    /// Indicates a non-existent `trait_key`.
    TraitDoesNotExist = 202,
    /// Indicates that `trait_key` cannot be set.
    TraitUnSettable = 203,
    RoleDoesNotExist = 204,
    NqgContractError = 205,
}
