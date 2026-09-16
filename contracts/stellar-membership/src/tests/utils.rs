use soroban_sdk::testutils::{
    Address as _, AuthorizedFunction, AuthorizedInvocation, Events, Ledger,
};
use soroban_sdk::{Address, BytesN, Env, Event, IntoVal, String, Symbol, Val, Vec, vec};

use crate::{StellarMembership, StellarMembershipClient, types};

pub mod nqg {
    use soroban_sdk::{
        Env, I256, String, contract, contracterror, contractimpl, contracttype, panic_with_error,
    };

    #[contracterror]
    #[derive(Copy, Clone, Debug, Eq, PartialEq)]
    #[repr(u32)]
    pub enum Error {
        NoScore = 1,
    }

    #[contracttype]
    pub enum DataKey {
        Pilot,
    }

    #[contract]
    pub struct Mock;

    #[contractimpl]
    impl Mock {
        pub fn __constructor(e: &Env, pilot: String) {
            e.storage().instance().set(&DataKey::Pilot, &pilot);
        }

        pub fn get_voting_power_for_user(e: &Env, user: String) -> I256 {
            let pilot: String = e.storage().instance().get(&DataKey::Pilot).unwrap();
            if user == pilot {
                I256::from_i128(e, 10_000_000_000_000_000_000i128)
            } else {
                panic_with_error!(e, Error::NoScore);
            }
        }
    }
}

pub struct TestSetup {
    pub env: Env,
    pub contract: StellarMembershipClient<'static>,
    pub contract_id: Address,
    pub admin: Address,
    pub attester: Address,
    /// Has an NQG score.
    pub grogu: Address,
    pub mando: Address,
}

pub fn create_test_data() -> TestSetup {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(1_000);

    let admin = Address::generate(&env);
    let attester = Address::generate(&env);
    let grogu = Address::generate(&env);
    let mando = Address::generate(&env);

    let nqg_id = env.register(nqg::Mock, (grogu.to_string(),));
    let contract_id = env.register(
        StellarMembership,
        (
            &admin,
            &attester,
            String::from_str(&env, "Stellar Members"),
            String::from_str(&env, "SMBR"),
            String::from_str(&env, "ipfs://abcd"),
            String::from_str(&env, "ipfs://wxyz"),
            &nqg_id,
        ),
    );
    let contract = StellarMembershipClient::new(&env, &contract_id);

    TestSetup {
        env,
        contract,
        contract_id,
        admin,
        attester,
        grogu,
        mando,
    }
}

pub fn account(e: &Env, provider: types::Provider, id: &str, handle: &str) -> types::SocialAccount {
    types::SocialAccount {
        provider,
        id: String::from_str(e, id),
        handle: String::from_str(e, handle),
    }
}

/// External accounts with a Discord and GitHub account derived from `seed`.
pub fn accounts(e: &Env, seed: &str) -> types::ExternalAccounts {
    types::ExternalAccounts {
        accounts: vec![
            e,
            account(e, types::Provider::Discord, &discord_id(seed), "grogu"),
            account(e, types::Provider::Github, seed, "grogu-gh"),
        ],
        email_hash: Some(BytesN::from_array(e, &[7; 32])),
    }
}

pub fn discord_id(seed: &str) -> std::string::String {
    std::format!("12345{seed}")
}

pub fn bio(e: &Env) -> String {
    String::from_str(
        e,
        "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
    )
}

pub fn projects(e: &Env, n: u32) -> Vec<String> {
    let mut projects = Vec::new(e);
    for i in 0..n {
        let id = std::format!("daoip-5:scf:application:project_{i}");
        projects.push_back(String::from_str(e, &id));
    }
    projects
}

/// Mint `to` as Verified with accounts derived from `seed`.
pub fn mint(setup: &TestSetup, to: &Address, seed: &str) -> u32 {
    setup.contract.mint(
        to,
        &types::Role::Verified,
        &accounts(&setup.env, seed),
        &bio(&setup.env),
        &projects(&setup.env, 2),
    )
}

pub fn assert_events(setup: &TestSetup, events: &[&dyn Event]) {
    let expected: std::vec::Vec<_> = events
        .iter()
        .map(|event| event.to_xdr(&setup.env, &setup.contract_id))
        .collect();
    assert_eq!(
        setup
            .env
            .events()
            .all()
            .filter_by_contract(&setup.contract_id),
        expected.as_slice()
    );
}

/// Assert that `address` authorized exactly `fn_name` with `args`.
pub fn assert_authorized(setup: &TestSetup, address: &Address, fn_name: &str, args: Vec<Val>) {
    let invocation = AuthorizedInvocation {
        function: AuthorizedFunction::Contract((
            setup.contract_id.clone(),
            Symbol::new(&setup.env, fn_name),
            args,
        )),
        sub_invocations: std::vec![],
    };
    assert!(
        setup.env.auths().contains(&(address.clone(), invocation)),
        "{fn_name} not authorized by the expected address"
    );
}

pub fn args<T: IntoVal<Env, Vec<Val>>>(e: &Env, args: T) -> Vec<Val> {
    args.into_val(e)
}
