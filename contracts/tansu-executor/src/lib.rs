#![no_std]
//! Runs the outcome calls of Tansu proposals.
//!
//! A contract that calls another one authorizes that call with its own
//! address. When Tansu called an outcome itself, the outcome could use Tansu's
//! authority, and so spend what Tansu holds. Tansu calls this contract instead,
//! which makes the outcome call. The executor holds nothing and has no role
//! anywhere, so its authority is worthless: never send it funds or give it a
//! role. It has no storage, no admin and no upgrade. To change it, deploy a new
//! one and point Tansu at it with `set_executor`.

use soroban_sdk::{Address, Env, Symbol, Val, Vec, contract, contractimpl};

#[contract]
pub struct TansuExecutor;

#[contractimpl]
impl TansuExecutor {
    /// Call `target.execute_fn(args)` and return its result.
    ///
    /// # Panics
    /// * If the call fails.
    pub fn run(env: Env, target: Address, execute_fn: Symbol, args: Vec<Val>) -> Val {
        env.invoke_contract(&target, &execute_fn, args)
    }
}
