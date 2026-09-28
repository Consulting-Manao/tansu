use crate::{Tansu, TansuClient, types};
use soroban_sdk::testutils::Address as _;
use soroban_sdk::{Address, Bytes, Env, Executable, String, token, vec};

pub struct TestSetup {
    pub env: Env,
    pub contract: TansuClient<'static>,
    pub contract_id: Address,
    pub token_stellar: token::StellarAssetClient<'static>,
    pub grogu: Address,
    pub mando: Address,
    pub contract_admin: Address,
}

pub fn create_env() -> Env {
    let env = Env::default();
    env.mock_all_auths();
    env
}

pub mod nqg {
    use soroban_sdk::{Address, Env, contract, contractimpl};

    /// NQG contract giving every address the same voting weight.
    #[contract]
    pub struct Mock;
    #[contractimpl]
    impl Mock {
        pub fn get_voting_power(_e: &Env, _user: Address) -> u32 {
            20_000_000
        }
    }
}

/// Point a project's voting weights at the mock NQG contract, pinned by hash.
pub fn set_nqg(setup: &TestSetup, project_key: &Bytes) -> Address {
    let nqg_id = setup.env.register(nqg::Mock, ());
    let wasm_hash = match nqg_id.executable().unwrap() {
        Executable::Wasm(wasm) => wasm,
        _ => panic!(),
    };
    setup.contract.set_nqg_contract(
        &setup.grogu,
        project_key,
        &Some(types::ContractRef {
            address: nqg_id.clone(),
            wasm_hash: Some(wasm_hash),
        }),
    );
    nqg_id
}

pub fn create_test_data() -> TestSetup {
    let env = create_env();

    let issuer = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(issuer.clone());
    let token_stellar = token::StellarAssetClient::new(&env, &sac.address());

    let contract_admin = Address::generate(&env);
    let executor = env.register(tansu_executor::TansuExecutor, ());
    let contract_id = env.register(Tansu, (&contract_admin, sac.address(), &executor));
    let contract = TansuClient::new(&env, &contract_id);

    contract.pause(&contract_admin, &false);

    let grogu = Address::generate(&env);
    let mando = Address::generate(&env);

    TestSetup {
        env,
        contract,
        contract_id,
        token_stellar,
        grogu,
        mando,
        contract_admin,
    }
}

pub fn init_contract(setup: &TestSetup) -> Bytes {
    init_contract_with_threshold(setup, None)
}

pub fn init_contract_with_threshold(
    setup: &TestSetup,
    attestation_threshold: Option<u32>,
) -> Bytes {
    let name = String::from_str(&setup.env, "tansu");
    let url = String::from_str(&setup.env, "github.com/tansu");
    let ipfs = String::from_str(&setup.env, "2ef4f49fdd8fa9dc463f1f06a094c26b88710990");
    let maintainers = vec![&setup.env, setup.grogu.clone(), setup.mando.clone()];

    let genesis_amount: i128 = 1_000_000_000 * 10_000_000;
    setup.token_stellar.mint(&setup.grogu, &genesis_amount);
    setup.token_stellar.mint(&setup.mando, &genesis_amount);

    setup.contract.register(
        &setup.grogu,
        &name,
        &maintainers,
        &url,
        &ipfs,
        &None,
        &None,
        &attestation_threshold,
    )
}
