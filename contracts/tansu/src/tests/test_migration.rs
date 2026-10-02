use crate::tests::test_utils::{create_test_data, init_contract};
use crate::types;
use soroban_sdk::xdr::{Limits, ReadXdr, ScVal};
use soroban_sdk::{Address, Env, Map, String, Symbol, TryIntoVal, Val, vec};

// Values read on 2026-10-02 from the contract CDXINK2T…IY5BI running on
// mainnet, as base64 XDR: its eight members, the proposals of `tansu` (an
// executed one) and `kmpstellarsdk` (an open one, holding 110 XLM), and the
// anonymous voting configuration of `kmpstellarsdk`.
const MEMBERS: [(&str, &str); 8] = [
    (
        "GACUINFBVUYG5K4LF4OLENO2GECBYUFDOO6GKUPZHH2D3YMF3EECHRNA",
        "AAAAEQAAAAEAAAACAAAADwAAAARtZXRhAAAADgAAADtiYWZ5YmVpYmlzZ2h3empzYXdndnhsZWtjbGxqeG80aWhxYWticHd3cmg3NnRoZWl5aXVpMnR6cWlqeQAAAAAPAAAACHByb2plY3RzAAAAEAAAAAEAAAAA",
    ),
    (
        "GD4FXNCYPQWNDWZYZZD4WFYYFTP466IKAKCZOYE5TPFTSSOZDA4QF3ER",
        "AAAAEQAAAAEAAAACAAAADwAAAARtZXRhAAAADgAAADtiYWZ5YmVpYm4yNXdtdGVzaXV4dHg0Z3FpNzZxYm02NmtobGdibXdoaTJwbXhyaDR2N3d3NnNraWo1YQAAAAAPAAAACHByb2plY3RzAAAAEAAAAAEAAAABAAAAEQAAAAEAAAACAAAADwAAAAZiYWRnZXMAAAAAABAAAAABAAAAAQAAAAMAmJaAAAAADwAAAAdwcm9qZWN0AAAAAA0AAAAgN66DwG/eEENyR0MzWsLzkZMHiS7mMHzOjAxj6qVJ4VY=",
    ),
    (
        "GBU764PFZXKZUORAUK3IG36Y6OXSLYM6ZERLJA2BZ2Y2GSKNKWL4KKC5",
        "AAAAEQAAAAEAAAACAAAADwAAAARtZXRhAAAADgAAADtiYWZ5YmVpYW5ycW9zaTVmcnlueDV1ZWZva3FwYjVod2Z6NjNrd2p6cTY0a2xxbW1qbDdpZWdwanJucQAAAAAPAAAACHByb2plY3RzAAAAEAAAAAEAAAAA",
    ),
    (
        "GBH5Y77GMEOCYQOXGAMJY4C65RAMBXKZBDHA5XBNLJQUC3Z2HGQP5OC5",
        "AAAAEQAAAAEAAAACAAAADwAAAARtZXRhAAAADgAAADtiYWZ5YmVpZDRhaXk2N3dkbzNmNWc2aTZxYzI2anBmcDdramN0cnppM294MmZla3BjenNvcXQ1NDJ1aQAAAAAPAAAACHByb2plY3RzAAAAEAAAAAEAAAAEAAAAEQAAAAEAAAACAAAADwAAAAZiYWRnZXMAAAAAABAAAAABAAAAAQAAAAMAmJaAAAAADwAAAAdwcm9qZWN0AAAAAA0AAAAgsjA4sIUdM3RqgndqqH8q2pvwh5Pa0oxgx3WMPLG+ouAAAAARAAAAAQAAAAIAAAAPAAAABmJhZGdlcwAAAAAAEAAAAAEAAAABAAAAAwCYloAAAAAPAAAAB3Byb2plY3QAAAAADQAAACAWa6p0fOOlr9N9CypY5XyNmBuWvDED/AJEj3TvNhOBTQAAABEAAAABAAAAAgAAAA8AAAAGYmFkZ2VzAAAAAAAQAAAAAQAAAAEAAAADAJiWgAAAAA8AAAAHcHJvamVjdAAAAAANAAAAIHFBe1GJS6OlXQ12ERg0OkbCQKVVVgmN8Db2ORhwiX10AAAAEQAAAAEAAAACAAAADwAAAAZiYWRnZXMAAAAAABAAAAABAAAAAQAAAAMAmJaAAAAADwAAAAdwcm9qZWN0AAAAAA0AAAAgyeIdz5m/vTVzHE/cF3/C5KHKqucLt6y3yqBxOfHDQL8=",
    ),
    (
        "GAIV74GIYWW33RQL3RSTGCSMQXPRELVJDMTI33RKXEFZQVZLPZ6WAPFN",
        "AAAAEQAAAAEAAAACAAAADwAAAARtZXRhAAAADgAAADtiYWZ5YmVpZjd0NHd4ZnN3YXcybXp2ZTdnM29kb3F5eHVnN2R1ZXFjdnhqeHN4bmU1anFreHhudHRoaQAAAAAPAAAACHByb2plY3RzAAAAEAAAAAEAAAAA",
    ),
    (
        "GDVJMSZXF4JFNTIDOK4QILBOZ4CDYBXOMF7DVRGGNKBSVND365HAFFIP",
        "AAAAEQAAAAEAAAACAAAADwAAAARtZXRhAAAADgAAADtiYWZ5YmVpYnQ3cXZkN2VsdW5xdGFuMnc3cHVxc21pdnN6ZmlveHkzeGt3cTdjdmJqbGhvZGczN3k2cQAAAAAPAAAACHByb2plY3RzAAAAEAAAAAEAAAAA",
    ),
    (
        "GCAETBNBFKVGLYFXKCLMKT6ZVHFXHRSDFSEW7ODIUJYC6R7H2QJ6OKGU",
        "AAAAEQAAAAEAAAACAAAADwAAAARtZXRhAAAADgAAADtiYWZ5YmVpZGdhZnJqYm1icWwyeGJoeHRzMjZjcnI0bWhsdDM3cmRuZHdqYzUyeGJocG81cjZ1dXFsaQAAAAAPAAAACHByb2plY3RzAAAAEAAAAAEAAAAA",
    ),
    (
        "GDMTVHLWJTHSUDMZVVMXXH6VJHA2ZV3HNG5LYNAZ6RTWB7GISM6PGTUV",
        "AAAAEQAAAAEAAAACAAAADwAAAARtZXRhAAAADgAAADtiYWZ5YmVpaGRreHE3bzY2a2xseW9rbHBtN3h3bzZ4NTRuenp0c292bmo1NjQ2Z2Z5Zm1namp1YTJsaQAAAAAPAAAACHByb2plY3RzAAAAEAAAAAEAAAAA",
    ),
];
const DAO_TANSU: &str = "AAAAEQAAAAEAAAABAAAADwAAAAlwcm9wb3NhbHMAAAAAAAAQAAAAAQAAAAEAAAARAAAAAQAAAAcAAAAPAAAAAmlkAAAAAAADAAAAAAAAAA8AAAAEaXBmcwAAAA4AAAA7YmFmeWJlaWY0aDZ5ZXRtdWxldmNsbzZicHNkMnVzZ203dDVrb2J1NHg0ZHZ2a2xvNXR0b2Rsb3BtNGkAAAAADwAAABFvdXRjb21lc19jb250cmFjdAAAAAAAAAEAAAAPAAAACHByb3Bvc2VyAAAAEgAAAAAAAAAA+Fu0WHws0ds4zkfLFxgs3895CgKFl2Cdm8s5SdkYOQIAAAAPAAAABnN0YXR1cwAAAAAAEAAAAAEAAAABAAAADwAAAAlDYW5jZWxsZWQAAAAAAAAPAAAABXRpdGxlAAAAAAAADgAAABhMZXNzIHNvZnR3YXJlIGZvY3VzZWQgVUkAAAAPAAAACXZvdGVfZGF0YQAAAAAAABEAAAABAAAAAwAAAA8AAAANcHVibGljX3ZvdGluZwAAAAAAAAAAAAAAAAAADwAAAAV2b3RlcwAAAAAAABAAAAABAAAAAQAAABAAAAABAAAAAgAAAA8AAAANQW5vbnltb3VzVm90ZQAAAAAAABEAAAABAAAABQAAAA8AAAAHYWRkcmVzcwAAAAASAAAAAAAAAAD4W7RYfCzR2zjOR8sXGCzfz3kKAoWXYJ2byzlJ2Rg5AgAAAA8AAAALY29tbWl0bWVudHMAAAAAEAAAAAEAAAADAAAADQAAAGBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAANAAAAYEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA0AAABgB5rvbtyeUvIlReugTR1Ie+6k9Y3a5hkT6WzE8EjBTYZrgNNaI65DJEORl3cBoGh9D4Of1B56QmVaaSNWWVyUCTR1ZDQKEBL/L62rsL60JgYbgME67bmpFvr3o5BxuGoKAAAADwAAAA9lbmNyeXB0ZWRfc2VlZHMAAAAAEAAAAAEAAAADAAAADgAAAAEwAAAAAAAADgAAAAEwAAAAAAAADgAAAAEwAAAAAAAADwAAAA9lbmNyeXB0ZWRfdm90ZXMAAAAAEAAAAAEAAAADAAAADgAAAAEwAAAAAAAADgAAAAEwAAAAAAAADgAAAAExAAAAAAAADwAAAAZ3ZWlnaHQAAAAAAAMAB6EgAAAADwAAAA52b3RpbmdfZW5kc19hdAAAAAAABQAAAABpA+3w";
const DAO_KMPSTELLARSDK: &str = "AAAAEQAAAAEAAAABAAAADwAAAAlwcm9wb3NhbHMAAAAAAAAQAAAAAQAAAAEAAAARAAAAAQAAAAcAAAAPAAAAAmlkAAAAAAADAAAAAAAAAA8AAAAEaXBmcwAAAA4AAAA7YmFmeWJlaWF6NmdhaXI1cjdhbnBsbmJjbXVueDRpNWplaXd5c2duNXQ3ZGJxM3JobXBkbHhhamF4dnEAAAAADwAAABFvdXRjb21lc19jb250cmFjdAAAAAAAAAEAAAAPAAAACHByb3Bvc2VyAAAAEgAAAAAAAAAAT9x/5mEcLEHXMBiccF7sQMDdWQjODtwtWmFBbzo5oP4AAAAPAAAABnN0YXR1cwAAAAAAEAAAAAEAAAABAAAADwAAAAZBY3RpdmUAAAAAAA8AAAAFdGl0bGUAAAAAAAAOAAAAFkltcGxlbWVudCBTRVBzIHN1cHBvcnQAAAAAAA8AAAAJdm90ZV9kYXRhAAAAAAAAEQAAAAEAAAADAAAADwAAAA1wdWJsaWNfdm90aW5nAAAAAAAAAAAAAAAAAAAPAAAABXZvdGVzAAAAAAAAEAAAAAEAAAABAAAAEAAAAAEAAAACAAAADwAAAA1Bbm9ueW1vdXNWb3RlAAAAAAAAEQAAAAEAAAAFAAAADwAAAAdhZGRyZXNzAAAAABIAAAAAAAAAAE/cf+ZhHCxB1zAYnHBe7EDA3VkIzg7cLVphQW86OaD+AAAADwAAAAtjb21taXRtZW50cwAAAAAQAAAAAQAAAAMAAAANAAAAYEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA0AAABgQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADQAAAGAHmu9u3J5S8iVF66BNHUh77qT1jdrmGRPpbMTwSMFNhmuA01ojrkMkQ5GXdwGgaH0Pg5/UHnpCZVppI1ZZXJQJNHVkNAoQEv8vrauwvrQmBhuAwTrtuakW+vejkHG4agoAAAAPAAAAD2VuY3J5cHRlZF9zZWVkcwAAAAAQAAAAAQAAAAMAAAAOAAAAATAAAAAAAAAOAAAAATAAAAAAAAAOAAAAATAAAAAAAAAPAAAAD2VuY3J5cHRlZF92b3RlcwAAAAAQAAAAAQAAAAMAAAAOAAAAATAAAAAAAAAOAAAAATAAAAAAAAAOAAAAATEAAAAAAAAPAAAABndlaWdodAAAAAAAAwAHoSAAAAAPAAAADnZvdGluZ19lbmRzX2F0AAAAAAAFAAAAAGkzY/A=";
const CONFIG_KMPSTELLARSDK: &str = "AAAAEQAAAAEAAAADAAAADwAAAApwdWJsaWNfa2V5AAAAAAAOAAABiE1JSUJJakFOQmdrcWhraUc5dzBCQVFFRkFBT0NBUThBTUlJQkNnS0NBUUVBeEZVOWF5cFFoQlhxd1BPR1pHRFMyQlNrdnlKTWF3OXo1OUhSQ3VGeW4zMFhiWnlQeUNEZmE3dk82WE43NDk3VnZYU1NLeVZHRTZTdW9PdFl0eit6NEFuNU56QSsrSi9tdGdkNnRKRi9tWStPUXdadlNmR2hNSTJzLzNOekpPYzFYMUtTUzRsMExSMXZ5d1hzVVdEOFNPSkFmR2tDYzNmaW5TNjgzRi9iajVsT1JpY085YWZwcmIvRndOZ2JUdGV5T09JR1JmMHMvMllGbFBybndTdTJhZTJxZ3ppa0crTGRaTlNXVk9UVyszc2wzdndIcm83Z2hCb2VZUS90RE9mWEp1dVg4UC9hbmNXaXRKS0IrcHhzMWVoZEluNVI5aU1IMzk2MjRtRTNXZEpTbTU2bDRubEdwRGdRbzI3eGhldDJna0FRdG0yUlcrNSthRGhqa1dNK2hRSURBUUFCAAAADwAAABRzZWVkX2dlbmVyYXRvcl9wb2ludAAAAA0AAABgD9a6xQfQ2WWnujoDc0jvOY9If9dwvSowOboMe9JZ81J3hM4kwPPy6jXmrMSTEPABAfXhsJ0HP4S7VstFnZyQKODwpj8XC7qH2vsS1YS7Bq+LhAaa98gKOGq7H8TVkIaAAAAADwAAABR2b3RlX2dlbmVyYXRvcl9wb2ludAAAAA0AAABgB5rvbtyeUvIlReugTR1Ie+6k9Y3a5hkT6WzE8EjBTYZrgNNaI65DJEORl3cBoGh9D4Of1B56QmVaaSNWWVyUCTR1ZDQKEBL/L62rsL60JgYbgME67bmpFvr3o5BxuGoK";

