use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum MembershipError {
    // Authorization (100-199)
    /// The caller is neither the token owner nor the admin.
    UnauthorizedSigner = 100,

    // Validation (200-299)
    /// Indicates a non-existent `token_id`.
    NonExistentToken = 200,
    /// Indicates a non-existent `trait_key`.
    TraitDoesNotExist = 201,
    /// The address already holds a token.
    MemberAlreadyExist = 202,
    /// The external account is bound to another token.
    AccountAlreadyBound = 203,
    /// More projects than `MAX_PROJECTS`.
    TooManyProjects = 204,
    /// A string is empty or exceeds its maximum length.
    InvalidLength = 205,
    /// The token has been revoked.
    TokenRevoked = 206,
    /// More than one account for a provider.
    DuplicateProvider = 207,

    // Recovery (300-399)
    /// A recovery is already pending for this token.
    RecoveryPending = 300,
    /// No recovery is pending for this token.
    NoRecovery = 301,
}
