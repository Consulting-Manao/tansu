/**
 * Tests for Spec encode/decode monkey-patches (stellarSpecPatches.ts).
 *
 * Encode: thin patch for G/C address strings as Val (SDK 16.1+ leaves them
 * as scvString). Decode: full Val short-circuit until SDK ships #1551.
 */
import { describe, expect, it } from "vitest";
import { xdr, Address, Keypair, scValToNative } from "@stellar/stellar-sdk";
import { Spec } from "@stellar/stellar-sdk/contract";

// Apply the production patches (side effects).
import "../../../src/service/stellarSpecPatches";

describe("stellarSpecPatches", () => {
  it("has applied the patched functions", () => {
    expect(Spec.prototype.nativeToScVal.name).toBe("patchNativeToScVal");
    expect(Spec.prototype.scValToNative.name).toBe("patchScValToNative");
  });

  describe("nativeToScVal — scSpecTypeVal encode", () => {
    const scSpecTypeValTy: any = { switch: () => ({ value: 0 }) };

    it("converts a plain string to scvString", () => {
      const result: any = Spec.prototype.nativeToScVal(
        "hello",
        scSpecTypeValTy,
      );
      expect(result.switch()).toBe(xdr.ScValType.scvString());
      expect(result.str()).toBe("hello");
    });

    it("converts a Stellar G… address string to an Address ScVal", () => {
      const address =
        "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
      const result: any = Spec.prototype.nativeToScVal(
        address,
        scSpecTypeValTy,
      );
      expect(result.switch()).toBe(xdr.ScValType.scvAddress());
    });

    it("converts a Stellar C… contract address string to an Address ScVal", () => {
      const validAddress = Keypair.random().publicKey();
      const result: any = Spec.prototype.nativeToScVal(
        validAddress,
        scSpecTypeValTy,
      );
      expect(result.switch()).toBe(xdr.ScValType.scvAddress());
    });

    it("defers number/bool/bigint to SDK nativeToScVal (16.1+ Val support)", () => {
      const n: any = Spec.prototype.nativeToScVal(42, scSpecTypeValTy);
      expect(n.switch().name).toMatch(/scvU64|scvI64|scvU128|scvI128/);

      const b: any = Spec.prototype.nativeToScVal(true, scSpecTypeValTy);
      expect(b.switch()).toBe(xdr.ScValType.scvBool());
      expect(b.b()).toBe(true);
    });
  });

  describe("scValToNative — scSpecTypeVal decode", () => {
    const ty = xdr.ScSpecTypeDef.scSpecTypeVal();

    it("decodes scvString (the failing vote/proposal case)", () => {
      const scv = xdr.ScVal.scvString("registry-tansu-manager");
      const result = Spec.prototype.scValToNative.call({}, scv, ty);
      expect(result).toBe("registry-tansu-manager");
    });

    it("decodes scvString moonlight", () => {
      const scv = xdr.ScVal.scvString("moonlight");
      expect(Spec.prototype.scValToNative.call({}, scv, ty)).toBe("moonlight");
    });

    it("decodes scvAddress", () => {
      const pk = Keypair.random().publicKey();
      const scv = Address.fromString(pk).toScVal();
      expect(Spec.prototype.scValToNative.call({}, scv, ty)).toBe(pk);
    });

    it("decodes scvBool", () => {
      const scv = xdr.ScVal.scvBool(true);
      expect(Spec.prototype.scValToNative.call({}, scv, ty)).toBe(true);
    });

    it("decodes scvI128", () => {
      const scv = xdr.ScVal.scvI128(
        new xdr.Int128Parts({ hi: new xdr.Int64(0), lo: new xdr.Uint64(7) }),
      );
      expect(Spec.prototype.scValToNative.call({}, scv, ty)).toBe(7n);
    });

    it("matches free scValToNative for Val-typed values", () => {
      const scv = xdr.ScVal.scvString("hello");
      expect(Spec.prototype.scValToNative.call({}, scv, ty)).toBe(
        scValToNative(scv),
      );
    });
  });
});
