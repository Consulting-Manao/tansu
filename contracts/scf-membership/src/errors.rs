use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum NonFungibleTokenError {
    /// Indicates a non-existent `token_id`.
    NonExistentToken = 201,
    /// Indicates an error related to the ownership over a particular token.
    /// Used in transfers.
    IncorrectOwner = 202,
    /// Indicates all possible `token_id`s are already in use.
    TokenIDsAreDepleted = 203,
    /// Indicates the token was already minted.
    TokenAlreadyMinted = 210,
    /// Indicates the token was already claimed.
    TokenAlreadyClaimed = 211,
    /// Indicates the token exists but has not been claimed yet
    TokenNotClaimed = 212,
}
