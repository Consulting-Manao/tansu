import { describe, it, expect } from "vitest";
import { CarWriter } from "@ipld/car";
import { createDirectoryEncoderStream } from "ipfs-car";
import { CID } from "multiformats/cid";
import { sha256 } from "multiformats/hashes/sha2";
import { MAX_CAR_BLOCKS, verifiedRoot } from "./car";

interface Block {
  cid: CID;
  bytes: Uint8Array;
}

/** The blocks the dapp packs for `files`, the root last. */
async function pack(files: File[]): Promise<Block[]> {
  const blocks: Block[] = [];
  await createDirectoryEncoderStream(files).pipeTo(
    new WritableStream({ write: (block) => void blocks.push(block) }),
  );
  return blocks;
}

async function car(roots: CID | CID[], blocks: Block[]): Promise<Uint8Array> {
  const { writer, out } = CarWriter.create(roots);
  const chunks: Uint8Array[] = [];
  const reading = (async () => {
    for await (const chunk of out) chunks.push(chunk);
  })();
  for (const block of blocks) await writer.put(block);
  await writer.close();
  await reading;
  return new Uint8Array(await new Blob(chunks).arrayBuffer());
}

async function raw(text: string, code = 0x55): Promise<Block> {
  const bytes = new TextEncoder().encode(text);
  return { cid: CID.createV1(code, await sha256.digest(bytes)), bytes };
}

const files = [
  new File(["# A proposal"], "proposal.md"),
  // Several 1 MiB leaves: a node that links to many blocks.
  new File([new Uint8Array(2.5 * 1024 * 1024).fill(7)], "image.png"),
];

describe("verifiedRoot", () => {
  it("returns the root of the directory the dapp packs", async () => {
    const blocks = await pack(files);
    const root = blocks[blocks.length - 1]!.cid;
    expect(await verifiedRoot(await car(root, blocks))).toBe(root.toString());
  });

  it("refuses a block that does not hash to its CID", async () => {
    const blocks = await pack(files);
    const root = blocks[blocks.length - 1]!.cid;
    const forged = blocks.map((block, i) =>
      i === 0
        ? { cid: block.cid, bytes: new TextEncoder().encode("x") }
        : block,
    );
    await expect(verifiedRoot(await car(root, forged))).rejects.toThrow(
      "does not hash to its CID",
    );
  });

  it("refuses a CID for bytes the root never links", async () => {
    const blocks = await pack(files);
    const root = blocks[blocks.length - 1]!.cid;
    const extra = await raw("anything at all");
    await expect(
      verifiedRoot(await car(root, [extra, ...blocks])),
    ).rejects.toThrow("does not link");
  });

  it("refuses a root whose link has no block", async () => {
    const blocks = await pack(files);
    const root = blocks[blocks.length - 1]!.cid;
    await expect(
      verifiedRoot(await car(root, blocks.slice(1))),
    ).rejects.toThrow("lacks the block");
  });

  it("refuses a root that is not in the file", async () => {
    const blocks = await pack(files);
    const root = blocks[blocks.length - 1]!.cid;
    await expect(
      verifiedRoot(await car(root, blocks.slice(0, -1))),
    ).rejects.toThrow("does not hold its root");
  });

  it("refuses a block of another kind than raw or DAG-PB", async () => {
    const block = await raw("{}", 0x71);
    await expect(verifiedRoot(await car(block.cid, [block]))).rejects.toThrow(
      "neither raw nor DAG-PB",
    );
  });

  it("refuses a DAG-PB block that is not a node", async () => {
    const block = await raw("not protobuf \u0000ÿ", 0x70);
    await expect(verifiedRoot(await car(block.cid, [block]))).rejects.toThrow(
      "not a valid DAG-PB node",
    );
  });

  it("refuses more blocks than the cap, before anything else", async () => {
    const blocks = await Promise.all(
      Array.from({ length: MAX_CAR_BLOCKS + 1 }, (_, i) => raw(`block ${i}`)),
    );
    await expect(
      verifiedRoot(await car(blocks[0]!.cid, blocks)),
    ).rejects.toThrow(`more than ${MAX_CAR_BLOCKS} blocks`);
  });

  it("refuses a file with no root or several", async () => {
    const [a, b] = [await raw("a"), await raw("b")];
    await expect(verifiedRoot(await car([], [a]))).rejects.toThrow(
      "no declared root",
    );
    await expect(
      verifiedRoot(await car([a.cid, b.cid], [a, b])),
    ).rejects.toThrow("one root");
  });
});
