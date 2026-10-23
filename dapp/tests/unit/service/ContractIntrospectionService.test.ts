import * as StellarSdk from "@stellar/stellar-sdk";
import { Buffer } from "buffer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rpcServer } from "../../../src/contracts/soroban_tansu";
import {
  OutcomeCallError,
  prepareOutcomeCall,
  simulateOutcomeCall,
} from "../../../src/service/ContractIntrospectionService";
import { queryClient } from "../../../src/service/queryClient";

const { Address, xdr } = StellarSdk;

const TANSU = import.meta.env.PUBLIC_TANSU_CONTRACT_ID;
const OWNER = import.meta.env.PUBLIC_TANSU_OWNER_ID;
const EXECUTOR = "CAQIILBK4IKVY4DFMB4UTYMYVZ7Z5HTLNIWAUNSGXISXIUF2QYKH2FJR";
const TARGET = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM";
const HOLDER = StellarSdk.Keypair.random().publicKey();
const MANAGER = StellarSdk.StrKey.encodeContract(Buffer.alloc(32, 7));

/** The target: `transfer(to: address, amount: i128) -> i128`, and its errors. */
const spec = new StellarSdk.contract.Spec([
  xdr.ScSpecEntry.scSpecEntryFunctionV0(
    new xdr.ScSpecFunctionV0({
      doc: "",
      name: "transfer",
      inputs: [
        new xdr.ScSpecFunctionInputV0({
          doc: "",
          name: "to",
          type: xdr.ScSpecTypeDef.scSpecTypeAddress(),
        }),
        new xdr.ScSpecFunctionInputV0({
          doc: "",
          name: "amount",
          type: xdr.ScSpecTypeDef.scSpecTypeI128(),
        }),
      ],
      outputs: [xdr.ScSpecTypeDef.scSpecTypeI128()],
    }),
  ),
  xdr.ScSpecEntry.scSpecEntryUdtErrorEnumV0(
    new xdr.ScSpecUdtErrorEnumV0({
      doc: "",
      lib: "",
      name: "Error",
      cases: [
        new xdr.ScSpecUdtErrorEnumCaseV0({
          doc: "Not enough balance",
          name: "InsufficientBalance",
          value: 10,
        }),
      ],
    }),
  ),
]);

const call = { address: TARGET, execute_fn: "transfer", args: [HOLDER, "5"] };

/** Tansu's instance entry, holding the executor under `ContractKey::Executor`. */
function tansuInstance(executor?: string) {
  const storage = executor
    ? [
        new xdr.ScMapEntry({
          key: xdr.ScVal.scvVec([xdr.ScVal.scvSymbol("Collateral")]),
          val: new Address(TARGET).toScVal(),
        }),
        new xdr.ScMapEntry({
          key: xdr.ScVal.scvVec([xdr.ScVal.scvSymbol("Executor")]),
          val: new Address(executor).toScVal(),
        }),
      ]
    : null;
  return {
    val: xdr.LedgerEntryData.contractData(
      new xdr.ContractDataEntry({
        ext: xdr.ExtensionPoint.fromXdrObject({ v: 0 } as never),
        contract: new Address(TANSU).toScAddress(),
        key: xdr.ScVal.scvLedgerKeyContractInstance(),
        durability: xdr.ContractDataDurability.persistent,
        val: xdr.ScVal.scvContractInstance(
          new xdr.ScContractInstance({
            executable: xdr.ContractExecutable.contractExecutableStellarAsset(),
            storage,
          }),
        ),
      }),
    ),
  } as unknown as StellarSdk.rpc.Api.LedgerEntryResult;
}

/** An entry asking a signature from `address`; only its credentials are read. */
const authFrom = (address: string) =>
  ({
    credentials: {
      type: "sorobanCredentialsAddress",
      address: { address: new Address(address).toScAddress() },
    },
  }) as unknown as StellarSdk.xdr.SorobanAuthorizationEntry;

const success = (
  auth: StellarSdk.xdr.SorobanAuthorizationEntry[] = [],
  retval: StellarSdk.xdr.ScVal = xdr.ScVal.scvVoid(),
) =>
  ({
    id: "1",
    latestLedger: 1,
    events: [],
    _parsed: true,
    transactionData: new StellarSdk.SorobanDataBuilder(),
    minResourceFee: "100",
    result: { auth, retval },
  }) as unknown as StellarSdk.rpc.Api.SimulateTransactionResponse;

