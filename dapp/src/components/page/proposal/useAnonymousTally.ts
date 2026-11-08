import { useState } from "react";
import { removeVote } from "@service/ProposalService";
import {
  computeAnonymousVotingData,
  validateAnonymousKeyForProject,
  type AnonymousVotingData,
} from "utils/anonymousVoting";
import { toast } from "utils/utils";

/**
 * An anonymous vote's tally, counted in the browser from the key file the
 * maintainer selects; a ballot that cannot count is removed from here, and
 * the vote counted again.
 */
export function useAnonymousTally(projectName: string, proposalId: number) {
  const [tally, setTally] = useState<AnonymousVotingData | null>(null);
  const [privateKey, setPrivateKey] = useState("");
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  const count = async (key: string) =>
    setTally(
      await computeAnonymousVotingData(projectName, proposalId, key, true),
    );

  /** Count with the key in `file`; true once counted. */
  const readKeyFile = async (file: File | null | undefined) => {
    if (!file) return false;
    setProcessing(true);
    try {
      const parsed = JSON.parse(await file.text());
      if (!parsed.privateKey)
        throw new Error("Invalid key-file – missing privateKey field");
      await validateAnonymousKeyForProject(projectName, parsed.publicKey);
      await count(parsed.privateKey);
      setPrivateKey(parsed.privateKey);
      setError(null);
      return true;
    } catch (err: any) {
      setError(err.message || "Failed to process key-file");
      return false;
    } finally {
      setProcessing(false);
    }
  };

  /** Remove a ballot that cannot count, then count again. */
  const removeInvalid = async (address: string) => {
    setRemoving(address);
    try {
      await removeVote(projectName, proposalId, address);
      await count(privateKey);
    } catch (err: any) {
      toast.error("Could not remove the vote", err.message);
    } finally {
      setRemoving(null);
    }
  };

  return { tally, processing, error, removing, readKeyFile, removeInvalid };
}

export type AnonymousTally = ReturnType<typeof useAnonymousTally>;
