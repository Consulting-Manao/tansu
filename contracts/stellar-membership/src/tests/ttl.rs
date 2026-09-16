use soroban_sdk::testutils::storage::{Instance as _, Persistent as _};
use soroban_sdk::testutils::{Address as _, Ledger};
use soroban_sdk::{Address, String};

use super::utils::*;
use crate::types::{self, MemberKey, TTL_EXTEND_TO, TTL_THRESHOLD};

fn ttl(setup: &TestSetup, key: &MemberKey) -> u32 {
    setup.env.as_contract(&setup.contract_id, || {
        setup.env.storage().persistent().get_ttl(key)
    })
}

fn instance_ttl(setup: &TestSetup) -> u32 {
    setup.env.as_contract(&setup.contract_id, || {
        setup.env.storage().instance().get_ttl()
    })
}

fn member_keys(setup: &TestSetup, token_id: u32, owner: &Address) -> [MemberKey; 4] {
    let e = &setup.env;
    [
        MemberKey::Member(token_id),
        MemberKey::Owner(token_id),
        MemberKey::TokenOf(owner.clone()),
        MemberKey::Account(
            types::Provider::Discord,
            String::from_str(e, &discord_id("1")),
        ),
    ]
}

#[test]
fn test_ttl_extended_on_writes() {
    let setup = create_test_data();
    let e = &setup.env;
    let token_id = mint(&setup, &setup.grogu, "1");

    for key in member_keys(&setup, token_id, &setup.grogu) {
        assert_eq!(ttl(&setup, &key), TTL_EXTEND_TO);
    }
    assert_eq!(instance_ttl(&setup), TTL_EXTEND_TO);

    // below the threshold, any write to the member extends all its entries
    let elapsed = TTL_EXTEND_TO - TTL_THRESHOLD + 1;
    e.ledger().with_mut(|li| li.sequence_number += elapsed);
    for key in member_keys(&setup, token_id, &setup.grogu) {
        assert_eq!(ttl(&setup, &key), TTL_THRESHOLD - 1);
    }

    setup.contract.set_bio(&setup.grogu, &token_id, &bio(e));
    for key in member_keys(&setup, token_id, &setup.grogu) {
        assert_eq!(ttl(&setup, &key), TTL_EXTEND_TO);
    }
    assert_eq!(instance_ttl(&setup), TTL_EXTEND_TO);

    setup
        .contract
        .propose_recovery(&token_id, &Address::generate(e));
    assert_eq!(ttl(&setup, &MemberKey::Recovery(token_id)), TTL_EXTEND_TO);
}