const XLM: i128 = 10_000_000;

mod collateral {
    use soroban_sdk::{Address, Env, contract, contractimpl};

    /// Token recording balances without checking them: the accounts of the
    /// mainnet data are real G accounts, which a test asset cannot pay.
    #[contract]
    pub struct Mock;
    #[contractimpl]
    impl Mock {
        pub fn mint(e: Env, to: Address, amount: i128) {
            let balance = Self::balance(e.clone(), to.clone()) + amount;
            e.storage().persistent().set(&to, &balance);
        }

        pub fn transfer(e: Env, from: Address, to: Address, amount: i128) {
            let from_balance = Self::balance(e.clone(), from.clone()) - amount;
            e.storage().persistent().set(&from, &from_balance);
            let to_balance = Self::balance(e.clone(), to.clone()) + amount;
            e.storage().persistent().set(&to, &to_balance);
        }

        pub fn balance(e: Env, address: Address) -> i128 {
            e.storage().persistent().get(&address).unwrap_or(0)
        }
    }
}

fn from_mainnet(env: &Env, xdr: &str) -> Val {
    ScVal::from_xdr_base64(xdr, Limits::none())
        .unwrap()
        .try_into_val(env)
        .unwrap()
}

#[test]
fn test_migrate_mainnet_data() {
    let setup = create_test_data();
    let env = &setup.env;
    let tansu_key = init_contract(&setup);
    let kmp_key = setup.contract.register(
        &setup.grogu,
        &String::from_str(env, "kmpstellarsdk"),
        &vec![env, setup.grogu.clone()],
        &String::from_str(env, "github.com/Soneso/kmp-stellar-sdk"),
        &String::from_str(env, "2ef4f49fdd8fa9dc463f1f06a094c26b88710990"),
        &None,
        &None,
        &None,
    );
    let collateral_id = env.register(collateral::Mock, ());
    let collateral = collateral::MockClient::new(env, &collateral_id);
    collateral.mint(&setup.contract_id, &(110 * XLM));

    // The contract is paused while mainnet is migrated
    setup.contract.pause(&setup.contract_admin, &true);
    assert!(
        setup
            .contract
            .try_add_member(
                &setup.grogu,
                &String::from_str(env, "meta"),
                &None,
                &None,
                &None
            )
            .is_err()
    );

    // The layout of mainnet before v3
    env.as_contract(&setup.contract_id, || {
        let instance = env.storage().instance();
        let storage = env.storage().persistent();

        instance.remove(&types::ContractKey::Collateral);
        let collateral_v0 = Map::<Symbol, Val>::from_array(
            env,
            [
                (Symbol::new(env, "address"), collateral_id.to_val()),
                (Symbol::new(env, "wasm_hash"), Val::VOID.to_val()),
            ],
        );
        instance.set(
            &vec![env, Symbol::new(env, "CollateralContract").to_val()],
            &collateral_v0,
        );
        instance.set(
            &types::ProjectKey::AnonymousVoteConfig(kmp_key.clone()),
            &from_mainnet(env, CONFIG_KMPSTELLARSDK),
        );
        for (address, member) in MEMBERS {
            storage.set(
                &types::DataKey::Member(Address::from_str(env, address)),
                &from_mainnet(env, member),
            );
        }
        for (key, dao) in [(&tansu_key, DAO_TANSU), (&kmp_key, DAO_KMPSTELLARSDK)] {
            storage.set(&types::ProjectKey::DaoTotalProposals(key.clone()), &1u32);
            storage.set(
                &types::ProjectKey::Dao(key.clone(), 0),
                &from_mainnet(env, dao),
            );
        }
    });

    // Members stored before the Git fields existed read as they are, with
    // neither field set: they need no migration
    let proposer = Address::from_str(env, MEMBERS[3].0);
    for (address, _) in MEMBERS {
        let member = setup.contract.get_member(&Address::from_str(env, address));
        assert_eq!(member.git_identity, None);
        assert_eq!(member.git_pubkey, None);
    }
    assert_eq!(setup.contract.get_member(&proposer).projects.len(), 4);

    // The proposals do not: a page is a list of ids, one entry holds each
    assert!(setup.contract.try_get_proposal(&kmp_key, &0).is_err());
    assert!(setup.contract.try_get_dao(&kmp_key, &0).is_err());

    let project_keys = vec![env, tansu_key.clone(), kmp_key.clone()];
    assert!(
        setup
            .contract
            .try_migrate(&setup.mando, &project_keys)
            .is_err()
    );
    setup.contract.migrate(&setup.contract_admin, &project_keys);
    assert!(
        setup
            .contract
            .try_migrate(&setup.contract_admin, &project_keys)
            .is_err()
    );

    // The open proposal is cancelled and its 110 XLM go back to its proposer
    assert_eq!(collateral.balance(&proposer), 110 * XLM);
    assert_eq!(collateral.balance(&setup.contract_id), 0);

    let open = setup.contract.get_proposal(&kmp_key, &0);
    assert_eq!(open.title, String::from_str(env, "Implement SEPs support"));
    assert_eq!(open.proposer, proposer);
    assert_eq!(open.status, types::ProposalStatus::Cancelled);
    assert_eq!(open.vote_data.votes.len(), 1);
    assert_eq!(open.outcome_contracts, None);

    let executed = setup.contract.get_proposal(&tansu_key, &0);
    assert_eq!(
        executed.title,
        String::from_str(env, "Less software focused UI")
    );
    assert_eq!(executed.status, types::ProposalStatus::Cancelled);
    assert_eq!(executed.vote_data.votes.len(), 1);

    setup.contract.get_anonymous_voting_config(&kmp_key);
    assert_eq!(setup.contract.get_dao(&kmp_key, &0).proposals.len(), 1);

    // The collateral is the address again: registering charges it
    setup.contract.pause(&setup.contract_admin, &false);
    setup.contract.register(
        &setup.grogu,
        &String::from_str(env, "afterwards"),
        &vec![env, setup.grogu.clone()],
        &String::from_str(env, "github.com/tansu/afterwards"),
        &String::from_str(env, "2ef4f49fdd8fa9dc463f1f06a094c26b88710990"),
        &None,
        &None,
        &None,
    );
    assert_eq!(collateral.balance(&setup.contract_id), 5 * XLM);
}