let simulate: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  queryClient.clear();
  queryClient.setQueryData(["contractSpec", TARGET], spec);
  vi.spyOn(rpcServer, "getContractData").mockResolvedValue(
    tansuInstance(EXECUTOR),
  );
  vi.spyOn(rpcServer, "getAccount").mockImplementation(
    async (id) => new StellarSdk.Account(id, "1"),
  );
  simulate = vi.spyOn(rpcServer, "simulateTransaction");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("simulateOutcomeCall", () => {
  it("runs the call through the executor, as execute makes it", async () => {
    simulate.mockResolvedValue(success([], xdr.ScVal.scvI32(7)));

    const { prepared, returns, authorizedBy } = await simulateOutcomeCall(call);

    expect(returns).toBe(7);
    expect(authorizedBy).toEqual([]);
    expect(prepared.address).toBe(TARGET);
    expect(prepared.execute_fn).toBe("transfer");
    expect(prepared.args.map((arg) => StellarSdk.scValToNative(arg))).toEqual([
      HOLDER,
      5n,
    ]);

    const [tx, , authMode] = simulate.mock.calls[0]!;
    expect(authMode).toBe("record_allow_nonroot");
    expect((tx as StellarSdk.Transaction).source).toBe(OWNER);
    const op = (tx as StellarSdk.Transaction)
      .operations[0] as StellarSdk.Operation.InvokeHostFunction;
    const invoke = (op.func as any).invokeContract;
    expect(Address.fromScAddress(invoke.contractAddress).toString()).toBe(
      EXECUTOR,
    );
    expect(String(invoke.functionName)).toBe("run");
    expect(
      invoke.args.map((arg: StellarSdk.xdr.ScVal) =>
        StellarSdk.scValToNative(arg),
      ),
    ).toEqual([TARGET, "transfer", [HOLDER, 5n]]);
  });

  it("refuses a call that needs a signature no one gives at execution", async () => {
    simulate.mockResolvedValue(success([authFrom(HOLDER), authFrom(HOLDER)]));

    await expect(simulateOutcomeCall(call)).rejects.toThrow(
      `transfer on ${TARGET} needs a signature from ${HOLDER}, and no one signs when the proposal executes`,
    );
  });

  it("reports a contract that must authorize the call, as a manager does", async () => {
    simulate.mockResolvedValue(success([authFrom(MANAGER)]));

    await expect(simulateOutcomeCall(call)).resolves.toMatchObject({
      authorizedBy: [MANAGER],
    });
  });

  it("refuses an account's signature even beside a contract's", async () => {
    simulate.mockResolvedValue(success([authFrom(MANAGER), authFrom(HOLDER)]));

    await expect(simulateOutcomeCall(call)).rejects.toThrow(
      `needs a signature from ${HOLDER},`,
    );
  });

  it("blames the arguments that name the signer", async () => {
    simulate.mockResolvedValue(success([authFrom(HOLDER)]));

    const error = await simulateOutcomeCall(call).catch((e) => e);
    expect(error).toBeInstanceOf(OutcomeCallError);
    expect(error.args).toEqual([0]);
  });

  it("blames no argument when the target refuses the call", async () => {
    simulate.mockResolvedValue({
      id: "1",
      latestLedger: 1,
      events: [],
      _parsed: true,
      error: "HostError: Error(Contract, #10)",
    } as StellarSdk.rpc.Api.SimulateTransactionErrorResponse);

    const error = await simulateOutcomeCall(call).catch((e) => e);
    expect(error).toBeInstanceOf(OutcomeCallError);
    expect(error.args).toEqual([]);
  });

  it("names the target's error from its spec, not Tansu's", async () => {
    simulate.mockResolvedValue({
      id: "1",
      latestLedger: 1,
      events: [],
      _parsed: true,
      error: "HostError: Error(Contract, #10)",
    } as StellarSdk.rpc.Api.SimulateTransactionErrorResponse);

    await expect(simulateOutcomeCall(call)).rejects.toThrow(
      `transfer on ${TARGET} cannot run: error #10 InsufficientBalance (Not enough balance)`,
    );
  });

  it("gives the code of an error the target does not document", async () => {
    simulate.mockResolvedValue({
      id: "1",
      latestLedger: 1,
      events: [],
      _parsed: true,
      error: "HostError: Error(Contract, #3)",
    } as StellarSdk.rpc.Api.SimulateTransactionErrorResponse);

    await expect(simulateOutcomeCall(call)).rejects.toThrow(
      `transfer on ${TARGET} cannot run: error #3`,
    );
  });

  it("refuses arguments that do not match the function", async () => {
    await expect(
      simulateOutcomeCall({ ...call, args: [HOLDER] }),
    ).rejects.toThrow("transfer takes 2 arguments, not 1");
    await expect(
      simulateOutcomeCall({ ...call, args: [HOLDER, "five"] }),
    ).rejects.toThrow('amount: "five" is not a i128');
    await expect(
      simulateOutcomeCall({ ...call, args: [HOLDER, "five"] }),
    ).rejects.toMatchObject({ args: [1] });
    expect(simulate).not.toHaveBeenCalled();
  });

  it("fails when Tansu has no executor", async () => {
    vi.mocked(rpcServer.getContractData).mockResolvedValue(tansuInstance());

    await expect(simulateOutcomeCall(call)).rejects.toThrow(
      "Tansu has no executor for outcome calls",
    );
    expect(simulate).not.toHaveBeenCalled();
  });
});

describe("prepareOutcomeCall", () => {
  it("returns the encoded call once it runs", async () => {
    simulate.mockResolvedValue(success());

    const prepared = await prepareOutcomeCall(call);

    expect(prepared.execute_fn).toBe("transfer");
    expect(prepared.args).toHaveLength(2);
  });
});
