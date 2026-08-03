/**
 * Monkey-patches for @stellar/stellar-sdk Spec when dealing with scSpecTypeVal.
 *
 * OutcomeContract.args is Vec<Val>. Upstream status:
 * - nativeToScVal Val encode: in SDK >= 16.1.0 (#1485), but without G/C
 *   address-string guessing — we keep a thin encode patch for that.
 * - scValToNative Val decode: merged as #1551, not released yet — keep patch
 *   until an SDK > 16.1.0 ships it.
 *
 * Import this module for its side effects before using the Tansu client.
 */
import { scValToNative, xdr, Address } from "@stellar/stellar-sdk";
import { Spec } from "@stellar/stellar-sdk/contract";

const ORIG_NATIVE_TO_SC_VAL = Spec.prototype.nativeToScVal;
Spec.prototype.nativeToScVal = function patchNativeToScVal(
  val: any,
  ty: any,
): any {
  // scSpecTypeVal: UI passes address args as G…/C… strings; upstream
  // nativeToScVal leaves those as scvString. Prefer scvAddress.
  if (ty.switch().value === 0 && typeof val === "string") {
    if (/^[GC][A-Z0-9]{55}$/.test(val)) {
      return Address.fromString(val).toScVal();
    }
    return xdr.ScVal.scvString(val);
  }
  return ORIG_NATIVE_TO_SC_VAL.call(this, val, ty);
};

const ORIG_SC_VAL_TO_NATIVE = Spec.prototype.scValToNative;
Spec.prototype.scValToNative = function patchScValToNative(
  scv: any,
  typeDef: any,
): any {
  // scSpecTypeVal: unconstrained — decode with the free (untyped) converter.
  if (typeDef.switch().value === 0) {
    return scValToNative(scv);
  }
  return ORIG_SC_VAL_TO_NATIVE.call(this, scv, typeDef);
};
