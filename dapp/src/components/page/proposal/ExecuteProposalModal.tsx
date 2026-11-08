import { useStore } from "@nanostores/react";
import { useQuery } from "@tanstack/react-query";
import { navigate } from "astro:transitions/client";
import { useMemo, useState, useEffect } from "react";
import type { Proposal, ProposalOutcome, VoteStatus } from "types/proposal";
import { toast } from "utils/utils";
import VotingResult from "./VotingResult";
import {
  computeAnonymousVotingData,
  validateAnonymousKeyForProject,
} from "utils/anonymousVoting";
import type { DecodedVote, InvalidBallot } from "utils/anonymousVoting";
import { projectQuery } from "@service/ProjectService";
import { queryClient } from "@service/queryClient";
import { connectedPublicKey } from "utils/store";
import classNames from "classnames";
import AnonymousTalliesDisplay from "./AnonymousTalliesDisplay";
import InvalidBallots from "./InvalidBallots";
import { proposalUrl } from "utils/urls";
import { isNoCall } from "@service/ContractIntrospectionService";
import { getContractByName } from "@service/StellarRegistryService";
import { OUTCOMES, winningOutcome } from "utils/proposalOutcomes";
import { Button, CopyButton, Dialog, StepBar, Title } from "components/ui";

interface ExecuteProposalModalProps {
  onClose: () => void;
  projectName: string;
  proposalId: number | undefined;
  proposal: Proposal | undefined; // Add proposal data
  outcome: ProposalOutcome | null;
  voteStatus: VoteStatus | undefined;
}

