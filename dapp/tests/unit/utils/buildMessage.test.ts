import { describe, it, expect } from "vitest";
import { buildMessage } from "../../../src/components/page/dashboard/GitVerification";

/**
 * Regression test for byte-level alignment between the TypeScript frontend and
 * the Rust contract.  If buildMessage() ever changes its encoding or
 * concatenation order, this test will fail and CI will catch it.
 *
 * The fixture must match the Rust test `dump_msg_hex_for_cross_check_account_addr`
 * in `contracts/tansu/src/tests/test_membership.rs`.  Run that test with
 * `--nocapture` to regenerate the expected hex.
 *
 * Fixture:
 *   address   = GAQVF6GRTN4R2JCFGJBOCXZOVNWLPT72PNVF5UYAS6LA4BUYQHNRET46
 *               (G... account address for the seed=0x42 Ed25519 keypair)
 *   pubkey    = 32 bytes from seed=0x42 keypair
 *   identity  = "github:testuser"
 */
describe("buildMessage byte alignment with Rust contract", () => {
  it("produces the exact hex output for a known G... address fixture", () => {
    const address = "GAQVF6GRTN4R2JCFGJBOCXZOVNWLPT72PNVF5UYAS6LA4BUYQHNRET46";
    const pubkey = new Uint8Array([
      0x21, 0x52, 0xf8, 0xd1, 0x9b, 0x79, 0x1d, 0x24, 0x45, 0x32, 0x42, 0xe1,
      0x5f, 0x2e, 0xab, 0x6c, 0xb7, 0xcf, 0xfa, 0x7b, 0x6a, 0x5e, 0xd3, 0x00,
      0x97, 0x96, 0x0e, 0x06, 0x98, 0x81, 0xdb, 0x12,
    ]);
    const identity = "github:testuser";

    const msg = buildMessage(address, pubkey, identity);
    const hex = Buffer.from(msg).toString("hex");

    // This hex is the exact output of dump_msg_hex_for_cross_check_account_addr
    // on the Rust side.  Breaking it down:
    //   prefix   "Stellar Signed Message:\n"                     24 bytes
    //   address  "GAQVF6GRTN4R2JCFGJBOCXZOVNWLPT72PNVF5UYAS6LA4BUYQHNRET46"  56 bytes
    //   pubkey   2152f8d19b791d24453242e15f2eab6cb7cffa7b6a5ed30097960e069881db12  32 bytes
    //   identity "github:testuser"                                15 bytes
    //   total                                                                   127 bytes
    expect(hex).toBe(
      "5374656c6c6172205369676e6564204d6573736167653a0a" +
        "4741515646364752544e3452324a4346474a424f43585a4f564e574c50543732" +
        "504e56463555594153364c413442555951484e5245543436" +
        "2152f8d19b791d24453242e15f2eab6cb7cffa7b6a5ed30097960e069881db12" +
        "6769746875623a7465737475736572",
    );
    expect(msg.length).toBe(127);
  });

  it("produces the exact hex output for a known C... address fixture", () => {
    const address = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAARQG5";
    const pubkey = new Uint8Array([
      0x21, 0x52, 0xf8, 0xd1, 0x9b, 0x79, 0x1d, 0x24, 0x45, 0x32, 0x42, 0xe1,
      0x5f, 0x2e, 0xab, 0x6c, 0xb7, 0xcf, 0xfa, 0x7b, 0x6a, 0x5e, 0xd3, 0x00,
      0x97, 0x96, 0x0e, 0x06, 0x98, 0x81, 0xdb, 0x12,
    ]);
    const identity = "github:testuser";

    const msg = buildMessage(address, pubkey, identity);
    const hex = Buffer.from(msg).toString("hex");

    // This hex is the exact output of dump_msg_hex_for_cross_check_contract_addr
    // on the Rust side.  Only the address segment differs from the G... fixture.
    expect(hex).toBe(
      "5374656c6c6172205369676e6564204d6573736167653a0a" +
        "4341414141414141414141414141414141414141414141414141414141414141" +
        "414141414141414141414141414141414141414152514735" +
        "2152f8d19b791d24453242e15f2eab6cb7cffa7b6a5ed30097960e069881db12" +
        "6769746875623a7465737475736572",
    );
    expect(msg.length).toBe(127);
  });
});
