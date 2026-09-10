#![allow(clippy::needless_pass_by_value)]

extern crate std;

use soroban_sdk::{Address, Bytes, Env, testutils::Address as _};

use crate::{RegistryTansuManager, RegistryTansuManagerClient};

use crate::tansu;

#[test]
fn constructor_stores_values() {
    let env = Env::default();
    // Tansu's `__constructor` calls `require_auth` on the admin from a
    // nested `pause` call, which recording mode treats as non-root auth.
    env.mock_all_auths_allowing_non_root_auth();
    let admin = Address::generate(&env);
    let tansu = env.register(tansu::WASM, (admin,));
    let registry = Address::generate(&env);
    let project_key = Bytes::from_slice(&env, &[7u8; 16]);
    let manager = env.register(
        RegistryTansuManager,
        (tansu.clone(), project_key.clone(), registry.clone()),
    );
    let client = RegistryTansuManagerClient::new(&env, &manager);
    assert_eq!(client.tansu(), tansu);
    assert_eq!(client.project_key(), project_key);
    assert_eq!(client.registry(), registry);
}