const ExecuteProposalModal: React.FC<ExecuteProposalModalProps> = ({
  projectName,
  proposalId,
  proposal,
  outcome,
  voteStatus,
  onClose,
}) => {
  const [step, setStep] = useState(1);
  const [isAnonymous, setIsAnonymous] = useState(
    proposal ? !proposal.publicVoting : false,
  );

  const [seeds, setSeeds] = useState<bigint[] | null>(null);
  const [tallies, setTallies] = useState<bigint[] | null>(null);
  const [processingError, setProcessingError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const publicKey = useStore(connectedPublicKey);
  const { data: project } = useQuery(projectQuery(projectName), queryClient);
  const isMaintainer =
    !!publicKey && !!project?.maintainers.includes(publicKey);
  const [decodedVotes, setDecodedVotes] = useState<DecodedVote[]>([]);
  const [proofOk, setProofOk] = useState<boolean | null>(null);
  const [proofErrorMessage, setProofErrorMessage] = useState<string | null>(
    null,
  );
  const [privateKey, setPrivateKey] = useState<string>("");
  const [invalid, setInvalid] = useState<InvalidBallot[]>([]);
  const [removing, setRemoving] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);

  // Local vote status that may be updated once we compute tallies for
  // anonymous proposals.
  const [displayVoteStatus, setDisplayVoteStatus] = useState<
    VoteStatus | undefined
  >(voteStatus);

  const computedResult = displayVoteStatus
    ? winningOutcome(displayVoteStatus)
    : null;

  const executionXdr = useMemo(() => {
    if (!outcome || !computedResult) return null;
    // A call in the winning outcome's slot runs on-chain; otherwise its
    // transaction is shown for the maintainer to submit.
    const call =
      proposal?.outcome_contracts?.[OUTCOMES.indexOf(computedResult)];
    if (call && !isNoCall(call)) return null;
    return outcome[computedResult]?.xdr || null;
  }, [outcome, computedResult, proposal?.outcome_contracts]);

  useEffect(() => {
    setIsAnonymous(proposal ? !proposal.publicVoting : false);
  }, [proposal]);

  // The winning call is fixed on chain. When its contract was picked by a
  // Stellar Registry name, the name is looked up again: it may point to
  // another contract now, which the maintainer should know before executing.
  const winningCall = computedResult
    ? proposal?.outcome_contracts?.[OUTCOMES.indexOf(computedResult)]
    : undefined;
  const callAddress =
    winningCall && !isNoCall(winningCall) ? winningCall.address : undefined;
  const registryName = computedResult
    ? outcome?.[computedResult]?.registryName
    : undefined;
  const [registryNow, setRegistryNow] = useState<{
    name: string;
    address: string | null;
  } | null>(null);
  const [registryFailed, setRegistryFailed] = useState(false);
  useEffect(() => {
    setRegistryNow(null);
    setRegistryFailed(false);
    if (!registryName || !callAddress) return;
    let ignore = false;
    getContractByName(registryName)
      .then((contract) => {
        if (!ignore)
          setRegistryNow({
            name: registryName,
            address: contract?.contractId ?? null,
          });
      })
      .catch(() => {
        if (!ignore) setRegistryFailed(true);
      });
    return () => {
      ignore = true;
    };
  }, [registryName, callAddress]);

  const handleKeyFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    setIsProcessing(true);
    try {
      const fileList = e.target.files;
      if (!fileList || fileList.length === 0) return;
      const file = fileList.item(0);
      if (!file) return;
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed.privateKey)
        throw new Error("Invalid key-file – missing privateKey field");
      // Validate uploaded key against on-chain config (centralized helper)
      await validateAnonymousKeyForProject(projectName!, parsed.publicKey);
      setPrivateKey(parsed.privateKey);
      await computeTallies(parsed.privateKey);
    } catch (err: any) {
      // Silent in prod, log only in dev
      if (import.meta.env.DEV) console.error(err);
      setProcessingError(err.message || "Failed to process key-file");
    } finally {
      setIsProcessing(false);
    }
  };

  const computeTallies = async (privKey: string) => {
    if (!projectName || proposalId === undefined) return;
    try {
      const data = await computeAnonymousVotingData(
        projectName,
        proposalId!,
        privKey,
        true,
      );
      setTallies(data.tallies);
      setSeeds(data.seeds);
      setDisplayVoteStatus(data.voteStatus);
      setDecodedVotes(data.decodedVotes);
      setInvalid(data.invalid);
      setProofOk(data.proofOk ?? null);
      setProofErrorMessage(data.proofErrorMessage ?? null);
      setProcessingError(null);
      if (isAnonymous) setStep(2);
    } catch (err: any) {
      setProcessingError(err.message);
    }
  };

  const signAndExecute = async () => {
    if (!projectName) {
      toast.error("Execute Proposal", "Project name is required");
      return;
    }

    if (proposalId === undefined) {
      toast.error("Execute Proposal", "Proposal ID is required");
      return;
    }

    if (!displayVoteStatus) {
      toast.error("Execute Proposal", "Vote result is required");
      return;
    }

    setIsExecuting(true);
    try {
      const { executeProposal } = await import("@service/ProposalService");
      await executeProposal(
        projectName,
        proposalId,
        tallies ?? undefined,
        seeds ?? undefined,
      );
      setStep(step + 1);
    } catch (error: any) {
      // The decrypted tallies stay, for another try.
      toast.error("Execute Proposal", error.message);
    } finally {
      setIsExecuting(false);
    }
  };

  /** Remove a ballot that cannot count, then count again. */
  const removeInvalid = async (address: string) => {
    setRemoving(address);
    try {
      const { removeVote } = await import("@service/ProposalService");
      await removeVote(projectName, proposalId!, address);
      await computeTallies(privateKey);
    } catch (error: any) {
      toast.error("Could not remove the vote", error.message);
    } finally {
      setRemoving(null);
    }
  };

  const totalSteps = isAnonymous ? 4 : 3;

  return (
    <Dialog size="auto" onClose={onClose}>
      {/* ───────────────────────── step 1 ───────────────────────── */}
      {step === 1 && isAnonymous ? (
        <div className="flex flex-col gap-10 px-4 sm:px-6 md:px-8">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 sm:gap-4">
            <img
              src="/images/scan.svg"
              alt="Anonymous voting setup"
              className="w-16 sm:w-20 md:w-24 mx-auto sm:mx-0"
            />

            <div className="flex-grow flex flex-col gap-6 sm:gap-7 w-full">
              <StepBar step={step} totalSteps={totalSteps} />
              <Title
                title="Provide the anonymous voting key-file"
                description={
                  <>
                    Upload the private key you downloaded when the proposal was
                    created. It will be used <strong>locally</strong> to decrypt
                    the vote commitments and compute the tallies. The key never
                    leaves your browser.
                  </>
                }
              />

              <div
                className={classNames(
                  "border p-3 w-full rounded-control transition-colors",
                  processingError ? "border-danger" : "border-ink",
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
                      onChange={handleKeyFileUpload}
                    />
                  </label>
                )}
              </div>

              {processingError && (
                <p className="text-danger text-ui text-center sm:text-left">
                  {processingError}
                </p>
              )}

              {tallies && (
                <div className="flex flex-col gap-2 text-ui text-ink text-center sm:text-left">
                  <p>Approve: {tallies[0]}</p>
                  <p>Reject: {tallies[1]}</p>
                  <p>Abstain: {tallies[2]}</p>
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-center sm:justify-end gap-3 sm:gap-4">
            <Button tone="secondary" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </div>
      ) : step === 2 && isAnonymous ? (
        /* ────────────── step 2 (anonymous) – decrypted tallies ───────────── */
        <div className="flex flex-col gap-10 px-4 sm:px-6 md:px-8">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 sm:gap-4">
            <img
              src="/images/box-with-coin-inside.svg"
              alt="Decrypted tallies"
              className="w-16 sm:w-20 md:w-24 mx-auto sm:mx-0"
            />

            <div className="flex-grow flex flex-col gap-6 sm:gap-7 w-full">
              <StepBar step={step} totalSteps={totalSteps} />
              <Title
                title="Decrypted tallies"
                description="Below are the tallies computed from decrypted votes."
              />

              <AnonymousTalliesDisplay
                voteStatus={displayVoteStatus}
                decodedVotes={decodedVotes}
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
            </div>
          </div>

          <div className="flex justify-center sm:justify-end gap-3 sm:gap-4">
            <Button tone="secondary" onClick={() => setStep(step - 1)}>
              Back
            </Button>
            <Button
              disabled={invalid.length > 0 || proofOk === false}
              onClick={() => setStep(3)}
            >
              Next
            </Button>
          </div>
        </div>
      ) : step === 1 ? (
        <div className="flex flex-col gap-10 sm:gap-10">
          <div className="flex flex-col sm:flex-row sm:items-start gap-6 sm:gap-4">
            <img
              src="/images/lock-in-box.svg"
              className="w-16 h-16 sm:w-auto sm:h-auto mx-auto sm:mx-0"
              alt="Lock in box"
            />
            <div className="flex-grow flex flex-col gap-6 sm:gap-7 text-center sm:text-left">
              <StepBar step={step} totalSteps={totalSteps} />
              <Title
                title="Finalizing the Vote"
                description="The voting period has ended. Now, we need to count the votes and determine the final outcome."
              />
              <VotingResult voteStatus={displayVoteStatus} withDetail />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row justify-end gap-4 sm:gap-4">
            <Button tone="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!isMaintainer) {
                  toast.error(
                    "Execute Proposal",
                    "Only maintainers can finalize votes",
                  );
                  return;
                }
                setStep(2);
              }}
            >
              Next
            </Button>
          </div>
        </div>
      ) : step === (isAnonymous ? 3 : 2) ? (
        <div className="flex flex-col gap-10 sm:gap-10">
          <div className="flex flex-col sm:flex-row sm:items-start gap-6 sm:gap-4">
            <img
              src="/images/scan.svg"
              className="w-16 h-16 sm:w-auto sm:h-auto mx-auto sm:mx-0"
              alt="Scan"
            />
            <div className="flex-grow flex flex-col gap-6 sm:gap-7 text-center sm:text-left">
              <StepBar step={step} totalSteps={totalSteps} />
              <Title
                title="Finalize the Vote Execution"
                description="Review the transaction details before execution."
              />
              <VotingResult voteStatus={displayVoteStatus} />

              {registryName && callAddress && (
                <div className="flex flex-col gap-2 text-ui break-all">
                  {registryNow?.address === callAddress && (
                    <p className="text-ink-muted">
                      Stellar Registry: <code>{registryNow.name}</code> still
                      points to the contract this proposal calls.
                    </p>
                  )}
                  {registryNow && registryNow.address === null && (
                    <p className="text-danger" role="alert">
                      <code>{registryNow.name}</code> is no longer registered in
                      the Stellar Registry. This proposal still calls{" "}
                      <code>{callAddress}</code>.
                    </p>
                  )}
                  {registryNow?.address &&
                    registryNow.address !== callAddress && (
                      <p className="text-danger" role="alert">
                        Stellar Registry: <code>{registryNow.name}</code> now
                        points to <code>{registryNow.address}</code>. This
                        proposal calls <code>{callAddress}</code>, the contract
                        the name pointed to when it was proposed.
                      </p>
                    )}
                  {registryFailed && (
                    <p className="text-ink-muted">
                      The Stellar Registry could not be reached to check{" "}
                      <code>{registryName}</code>.
                    </p>
                  )}
                </div>
              )}

              {executionXdr && (
                <div className="flex flex-col items-center sm:items-start gap-4 sm:gap-4">
                  <p className="leading-4 text-body text-ink-muted">XDR</p>
                  <div className="p-2 sm:py-2 sm:px-4 bg-accent-soft flex flex-col sm:flex-row items-center gap-3 sm:gap-4 rounded-control">
                    <p className="leading-4 text-card text-ink break-all sm:break-normal text-center sm:text-left">
                      {executionXdr.slice(0, 24) + "..."}
                    </p>
                    <CopyButton textToCopy={executionXdr} size="sm" />
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row justify-end gap-4 sm:gap-4">
            <Button tone="secondary" onClick={() => setStep(step - 1)}>
              Back
            </Button>
            <Button
              loading={isExecuting}
              disabled={isExecuting}
              onClick={async () => {
                if (!isMaintainer) {
                  toast.error(
                    "Execute Proposal",
                    "Only maintainers can execute proposals",
                  );
                  return;
                }
                await signAndExecute();
              }}
            >
              Execute Transaction
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-10 sm:gap-10">
          <div className="flex flex-col sm:flex-row sm:items-start gap-6 sm:gap-4">
            <img
              src="/images/flower.svg"
              className="w-16 h-16 sm:w-auto sm:h-auto mx-auto sm:mx-0"
              alt="Success Icon"
            />
            <div className="flex-grow flex flex-col gap-6 sm:gap-7 text-center sm:text-left">
              <StepBar step={step} totalSteps={totalSteps} />
              <Title
                title="Your Vote Is Officially Executed!"
                description="Congratulations! You've successfully executed your vote, and the final status has been updated."
              />
              <VotingResult voteStatus={displayVoteStatus} />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row justify-end gap-4 sm:gap-4">
            <Button tone="secondary" onClick={onClose}>
              Close
            </Button>
            <Button
              tone="secondary"
              icon={
                <img
                  src="/icons/share.svg"
                  alt=""
                  className="size-5 shrink-0"
                />
              }
            >
              Share
            </Button>
            <Button
              onClick={() =>
                proposalId !== undefined &&
                navigate(proposalUrl(projectName, proposalId))
              }
            >
              View Proposal
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
};

export default ExecuteProposalModal;
