use soroban_sdk::contractimpl;

use crate::{MigrationTrait, Tansu, TansuArgs, TansuClient};

/// Data migrations of a contract upgrade go here, as admin calls of
/// `MigrationTrait`. v4 needs none: the v3 migration has run on mainnet.
#[contractimpl]
impl MigrationTrait for Tansu {}
