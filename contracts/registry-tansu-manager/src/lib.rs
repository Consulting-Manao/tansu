#![no_std]
// The Tansu-generated client + types include multi-arg fns (e.g.
// `register`), which trip `too_many_arguments`. Allow on the lib since the
// lint fires inside the macro expansion of `contractimport!`.
#![allow(clippy::too_many_arguments)]

use soroban_sdk::{
    self, Address, Bytes, Env, IntoVal, Symbol, Val, Vec,
    auth::{ContractContext, InvokerContractAuthEntry, SubContractInvocation},
    contract, contracterror, contractimpl, contracttype, vec,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    /// Proposal has no outcomes attached.
    NoOutcomeContracts = 1,
    /// Proposal has more than one outcome — this manager authorizes exactly
    /// one sub-call per proposal.
    MultipleOutcomes = 2,
}

// Proposal/status types and the client are derived from the real Tansu
// contract's wasm spec, built by `make contract_build` in this workspace.
mod tansu {
    soroban_sdk::contractimport!(file = "../../target/wasm32v1-none/release/tansu.wasm");
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// Tansu DAO contract whose proposals this manager drives.
    Tansu,
    /// Tansu workspace key this manager represents. All Tansu lookups are
    /// keyed by this — a wrong-project caller can't piggyback.
    ProjectKey,
    /// Registry this manager is the manager of. Recorded for inspection;
    /// `trigger` doesn't read it directly because it uses whatever outcome
    /// the (project_key-gated) proposal carries.
    Registry,
}

#[contract]
pub struct RegistryTansuManager;

#[contractimpl]
impl RegistryTansuManager {
    pub fn __constructor(env: &Env, tansu: &Address, project_key: &Bytes, registry: &Address) {
        env.storage().instance().set(&DataKey::Tansu, tansu);
        env.storage()
            .instance()
            .set(&DataKey::ProjectKey, project_key);
        env.storage().instance().set(&DataKey::Registry, registry);
    }

    pub fn tansu(env: &Env) -> Address {
        env.storage().instance().get(&DataKey::Tansu).unwrap()
    }

    pub fn project_key(env: &Env) -> Bytes {
        env.storage().instance().get(&DataKey::ProjectKey).unwrap()
    }

    pub fn registry(env: &Env) -> Address {
        env.storage().instance().get(&DataKey::Registry).unwrap()
    }

    /// Drive a Tansu proposal through to outcome execution in one transaction.
    ///
    /// Flow:
    ///
    /// 1. Read the proposal from this manager's configured Tansu under this
    ///    manager's configured `project_key`. Wrong-project callers can't
    ///    construct a working invocation — `get_proposal` is keyed by
    ///    `(project_key, proposal_id)` Tansu-side, so any mismatched proposal
    ///    decodes to whatever lives at that key in *our* DAO or panics.
    /// 2. Take the single approved-branch outcome (`outcome_contracts[0]`):
    ///    its `address`, `execute_fn`, and `args`.
    /// 3. Pre-authorize **this contract's auth** for exactly that one
    ///    sub-call via `env.authorize_as_current_contract(...)`. Nothing
    ///    else gets authorized. The auth entry is scoped to one specific
    ///    `(contract, fn, args)` triple.
    /// 4. Call `Tansu.execute(maintainer, project_key, proposal_id, _, _)`.
    ///    Tansu tallies the votes, sets the proposal to its terminal status,
    ///    and (on `Approved`) auto-invokes the outcome. When that outcome
    ///    reaches `manager.require_auth()`, the host matches it against the
    ///    pre-authorization from step 3 and lets the call run.
    ///
    /// For this to work the manager must be the Tansu project's maintainer
    /// (set up at deploy time via `Tansu::register(..., maintainers=[manager])`
    /// or `update_config`). That way the manager is the direct caller of
    /// `Tansu::execute`, so Tansu's internal `maintainer.require_auth()` is
    /// satisfied by contract-implicit auth — no auth entry needed for the
    /// maintainer requirement, no non-root recording issue.
    ///
    /// Tansu's own `if proposal.status != Active` guard inside `execute`
    /// prevents the same proposal being triggered twice — no separate
    /// replay guard needed here.
    pub fn trigger(env: &Env, proposal_id: u32) -> Result<(), Error> {
        let tansu = Self::tansu(env);
        let project_key = Self::project_key(env);

        let proposal = tansu::Client::new(env, &tansu).get_proposal(&project_key, &proposal_id);
        let outcomes = proposal
            .outcome_contracts
            .ok_or(Error::NoOutcomeContracts)?;
        if outcomes.len() != 1 {
            return Err(Error::MultipleOutcomes);
        }
        let oc = outcomes.get(0).unwrap();

        env.authorize_as_current_contract(vec![
            env,
            InvokerContractAuthEntry::Contract(SubContractInvocation {
                context: ContractContext {
                    contract: oc.address.clone(),
                    fn_name: oc.execute_fn.clone(),
                    args: oc.args.clone(),
                },
                sub_invocations: Vec::new(env),
            }),
        ]);

        // Tansu.execute(maintainer, project_key, proposal_id, tallies, seeds).
        // maintainer = self — must match the project's `maintainers` list in
        // Tansu (configured at registration / update_config time).
        let _: Val = env.invoke_contract(
            &tansu,
            &Symbol::new(env, "execute"),
            vec![
                env,
                env.current_contract_address().into_val(env),
                project_key.into_val(env),
                proposal_id.into_val(env),
                None::<Vec<u128>>.into_val(env),
                None::<Vec<u128>>.into_val(env),
            ],
        );
        Ok(())
    }
}

#[cfg(test)]
mod test;
