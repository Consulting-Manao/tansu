import { useStore } from "@nanostores/react";
import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { isNoCall } from "@service/ContractIntrospectionService";
import { projectQuery } from "@service/ProjectService";
import {
  executeProposal,
  executeDelayQuery,
  quorumReachedAtQuery,
} from "@service/ProposalService";
import { queryClient } from "@service/queryClient";
import {
  Button,
  CopyButton,
  Dialog,
  Notice,
  StepBar,
  Title,
  toast,
} from "components/ui";
import type { Proposal, ProposalOutcome, VoteStatus } from "types/proposal";
import { OUTCOMES, winningOutcome } from "utils/proposalOutcomes";
import { connectedPublicKey } from "utils/store";
import { KeyFileField, TallyResult } from "./AnonymousTallyParts";
import RegistryCheck from "./RegistryCheck";
import { useAnonymousTally } from "./useAnonymousTally";
import VotingResult from "./VotingResult";

interface ExecuteProposalModalProps {
  onClose: () => void;
  projectName: string;
  proposalId: number;
  proposal: Proposal | undefined;
  outcome: ProposalOutcome | null;
  voteStatus: VoteStatus | undefined;
}

/** A step: its illustration, the step bar, the title, then its body. */
const Step = ({
  image,
  step,
  totalSteps,
  title,
  description,
  children,
  actions,
}: {
  image: string;
  step: number;
  totalSteps: number;
  title: string;
  description: ReactNode;
  children?: ReactNode;
  actions: ReactNode;
}) => (
  <div className="flex flex-col gap-10">
    <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 sm:gap-4">
      <img
        src={image}
        alt=""
        className="w-16 sm:w-20 md:w-24 mx-auto sm:mx-0"
      />
      <div className="flex-grow flex flex-col gap-6 sm:gap-7 w-full text-center sm:text-left">
        <StepBar step={step} totalSteps={totalSteps} />
        <Title title={title} description={description} />
        {children}
      </div>
    </div>
    <div className="flex flex-col sm:flex-row justify-end gap-4">{actions}</div>
  </div>
);

/**
 * For maintainers, once the vote ended: count it (an anonymous vote from the
 * key file, in the browser), review the outcome and its call, and execute.
 */
