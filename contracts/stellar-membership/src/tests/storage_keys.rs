//! Storage keys are read directly by off-chain clients, pin their encoding.

use soroban_sdk::xdr::{Limits, ScVal, WriteXdr};
use soroban_sdk::{Address, Env, IntoVal, String, TryFromVal, Val};

use crate::types::{MemberKey, Provider};

fn encode(e: &Env, key: MemberKey) -> std::string::String {
    let val: Val = key.into_val(e);
    ScVal::try_from_val(e, &val)
        .unwrap()
        .to_xdr_base64(Limits::none())
        .unwrap()
}

#[test]
fn test_storage_keys_encoding() {
    let e = Env::default();
    let account = Address::from_str(
        &e,
        "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
    );

    assert_eq!(
        encode(&e, MemberKey::Member(7)),
        "AAAAEAAAAAEAAAACAAAADwAAAAZNZW1iZXIAAAAAAAMAAAAH"
    );
    assert_eq!(
        encode(&e, MemberKey::Owner(7)),
        "AAAAEAAAAAEAAAACAAAADwAAAAVPd25lcgAAAAAAAAMAAAAH"
    );
    assert_eq!(
        encode(&e, MemberKey::Recovery(7)),
        "AAAAEAAAAAEAAAACAAAADwAAAAhSZWNvdmVyeQAAAAMAAAAH"
    );
    assert_eq!(
        encode(&e, MemberKey::TokenOf(account)),
        "AAAAEAAAAAEAAAACAAAADwAAAAdUb2tlbk9mAAAAABIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    );
    assert_eq!(
        encode(
            &e,
            MemberKey::Account(Provider::Github, String::from_str(&e, "42"))
        ),
        "AAAAEAAAAAEAAAADAAAADwAAAAdBY2NvdW50AAAAAAMAAAABAAAADgAAAAI0MgAA"
    );
}
