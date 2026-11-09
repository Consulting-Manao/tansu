import { Keypair, xdr } from "@stellar/stellar-sdk";
import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "../../../packages/tansu";

// The contract's storage as ledger entries: base64 key → value and TTL.
const ledger = vi.hoisted(
  () => new Map<string, { val: unknown; liveUntil: number }>(),
);
const reads = vi.hoisted(() => ({ calls: [] as number[] }));

vi.mock("../../../src/contracts/soroban_tansu", async () => {
  const { Client } = await import("../../../packages/tansu");
  return {
    tansuReads: new Client({
      contractId: import.meta.env.PUBLIC_TANSU_CONTRACT_ID,
      networkPassphrase: "Test SDF Network ; September 2015",
      rpcUrl: "https://rpc.example.test",
    }),
    rpcServer: {
      getLedgerEntries: async (...keys: xdr.LedgerKey[]) => {
        reads.calls.push(keys.length);
        return {
          latestLedger: 100,
          entries: keys.flatMap((key) => {
            const entry = ledger.get(key.toXdr("base64"));
            return entry
              ? [
                  {
                    key,
                    val: {
                      type: "contractData",
                      contractData: { val: entry.val },
                    },
                    liveUntilLedgerSeq: entry.liveUntil,
                  },
                ]
              : [];
          }),
        };
      },
    },
  };
});

import { proposalQuery } from "../../../src/service/ProposalService";
import { deriveProjectKey } from "../../../src/utils/projectKey";
import { Address } from "@stellar/stellar-sdk";

const spec = new Client({
  contractId: import.meta.env.PUBLIC_TANSU_CONTRACT_ID,
  networkPassphrase: "Test SDF Network ; September 2015",
  rpcUrl: "https://rpc.example.test",
}).spec;
const udt = (name: string) =>
  xdr.ScSpecTypeDef.scSpecTypeUdt(new xdr.ScSpecTypeUdt({ name }));

function store(
  variant: string,
  fields: xdr.ScVal[],
  val: xdr.ScVal,
  { temporary = false, liveUntil = 1000 } = {},
) {
  const key = xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: new Address(
        import.meta.env.PUBLIC_TANSU_CONTRACT_ID,
      ).toScAddress(),
      key: xdr.ScVal.scvVec([xdr.ScVal.scvSymbol(variant), ...fields]),
      durability: temporary
        ? xdr.ContractDataDurability.temporary
        : xdr.ContractDataDurability.persistent,
    }),
  );
  ledger.set(key.toXdr("base64"), { val, liveUntil });
}

describe("proposalQuery", () => {
  const project = xdr.ScVal.scvBytes(deriveProjectKey("demo"));
  const alive = Keypair.random().publicKey();
  const expired = Keypair.random().publicKey();

  const proposal = (id: number) =>
    spec.nativeToScVal(
      {
        id,
        title: `Proposal ${id}`,
        proposer: alive,
        ipfs: "bafy",
        vote_data: {
          voting_ends_at: 10n,
          public_voting: true,
          token_contract: undefined,
          votes: [],
        },
        status: { tag: "Active", values: undefined },
        outcome_contracts: undefined,
      },
      udt("Proposal"),
    );
  const ballot = (address: string) =>
    spec.nativeToScVal(
      {
        tag: "PublicVote",
        values: [
          {
            address,
            vote_choice: { tag: "Approve", values: undefined },
            weight: 1,
          },
        ],
      },
      udt("Vote"),
    );

  beforeEach(() => {
    ledger.clear();
    reads.calls = [];
    const id = (n: number) => xdr.ScVal.scvU32(n);
    // 0: two voters, one ballot past its TTL; 1: revoked; 2: no voters yet.
    store("Proposal", [project, id(0)], proposal(0));
    store(
      "Voters",
      [project, id(0)],
      xdr.ScVal.scvVec([alive, expired].map((a) => new Address(a).toScVal())),
    );
    for (const [address, liveUntil] of [
      [alive, 1000],
      [expired, 99],
    ] as const) {
      store(
        "Vote",
        [project, id(0), new Address(address).toScVal()],
        ballot(address),
        { temporary: true, liveUntil },
      );
    }
    store("Proposal", [project, id(2)], proposal(2));
  });

  it("reads a page of proposals in two ledger calls", async () => {
    const client = new QueryClient();
    const [first, revoked, fresh] = await Promise.all(
      [0, 1, 2].map((id) => client.query(proposalQuery("demo", id))),
    );

    expect(first?.title).toBe("Proposal 0");
    // As get_proposal: only the ballots that still live.
    expect(
      first?.vote_data.votes.map((vote) => vote.values[0].address),
    ).toEqual([alive]);
    expect(revoked).toBeNull();
    expect(fresh?.vote_data.votes).toEqual([]);
    // Proposals and voters together, then the ballots.
    expect(reads.calls).toEqual([6, 2]);
  });
});
