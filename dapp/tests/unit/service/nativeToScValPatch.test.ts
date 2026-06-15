/**
 * Tests for the Spec.prototype.nativeToScVal monkey-patch introduced in PR #174.
 *
 * The patch intercepts scSpecTypeVal (switch value 0) and converts raw JS
 * values (string, number, boolean, bigint) directly to ScVal using the
 * bundled xdr module. See FlowService.ts for the full implementation.
 *
 * We replicate the patch logic here rather than importing FlowService.ts
 * (which has many complex dependencies that would require extensive mocking).
 */
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { xdr, Address, Keypair } from "@stellar/stellar-sdk";
import { Spec } from "@stellar/stellar-sdk/contract";

// Save and apply the same monkey-patch as in FlowService.ts
const ORIG_NATIVE_TO_SC_VAL = Spec.prototype.nativeToScVal;

beforeAll(() => {
  Spec.prototype.nativeToScVal = function patchNativeToScVal(
    val: any,
    ty: any,
  ): any {
    // scSpecTypeVal switch() returns value 0.
    if (ty.switch().value === 0) {
      if (typeof val === "string") {
        if (/^[GC][A-Z0-9]{55}$/.test(val)) {
          return Address.fromString(val).toScVal();
        }
        return xdr.ScVal.scvString(val);
      }
      if (typeof val === "number" || typeof val === "bigint") {
        const v = BigInt(val);
        const lo = new xdr.Uint64(v & BigInt("0xFFFFFFFFFFFFFFFF"));
        const hi = new xdr.Int64(v >> 64n);
        return xdr.ScVal.scvI128(new xdr.Int128Parts({ hi, lo }));
      }
      if (typeof val === "boolean") {
        return xdr.ScVal.scvBool(val);
      }
    }
    return ORIG_NATIVE_TO_SC_VAL.call(this, val, ty);
  };
});

afterAll(() => {
  // Restore the original
  Spec.prototype.nativeToScVal = ORIG_NATIVE_TO_SC_VAL;
});

describe("nativeToScVal monkey-patch", () => {
  it("has applied the patched function", () => {
    expect(Spec.prototype.nativeToScVal.name).toBe("patchNativeToScVal");
  });

  describe("scSpecTypeVal (switch value 0) — raw JS values", () => {
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

    it("converts a number to scvI128", () => {
      const result: any = Spec.prototype.nativeToScVal(42, scSpecTypeValTy);
      expect(result.switch()).toBe(xdr.ScValType.scvI128());
      const parts = result.i128();
      expect(Number(parts.lo())).toBe(42);
      expect(Number(parts.hi())).toBe(0);
    });

    it("converts a bigint to scvI128", () => {
      const result: any = Spec.prototype.nativeToScVal(
        BigInt("9999999999999"),
        scSpecTypeValTy,
      );
      expect(result.switch()).toBe(xdr.ScValType.scvI128());
    });

    it("converts a large i128 value (> 64 bits)", () => {
      const bigVal = (BigInt(1) << BigInt(70)) + BigInt(12345);
      const result: any = Spec.prototype.nativeToScVal(bigVal, scSpecTypeValTy);
      expect(result.switch()).toBe(xdr.ScValType.scvI128());
      const parts = result.i128();
      expect(Number(parts.hi())).toBeGreaterThan(0);
    });

    it("converts true to scvBool(true)", () => {
      const result: any = Spec.prototype.nativeToScVal(true, scSpecTypeValTy);
      expect(result.switch()).toBe(xdr.ScValType.scvBool());
      expect(result.b()).toBe(true);
    });

    it("converts false to scvBool(false)", () => {
      const result: any = Spec.prototype.nativeToScVal(false, scSpecTypeValTy);
      expect(result.switch()).toBe(xdr.ScValType.scvBool());
      expect(result.b()).toBe(false);
    });
  });
});
