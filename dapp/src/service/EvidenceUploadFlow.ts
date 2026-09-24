/**
 * Evidence upload flow: packs evidence file to IPFS CAR, signs the set_evidence
 * transaction, uploads via the delegation proxy, and submits the on-chain tx.
 *
 * This mirrors the split-sign-upload-submit pattern used by FlowService.
 */

import { packFilesToCar } from "../utils/ipfsFunctions";
import { signAssembledTransaction } from "./TxService";
import { uploadAndSend } from "./FlowService";
import Tansu from "../contracts/soroban_tansu";
import { checkSimulationError } from "../utils/contractErrors";
import { deriveProjectKey } from "../utils/projectKey";
import { loadedPublicKey, txSourceFor } from "./walletService";
import type { EvidenceKind } from "../../packages/tansu";
import { toEvidenceKind } from "./EvidenceService";
import type { EvidenceKindTag } from "./EvidenceService";
import { invalidateAfter } from "./queryClient";

/**
 * Upload an evidence file to IPFS and record its CID on-chain.
 *
 * Steps:
 * 1. Pack the selected file into a CAR and calculate its CID
 * 2. Assemble and simulate the `set_evidence` transaction
 * 3. Sign the transaction with the user's wallet
 * 4. Upload the CAR to the IPFS delegation proxy and send the transaction,
 *    in the order the wallet allows (see `uploadAndSend`)
 * 5. Refetch the commit's evidence so the UI picks up the change
 *
 * @returns The IPFS CID of the uploaded evidence file
 */
export async function setEvidenceWithIpfsUpload(
  project_name: string,
  commit_hash: string,
  kind: EvidenceKind | EvidenceKindTag,
  file: File,
): Promise<string> {
  const publicKey = loadedPublicKey();
  if (!publicKey) throw new Error("Please connect your wallet first");

  // Step 1 – Calculate CID and pack CAR
  const { cid, carBlob } = await packFilesToCar([file]);

  // Step 2 – Assemble & simulate the set_evidence transaction
  Tansu.options.publicKey = txSourceFor(publicKey);
  const projectKey = deriveProjectKey(project_name);

  const tx = await Tansu.set_evidence({
    maintainer: publicKey,
    project_key: projectKey,
    commit_hash,
    kind: toEvidenceKind(kind),
    cid,
  });

  checkSimulationError(tx);

  // Step 3 – Sign the assembled transaction
  const signed = await signAssembledTransaction(tx);

  // Step 4 – Upload the CAR to the IPFS proxy (proxy validates & pins) and
  // send the transaction; step 5 – refetch the commit's evidence
  await invalidateAfter(uploadAndSend(signed, { cid, carBlob }), [
    "evidence",
    projectKey.toString("hex"),
    commit_hash,
  ]);

  return cid;
}