const ExecuteProposalModal: React.FC<ExecuteProposalModalProps> = ({
  projectName,
  proposalId,
  proposal,
  outcome,
  voteStatus,
  onClose,
}) => {
  const isAnonymous = proposal ? !proposal.publicVoting : false;
  const [step, setStep] = useState(1);
  const tally = useAnonymousTally(projectName, proposalId);
  const [executing, setExecuting] = useState(false);
  const [executeError, setExecuteError] = useState<string | null>(null);
  const publicKey = useStore(connectedPublicKey);
  const { data: project } = useQuery(projectQuery(projectName), queryClient);
  const isMaintainer =
    !!publicKey && !!project?.maintainers.includes(publicKey);

  const { data: delay } = useQuery(
    executeDelayQuery(projectName, proposalId),
    queryClient,
  );
  const { data: quorumReachedAt } = useQuery(
    quorumReachedAtQuery(projectName, proposalId),
    queryClient,
  );

  const normalExecutableAt =
    proposal && delay !== undefined
      ? (proposal.voting_ends_at + delay) * 1000
      : undefined;
  const earlyExecutableAt =
    delay !== undefined && quorumReachedAt
      ? (quorumReachedAt + Math.floor(delay / 2)) * 1000
      : undefined;

  const isEarly =
    normalExecutableAt !== undefined &&
    earlyExecutableAt !== undefined &&
    earlyExecutableAt < normalExecutableAt;

  const shownStatus = tally.tally?.voteStatus ?? voteStatus;
  const winner = shownStatus ? winningOutcome(shownStatus) : null;
  // A call in the winning outcome's slot runs on chain; otherwise its
  // transaction is shown for the maintainer to submit.
  const winningCall = winner
    ? proposal?.outcome_contracts?.[OUTCOMES.indexOf(winner)]
    : undefined;
  const callAddress =
    winningCall && !isNoCall(winningCall) ? winningCall.address : undefined;
  const executionXdr =
    winner && !callAddress ? outcome?.[winner]?.xdr || null : null;
  const registryName = winner ? outcome?.[winner]?.registryName : undefined;

  const totalSteps = isAnonymous ? 3 : 2;

  const execute = async () => {
    if (!isMaintainer) {
      toast.error("Execute Proposal", "Only maintainers can execute proposals");
      return;
    }
    setExecuting(true);
    setExecuteError(null);
    try {
      await executeProposal(
        projectName,
        proposalId,
        tally.tally?.tallies,
        tally.tally?.seeds,
      );
      toast.success(
        "Your Vote Is Officially Executed!",
        "Congratulations! You've successfully executed your vote, and the final status has been updated.",
      );
      onClose();
    } catch (error: any) {
      // The decrypted tallies stay, for another try.
      setExecuteError(error.message);
    } finally {
      setExecuting(false);
    }
  };

  const back = (
    <Button
      tone="secondary"
      disabled={executing}
      onClick={() => setStep(step - 1)}
    >
      Back
    </Button>
  );
  const cancel = (
    <Button tone="secondary" onClick={onClose}>
      Cancel
    </Button>
  );

  return (
    <Dialog size="auto" onClose={onClose} closable={!executing}>
      {step === 1 && isAnonymous ? (
        <Step
          image="/images/scan.svg"
          step={1}
          totalSteps={totalSteps}
          title="Provide the anonymous voting key-file"
          description={
            <>
              Upload the private key you downloaded when the proposal was
              created. It will be used <strong>locally</strong> to decrypt the
              vote commitments and compute the tallies. The key never leaves
              your browser.
            </>
          }
          actions={cancel}
        >
          <KeyFileField tally={tally} onCounted={() => setStep(2)} />
        </Step>
      ) : step === 2 && isAnonymous ? (
        <Step
          image="/images/box-with-coin-inside.svg"
          step={2}
          totalSteps={totalSteps}
          title="Decrypted tallies"
          description="Below are the tallies computed from decrypted votes."
          actions={
            <>
              {back}
              <Button
                disabled={
                  !!tally.tally?.invalid.length ||
                  tally.tally?.proofOk === false
                }
                onClick={() => setStep(3)}
              >
                Next
              </Button>
            </>
          }
        >
          <TallyResult
            tally={tally}
            projectName={projectName}
            proposalId={proposalId}
          />
        </Step>
      ) : step === 1 ? (
        <Step
          image="/images/lock-in-box.svg"
          step={1}
          totalSteps={totalSteps}
          title="Finalizing the Vote"
          description={
            isEarly && normalExecutableAt
              ? `Maintainer quorum was reached early. Execution unlocked ahead of the normal deadline (${new Date(normalExecutableAt).toLocaleString()}).`
              : "The voting period has ended. Now, we need to count the votes and determine the final outcome."
          }
          actions={
            <>
              {cancel}
              <Button
                onClick={() =>
                  isMaintainer
                    ? setStep(2)
                    : toast.error(
                        "Execute Proposal",
                        "Only maintainers can finalize votes",
                      )
                }
              >
                Next
              </Button>
            </>
          }
        >
          <VotingResult voteStatus={shownStatus} withDetail />
        </Step>
      ) : (
        <Step
          image="/images/scan.svg"
          step={totalSteps}
          totalSteps={totalSteps}
          title="Finalize the Vote Execution"
          description="Review the transaction details before execution."
          actions={
            <>
              {back}
              <Button loading={executing} onClick={execute}>
                Execute Transaction
              </Button>
            </>
          }
        >
          <VotingResult voteStatus={shownStatus} />
          {registryName && callAddress && (
            <RegistryCheck name={registryName} callAddress={callAddress} />
          )}
          {executionXdr && (
            <div className="flex flex-col items-center sm:items-start gap-4">
              <p className="leading-4 text-body text-ink-muted">XDR</p>
              <div className="p-2 sm:py-2 sm:px-4 bg-accent-soft flex flex-col sm:flex-row items-center gap-3 sm:gap-4 rounded-control">
                <p className="leading-4 text-card text-ink break-all sm:break-normal text-center sm:text-left">
                  {executionXdr.slice(0, 24) + "..."}
                </p>
                <CopyButton textToCopy={executionXdr} size="sm" />
              </div>
            </div>
          )}
          {executeError && (
            <Notice tone="danger" live>
              {executeError}
            </Notice>
          )}
        </Step>
      )}
    </Dialog>
  );
};

export default ExecuteProposalModal;
