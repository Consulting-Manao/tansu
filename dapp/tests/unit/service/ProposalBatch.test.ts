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

import {
  proposalQuery,
  proposalSummaryQuery,
  vetoQuery,
} from "../../../src/service/ProposalService";
import {
  modifyProposalFromContract,
  modifyProposalToView,
} from "../../../src/utils/utils";
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

  it("lists a page of proposals and their voters in one ledger call", async () => {
    const client = new QueryClient();
    const [first, revoked, fresh] = await Promise.all(
      [0, 1, 2].map((id) => client.query(proposalSummaryQuery("demo", id))),
    );

    expect(first?.proposal.title).toBe("Proposal 0");
    // Who voted, from the voters entry: no ballot is read.
    expect(first?.voters).toEqual([alive, expired]);
    expect(first?.proposal.vote_data.votes).toEqual([]);
    expect(revoked).toBeNull();
    expect(fresh?.voters).toEqual([]);
    expect(reads.calls).toEqual([6]);
  });

  it("does not read again an executed proposal", async () => {
    const client = new QueryClient();
    const settled = (id: number, tag: string) =>
      store(
        "Proposal",
        [project, xdr.ScVal.scvU32(id)],
        spec.nativeToScVal(
          {
            ...spec.scValToNative(proposal(id), udt("Proposal")),
            status: { tag, values: undefined },
          },
          udt("Proposal"),
        ),
      );
    settled(3, "Approved");
    const read = () =>
      Promise.all(
        [0, 1, 3].map((id) => client.query(proposalSummaryQuery("demo", id))),
      );
    await read();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 2 * 60_000);
    reads.calls = [];
    await read();
    // The active one and the absent one are read again; the executed one
    // never.
    expect(reads.calls).toEqual([4]);
    vi.useRealTimers();
  });

  it("reads a veto from the ledger, and never reads a vetoed proposal again", async () => {
    const client = new QueryClient();
    const id = xdr.ScVal.scvU32(4);
    store(
      "Proposal",
      [project, id],
      spec.nativeToScVal(
        {
          ...spec.scValToNative(proposal(4), udt("Proposal")),
          status: { tag: "Vetoed", values: undefined },
        },
        udt("Proposal"),
      ),
    );
    store(
      "Veto",
      [project, id],
      spec.nativeToScVal(
        { maintainer: alive, reason: "bafyreason", vetoed_at: 5n },
        udt("Veto"),
      ),
    );

    const summary = await client.query(proposalSummaryQuery("demo", 4));
    expect(summary?.proposal.status.tag).toBe("Vetoed");
    // The page maps it to its own status, final like an executed one.
    const view = modifyProposalToView(
      modifyProposalFromContract(summary!.proposal),
      "demo",
    );
    expect(view.status).toBe("vetoed");
    expect(await client.query(vetoQuery("demo", 4))).toEqual({
      maintainer: alive,
      reason: "bafyreason",
      vetoed_at: 5n,
    });
    // A proposal nobody vetoed has none.
    expect(await client.query(vetoQuery("demo", 0))).toBeNull();

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 2 * 60_000);
    reads.calls = [];
    await client.query(proposalSummaryQuery("demo", 4));
    await client.query(vetoQuery("demo", 4));
    expect(reads.calls).toEqual([]);
    vi.useRealTimers();
  });

  it("reads a proposal with its live ballots in two ledger calls", async () => {
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
