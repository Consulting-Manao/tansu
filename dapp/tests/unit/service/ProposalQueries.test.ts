import { Address, nativeToScVal } from "@stellar/stellar-sdk";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { Client } from "../../../packages/tansu";

const pages = vi.hoisted(() => ({ sizes: [] as number[] }));

vi.mock("../../../src/contracts/soroban_tansu", () => ({
  tansuReads: {
    get_dao: async ({ page }: { page: number }) => ({
      result: { proposals: Array(pages.sizes[page] ?? 0).fill({}) },
    }),
  },
}));

import { proposalCountQuery } from "../../../src/service/ProposalService";

describe("proposalCountQuery", () => {
  it.each([
    [[], 0],
    [[3], 3],
    [[9, 9, 3], 21],
    [[9, 9, 9, 9], 36],
  ])("counts the proposals of pages %j as %i", async (sizes, count) => {
    pages.sizes = sizes;
    await expect(
      new QueryClient().query(proposalCountQuery("demo")),
    ).resolves.toBe(count);
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
