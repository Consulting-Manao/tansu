/**
 * What a CAR must be for the worker to pin it: the directory the dapp packs
 * (`createDirectoryEncoderStream`), whole. Every block hashes to its CID, is
 * reached from the root, and every link of the root's tree leads to a block in
 * the file, so the root names exactly the bytes uploaded and nothing rides
 * along.
 */

import { CarBlockIterator } from "@ipld/car/iterator";
import * as dagPb from "@ipld/dag-pb";

/** A proposal with its images is a few dozen blocks; this is a wide margin. */
export const MAX_CAR_BLOCKS = 2048;

const SHA2_256 = 0x12;
const RAW = 0x55;
const DAG_PB = 0x70;

/**
 * Check `bytes` as above and return the CID of its one root. The blocks are
 * read one at a time and only their CIDs and links are kept, so what a CAR
 * costs in memory is its size, not a structure per block; the number of
 * blocks is capped.
 */
export async function verifiedRoot(bytes: Uint8Array): Promise<string> {
  const iterator = await CarBlockIterator.fromBytes(bytes);
  const roots = await iterator.getRoots();
  if (roots.length !== 1) {
    throw new Error(
      roots.length
        ? "CAR file must have one root"
        : "CAR file has no declared root",
    );
  }

  const links = new Map<string, string[]>();
  let blocks = 0;
  for await (const { cid, bytes: data } of iterator) {
    blocks += 1;
    if (blocks > MAX_CAR_BLOCKS) {
      throw new Error(`CAR file has more than ${MAX_CAR_BLOCKS} blocks`);
    }
    if (cid.multihash.code !== SHA2_256) {
      throw new Error(`Block ${cid} is not hashed with SHA-256`);
    }
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
    if (
      digest.length !== cid.multihash.digest.length ||
      digest.some((byte, i) => byte !== cid.multihash.digest[i])
    ) {
      throw new Error(`Block ${cid} does not hash to its CID`);
    }

    if (cid.code === RAW) {
      links.set(cid.toV1().toString(), []);
    } else if (cid.code === DAG_PB) {
      let node: dagPb.PBNode;
      try {
        node = dagPb.decode(data);
      } catch {
        throw new Error(`Block ${cid} is not a valid DAG-PB node`);
      }
      links.set(
        cid.toV1().toString(),
        node.Links.map((link) => link.Hash.toV1().toString()),
      );
    } else {
      throw new Error(`Block ${cid} is neither raw nor DAG-PB`);
    }
  }

  const root = roots[0]!.toV1().toString();
  if (!links.has(root)) throw new Error("CAR file does not hold its root");
  const reached = new Set<string>();
  const pending = [root];
  while (pending.length) {
    const key = pending.pop()!;
    if (reached.has(key)) continue;
    reached.add(key);
    for (const link of links.get(key) ?? []) {
      if (!links.has(link)) {
        throw new Error(`CAR file lacks the block ${link}, which is linked`);
      }
      pending.push(link);
    }
  }
  if (reached.size !== links.size) {
    throw new Error("CAR file holds blocks that its root does not link");
  }
  return roots[0]!.toString();
}
