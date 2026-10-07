import { Address, nativeToScVal } from "@stellar/stellar-sdk";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { Client } from "../../../packages/tansu";

const stored = vi.hoisted(() => ({ total: undefined as number | undefined }));

vi.mock("../../../src/contracts/soroban_tansu", () => ({
  tansuReads: {},
  rpcServer: {
    // DaoTotalProposals(project_key), read from its ledger entry
    getLedgerEntries: async () => ({
      entries:
        stored.total === undefined
          ? []
          : [
              {
                val: {
                  type: "contractData",
                  contractData: {
                    val: nativeToScVal(stored.total, { type: "u32" }),
                  },
                },
              },
            ],
    }),
  },
}));

import {
  effectiveGovernance,
  governanceActivation,
  governanceQuery,
  proposalCountQuery,
} from "../../../src/service/ProposalService";

describe("proposalCountQuery", () => {
  it.each([
    [undefined, 0],
    [3, 3],
    [21, 21],
  ])("reads DaoTotalProposals %s as %i", async (total, count) => {
    stored.total = total;
    await expect(
      new QueryClient().query(proposalCountQuery("demo")),
    ).resolves.toBe(count);
  });
});

describe("governance timing", () => {
  const day = 24 * 3600;
  const current = { minVotingPeriod: day, executeDelay: day };

  it("defaults to a day each when the project has no override", async () => {
    stored.total = undefined;
    await expect(
      new QueryClient().query(governanceQuery("demo")),
    ).resolves.toEqual({ timing: current, pending: null });
  });

  it("applies a stricter timing at once and a looser one after notice", () => {
    expect(
      governanceActivation(current, { ...current, executeDelay: 2 * day }, 100),
    ).toBe(100);
    expect(
      governanceActivation(current, { ...current, minVotingPeriod: 3600 }, 100),
    ).toBe(100 + 2 * day);
  });

  it("counts a pending update once its notice has passed", () => {
    const pending = {
      minVotingPeriod: 3600,
      executeDelay: null,
      activatesAt: 500,
    };
    expect(effectiveGovernance(current, pending, 499)).toEqual({
      timing: current,
      pending,
    });
    expect(effectiveGovernance(current, pending, 500)).toEqual({
      timing: { minVotingPeriod: 3600, executeDelay: day },
      pending: null,
    });
  });
});

describe("get_dao", () => {
  // SDK 17 decodes `Vec<Val>` outcome arguments, which older SDKs could not.
  it("decodes outcome contract arguments", () => {
    const { spec } = new Client({
      contractId: import.meta.env.PUBLIC_TANSU_CONTRACT_ID,
      networkPassphrase: import.meta.env.PUBLIC_SOROBAN_NETWORK_PASSPHRASE,
      rpcUrl: "https://rpc.e2e.test",
    });
    const token = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
    const proposal = {
      id: 0,
      ipfs: "bafy",
      outcome_contracts: [
        {
          address: token,
          execute_fn: "transfer",
          args: [
            nativeToScVal(Address.fromString(token)),
            nativeToScVal(10n, { type: "i128" }),
            nativeToScVal("memo"),
          ],
        },
      ],
      proposer: "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7",
      status: { tag: "Active", values: undefined },
      title: "Pay the audit",
      vote_data: {
        public_voting: true,
        token_contract: undefined,
        votes: [],
        voting_ends_at: 5n,
      },
    };
    const retval = spec.nativeToScVal(
      { proposals: [proposal] },
      spec.getFunc("get_dao").outputs[0]!,
    );

    const [decoded] = spec.funcResToNative(
      "get_dao",
      retval.toXDR("base64"),
    ).proposals;
    expect(decoded.outcome_contracts[0].args).toEqual([token, 10n, "memo"]);
    expect(decoded.vote_data.voting_ends_at).toBe(5n);
  });
});
