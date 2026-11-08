import { useStore } from "@nanostores/react";
import { navigate } from "astro:transitions/client";
import { useState } from "react";
import { createProposal, setupAnonymousVoting } from "@service/ProposalService";
import { Button, FlowDialog, flowSteps, Title, useFlow } from "components/ui";
import { connectedPublicKey } from "utils/store";
import { proposalUrl } from "utils/urls";
import ProposalBasicsStep from "./ProposalBasicsStep";
import ProposalOutcomesStep from "./ProposalOutcomesStep";
import ProposalReviewStep from "./ProposalReviewStep";
import ProposalScheduleStep from "./ProposalScheduleStep";
import { useProposalDraft } from "./useProposalDraft";

/**
 * The proposal wizard: basics, outcomes, the vote's end, the review; then,
 * for a project's first anonymous vote, its key's setup. It stays mounted
 * while closed, so a draft survives closing it.
 */
const CreateProposalModal = ({
  projectName,
  maintainers,
  open,
  onClose,
}: {
  projectName: string;
  maintainers: string[];
  open: boolean;
  onClose: () => void;
}) => {
  const connectedAddress = useStore(connectedPublicKey);
  const [step, setStep] = useState(1);
  const [proposalId, setProposalId] = useState<number | null>(null);
  const [settingUp, setSettingUp] = useState(false);
  const draft = useProposalDraft(projectName);
  const { anonymous } = draft;
  const flow = useFlow();

  const create = async () => {
    flow.stage("prepare");
    try {
      const { id } = await createProposal({
        projectName,
        proposalFiles: draft.files(),
        ...(await draft.submission()),
        onProgress: flow.stage,
      });
      setProposalId(id);
      draft.reset();
      flow.done();
    } catch (err) {
      flow.fail(err);
    }
  };

  const register = () => {
    if (!connectedAddress) return flow.fail("Please connect your wallet first");
    if (!maintainers.includes(connectedAddress))
      return flow.fail("Only maintainers can submit proposals");
    if (anonymous.needsSetup) return setStep(5);
    return create();
  };

  const setUpKey = async () => {
    setSettingUp(true);
    try {
      if (!anonymous.keys || !anonymous.saved)
        throw new Error("The key file is not saved yet");
      await setupAnonymousVoting(
        projectName,
        anonymous.keys.publicKey,
        anonymous.replacing,
      );
      anonymous.setUp();
    } catch (err) {
      flow.fail(err);
      return;
    } finally {
      setSettingUp(false);
    }
    await create();
  };

  const close = () => {
    onClose();
    setStep(1);
    flow.reset();
  };

  if (!open) return null;

  return (
    <FlowDialog
      state={flow.state}
      onClose={close}
      onSuccess={() => {
        if (proposalId !== null) navigate(proposalUrl(projectName, proposalId));
      }}
      steps={flowSteps("proposal")}
      success={{
        title: "Your Proposal Is Live!",
        description:
          "Congratulations! You've successfully submitted your proposal. Let's move forward and make it a success!",
      }}
      size="auto"
    >
      {step === 1 ? (
        <ProposalBasicsStep
          draft={draft}
          onNext={() => setStep(2)}
          onCancel={close}
        />
      ) : step === 2 ? (
        <ProposalOutcomesStep
          draft={draft}
          onNext={() => setStep(3)}
          onBack={() => setStep(1)}
        />
      ) : step === 3 ? (
        <ProposalScheduleStep
          draft={draft}
          onNext={() => setStep(4)}
          onBack={() => setStep(2)}
        />
      ) : step === 4 ? (
        <ProposalReviewStep
          draft={draft}
          onStep={setStep}
          onRegister={register}
        />
      ) : (
        <div className="flex flex-col sm:flex-row sm:items-start gap-6 sm:gap-8">
          <img
            src="/images/scan.svg"
            alt=""
            className="w-20 h-auto mx-auto sm:mx-0 sm:w-24"
          />
          <div className="flex-grow flex flex-col gap-4 sm:gap-6 text-center sm:text-left">
            <Title
              title="Configure anonymous voting"
              description="Sign the setup transaction. This enables anonymous voting for this project."
            />
            <p className="text-ui sm:text-body text-ink-muted">
              Your key file is saved. Sign the setup transaction to use its key
              for this project's anonymous votes.
            </p>
            <div className="flex flex-col sm:flex-row justify-end gap-3 sm:gap-4 mt-4">
              <Button
                loading={settingUp}
                onClick={setUpKey}
                className="w-full sm:w-auto"
              >
                Sign setup
              </Button>
            </div>
          </div>
        </div>
      )}
    </FlowDialog>
  );
};

export default CreateProposalModal;
