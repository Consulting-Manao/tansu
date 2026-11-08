import AnonymousTalliesDisplay from "./AnonymousTalliesDisplay";
import InvalidBallots from "./InvalidBallots";
import { useState } from "react";
import {
  computeAnonymousVotingData,
  validateAnonymousKeyForProject,
} from "utils/anonymousVoting";
import type { DecodedVote, InvalidBallot } from "utils/anonymousVoting";
import type { VoteStatus } from "types/proposal";
import { removeVote } from "@service/ProposalService";
import { toast } from "utils/utils";
import classNames from "classnames";
import { Button, Dialog, StepBar, Title } from "components/ui";

interface Props {
  onClose: () => void;
  projectName: string;
  proposalId: number;
}

const VerifyAnonymousVotesModal: React.FC<Props> = ({
  projectName,
  proposalId,
  onClose,
}) => {
  const [step, setStep] = useState(1);
  const [processingError, setProcessingError] = useState<string | null>(null);
  const [voteStatus, setVoteStatus] = useState<VoteStatus | null>(null);
  const [proofOk, setProofOk] = useState<boolean | null>(null);
  const [proofErrorMessage, setProofErrorMessage] = useState<string | null>(
    null,
  );
  const [decodedVotes, setDecodedVotes] = useState<DecodedVote[]>([]);
  const [tallies, setTallies] = useState<bigint[]>([]);
  const [invalid, setInvalid] = useState<InvalidBallot[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [privateKey, setPrivateKey] = useState("");
  const [removing, setRemoving] = useState<string | null>(null);

  const computeTallies = async (privKey: string) => {
    const data = await computeAnonymousVotingData(
      projectName,
      proposalId,
      privKey,
      true,
    );
    setVoteStatus(data.voteStatus);
    setProofOk(data.proofOk ?? null);
    setProofErrorMessage(data.proofErrorMessage ?? null);
    setDecodedVotes(data.decodedVotes);
    setInvalid(data.invalid);
    setTallies(data.tallies);
  };

  const handleKeyUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsProcessing(true);
    try {
      const fileList = e.target.files;
      if (!fileList || fileList.length === 0) return;
      const file = fileList.item(0);
      if (!file) return;
      const txt = await file.text();
      const parsed = JSON.parse(txt);
      if (!parsed.privateKey) throw new Error("Invalid key file");
      // Validate uploaded key against on-chain config (centralized helper)
      await validateAnonymousKeyForProject(projectName, parsed.publicKey);
      await computeTallies(parsed.privateKey);
      setPrivateKey(parsed.privateKey);
      setProcessingError(null);
      setStep(2);
    } catch (err: any) {
      setProcessingError(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  /** Remove a ballot that cannot count, then count again. */
  const removeInvalid = async (address: string) => {
    setRemoving(address);
    try {
      await removeVote(projectName, proposalId, address);
      await computeTallies(privateKey);
    } catch (error: any) {
      toast.error("Could not remove the vote", error.message);
    } finally {
      setRemoving(null);
    }
  };

  return (
    <Dialog size="auto" onClose={onClose}>
      {step === 1 ? (
        <div className="flex flex-col gap-6 sm:gap-7">
          <StepBar step={1} totalSteps={2} />

          <Title
            title="Upload anonymous key file"
            description="The private key will be used locally to decrypt votes and verify the proof."
          />

          <div
            className={classNames(
              "border rounded-control",
              processingError ? "border-danger" : "border-ink",
              "p-3 sm:p-4 text-ui sm:text-body break-words",
            )}
          >
            {isProcessing ? (
              <div className="text-ink text-center sm:text-left">
                Processing key file...
              </div>
            ) : (
              <label className="cursor-pointer text-ink underline block text-center sm:text-left">
                Choose key file
                <input
                  type="file"
                  accept="application/json"
                  className="hidden"
                  onChange={handleKeyUpload}
                />
              </label>
            )}
          </div>

          {processingError && (
            <p className="text-danger text-label sm:text-ui break-words">
              {processingError}
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-6 sm:gap-7">
          <StepBar step={2} totalSteps={2} />

          <Title
            title="Decrypted tallies"
            description="Below are the tallies computed from decrypted votes."
          />

          <AnonymousTalliesDisplay
            voteStatus={voteStatus || undefined}
            decodedVotes={decodedVotes}
            tallies={tallies}
            proofOk={proofOk}
            proofErrorMessage={proofErrorMessage}
            exportFileNameBase={`${projectName.replace(
              /[^a-z0-9_-]+/gi,
              "-",
            )}-proposal-${proposalId}-decoded-votes`}
          />

          <InvalidBallots
            invalid={invalid}
            removing={removing}
            onRemove={removeInvalid}
          />

          <div className="flex justify-center sm:justify-end">
            <Button tone="secondary" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
};

export default VerifyAnonymousVotesModal;
