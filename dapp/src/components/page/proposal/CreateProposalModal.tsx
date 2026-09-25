import { useStore } from "@nanostores/react";
import { anonymousConfigQuery } from "@service/ProjectService";
import { queryClient } from "@service/queryClient";
import Button from "components/utils/Button";
import { DatePicker } from "components/utils/DatePicker";
import { ExpandableText } from "components/utils/ExpandableText";
import Input from "components/utils/Input";
import Label from "components/utils/Label";
import FlowProgressModal from "components/utils/FlowProgressModal";
import Step from "components/utils/Step";
import Title from "components/utils/Title";
import { useEffect, useRef, useState } from "react";
import { formatDate } from "utils/formatTimeFunctions";
import { connectedPublicKey } from "utils/store";
import { capitalizeFirstLetter, toast } from "utils/utils";
import { getIpfsBasicLink } from "utils/ipfsFunctions";
import { validateProposalName, validateTextContent } from "utils/validations";
import OutcomeInput from "./OutcomeInput";
import {
  NO_CALL,
  prepareOutcomeCall,
} from "@service/ContractIntrospectionService";
import {
  OUTCOMES,
  emptyOutcome,
  outcomeSlots,
  storedOutcomes,
  type OutcomeDrafts,
} from "utils/proposalOutcomes";
import TemplateSelector from "./TemplateSelector";
import { PROPOSAL_TEMPLATES } from "constants/proposalTemplates";
import { generateRSAKeyPair } from "utils/crypto";
import { createProposal, setupAnonymousVoting } from "@service/ProposalService";
import MarkdownEditorWithImages, {
  type AttachedImage,
} from "components/utils/MarkdownEditorWithImages";
import { navigate } from "astro:transitions/client";
import Loading from "components/utils/Loading";
import { proposalUrl } from "utils/urls";

/**
 * The proposal wizard. It stays mounted while closed, so a draft survives
 * closing it.
 */
const CreateProposalModal = ({
  projectName,
  maintainers,
  open: showModal,
  onClose,
}: {
  projectName: string;
  maintainers: string[];
  open: boolean;
  onClose: () => void;
}) => {
  const connectedAddress = useStore(connectedPublicKey);
  const [step, setStep] = useState(1);
  const [proposalName, setProposalName] = useState("");
  const [mdText, setMdText] = useState("");

  // Local image handling for Markdown content
  const [imageFiles, setImageFiles] = useState<AttachedImage[]>([]);
  const [imageError, setImageError] = useState<string | null>(null);

  // Keep a ref to the latest attached images so we can revoke their object URLs
  // only when the component truly unmounts — NOT on modal close. Revoking on
  // close (while the description markdown still references the blob: URLs) is
  // what made images appear broken after reopening the modal (issue #177).
  const imageFilesRef = useRef<AttachedImage[]>([]);
  useEffect(() => {
    imageFilesRef.current = imageFiles;
  }, [imageFiles]);
  useEffect(() => {
    return () => {
      imageFilesRef.current.forEach((img) => URL.revokeObjectURL(img.localUrl));
    };
  }, []);

  // The outcomes the author added, by kind; a removed one is absent.
  const [outcomes, setOutcomes] = useState<OutcomeDrafts>({});
  // Default to 2 days in the future to comfortably exceed the 24h minimum
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 2);
    return d;
  });
  const [proposalId, setProposalId] = useState<number | null>(null);
  const [_ipfsLink, setIpfsLink] = useState("");
  const [isAnonymousVoting, setIsAnonymousVoting] = useState(false);
  const [votingType, setVotingType] = useState<"badge" | "token">("badge");
  const [tokenContract, setTokenContract] = useState<string>("");
  const [preparedFiles, setPreparedFiles] = useState<File[] | null>(null);
  const [generatedKeys, setGeneratedKeys] = useState<{
    publicKey: string;
    privateKey: string;
  } | null>(null);
  const [existingAnonConfig, setExistingAnonConfig] = useState<boolean>(false);
  const [resetAnonKeys, setResetAnonKeys] = useState<boolean>(false);
  // The author selected the saved key file and it matches.
  const [keysConfirmed, setKeysConfirmed] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const toggleRun = useRef(0);
  const [proposalNameError, setProposalNameError] = useState<string | null>(
    null,
  );
  const [descriptionError, setDescriptionError] = useState<string | null>(null);
  // Flow state management
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isSuccessful, setIsSuccessful] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validateTokenContractForVoting = () => {
    if (votingType !== "token") return;
    const trimmed = tokenContract.trim();
    if (!trimmed) {
      throw new Error(
        "Token contract address is required for token-based voting",
      );
    }
    if (!/^C[A-Z0-9]{55}$/.test(trimmed)) {
      throw new Error(
        "Invalid token contract address. Use the Soroban contract ID (starts with C).",
      );
    }
  };

  const checkSubmitAvailability = () => {
    if (!connectedAddress) throw new Error("Please connect your wallet first");
    if (!maintainers.includes(connectedAddress))
      throw new Error("Only maintainers can submit proposals");
    validateTokenContractForVoting();
  };

  const prepareProposalFiles = (): File[] => {
    const proposalOutcome = storedOutcomes(outcomes);

    const outcomeBlob = new Blob([JSON.stringify(proposalOutcome)], {
      type: "application/json",
    });

    let files: File[] = [new File([outcomeBlob], "outcomes.json")];
    let description = mdText;

    // Handle images for the description
    imageFiles.forEach((image) => {
      if (description.includes(image.localUrl)) {
        description = description.replace(
          new RegExp(image.localUrl, "g"),
          image.publicUrl,
        );
        files.push(
          new File([image.source], image.publicUrl, {
            type: image.source.type,
          }),
        );
      }
    });

    files.push(new File([description], "proposal.md"));
    return files;
  };

  const startProposalCreation = async (files: File[]) => {
    try {
      validateTokenContractForVoting();
      setIsLoading(true);
      setStep(6);

      // Voting end timestamp — clamp to [25h, 30d] from now
      let targetTs = selectedDate.getTime();
      if (isNaN(targetTs) || targetTs <= 0 || !isFinite(targetTs)) {
        throw new Error(`Invalid voting end date: ${selectedDate}`);
      }
      const min25hMs = Date.now() + 25 * 60 * 60 * 1000;
      const max30dMs = Date.now() + 30 * 24 * 60 * 60 * 1000;
      targetTs = Math.max(min25hMs, Math.min(max30dMs, targetTs));
      const votingEndsAt = Math.floor(targetTs / 1000);

      // Each call in its outcome's slot, typed and dry-run; a gap gets a
      // call that changes nothing.
      const slots = outcomeSlots(outcomes);
      const outcomeContracts =
        slots &&
        (await Promise.all(
          slots.map((call) =>
            call ? prepareOutcomeCall(call, connectedAddress!) : NO_CALL,
          ),
        ));

      const { id, cid } = await createProposal({
        projectName: projectName!,
        proposalName,
        proposalFiles: files,
        votingEndsAt,
        publicVoting: !isAnonymousVoting,
        outcomeContracts,
        ...(votingType === "token"
          ? { tokenContract: tokenContract.trim() }
          : {}),
        onProgress: setStep,
      });

      setProposalId(id);
      setIpfsLink(getIpfsBasicLink(cid));

      setIsSuccessful(true);
    } catch (err: any) {
      console.error(err.message);
      setError(err.message);
    } finally {
      setIsLoading(false);
      setIsUploading(false);
    }
  };

  const handleRegisterProposal = async () => {
    try {
      checkSubmitAvailability();

      const files = prepareProposalFiles();
      setPreparedFiles(files);

      if (isAnonymousVoting && (!existingAnonConfig || resetAnonKeys)) {
        setStep(5);
        return;
      }

      await startProposalCreation(files);
    } catch (err: any) {
      console.error(err.message);
      setError(err.message);
    }
  };

  const validateProposalNameField = (): boolean => {
    const error = validateProposalName(proposalName);
    setProposalNameError(error);
    return error === null;
  };

  const validateDescriptionField = (): boolean => {
    const error = validateTextContent(mdText, 10, "Proposal description");
    setDescriptionError(error);
    return error === null;
  };

  const handleToggleAnonymous = async (checked: boolean) => {
    const run = ++toggleRun.current;
    setIsAnonymousVoting(checked);
    setExistingAnonConfig(false);
    setResetAnonKeys(false);
    setConfirmReset(false);
    setGeneratedKeys(null);
    setKeysConfirmed(false);
    if (!checked || !projectName) return;
    try {
      // Read fresh: a key another maintainer set up must not be replaced.
      const config = await queryClient.query({
        ...anonymousConfigQuery(projectName),
        staleTime: 0,
      });
      if (run !== toggleRun.current) return;
      if (config) setExistingAnonConfig(true);
      else setGeneratedKeys(await generateRSAKeyPair());
    } catch (error: any) {
      if (run !== toggleRun.current) return;
      setIsAnonymousVoting(false);
      toast.error(
        "Anonymous voting",
        `Could not read this project's anonymous voting setup: ${error.message}`,
      );
    }
  };

  const keyFileName = `tansu-${projectName}-anonymous-key.json`;

  const downloadKeys = () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(generatedKeys)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = keyFileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // The browser may still be reading the file after click() returns.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  /** The saved key file, read back: it must hold the key set up. */
  const confirmKeyFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const saved = JSON.parse(await file.text());
      if (saved.publicKey !== generatedKeys?.publicKey) {
        throw new Error("This is not the key file just generated.");
      }
      setKeysConfirmed(true);
    } catch (error: any) {
      setKeysConfirmed(false);
      toast.error("Anonymous voting", error.message);
    }
  };

  const handleCloseModal = () => {
    // Preserve the draft (description markdown + attached images + their live
    // blob: URLs) so reopening the modal shows the images correctly. Object URLs
    // are revoked on unmount instead (see effect above). Fixes issue #177.
    onClose();
    setStep(1);
  };

  if (!showModal) return <></>;

  return (
    <FlowProgressModal
      isOpen={showModal}
      onClose={handleCloseModal}
      onSuccess={() => {
        onClose();
        if (projectName && proposalId !== null)
          navigate(proposalUrl(projectName, proposalId));
      }}
      step={step}
      setStep={setStep}
      isLoading={isLoading}
      setIsLoading={setIsLoading}
      isUploading={isUploading}
      setIsUploading={setIsUploading}
      isSuccessful={isSuccessful}
      setIsSuccessful={setIsSuccessful}
      error={error}
      setError={setError}
      signLabel="proposal"
      successTitle="Your Proposal Is Live!"
      successMessage="Congratulations! You've successfully submitted your proposal. Let's move forward and make it a success!"
    >
      {step == 1 ? (
        <div className="flex flex-col gap-8 lg:gap-10">
          {/* Header section */}
          <div className="flex flex-col lg:flex-row gap-6 lg:gap-8">
            <div className="flex-shrink-0">
              <img
                src="/images/idea.svg"
                alt="Idea icon"
                className="w-16 h-16 lg:w-20 lg:h-20 mx-auto lg:mx-0"
              />
            </div>
            <div className="flex-grow space-y-6 lg:space-y-8">
              <div className="text-center lg:text-left">
                <Step step={step} totalSteps={4} />
                <Title
                  title="Basic Information"
                  description="Enter the title and description for your proposal to begin."
                />
              </div>

              {/* Anonymous voting section */}
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="anonymousCheckbox"
                    checked={isAnonymousVoting}
                    onChange={(e) => handleToggleAnonymous(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <label
                    htmlFor="anonymousCheckbox"
                    className="text-sm font-medium text-secondary"
                  >
                    Enable anonymous voting
                  </label>
                </div>

                <div className="space-y-2">
                  {isAnonymousVoting && generatedKeys && (
                    <div className="flex flex-col gap-3 p-3 bg-green-50 border border-green-200 rounded-md">
                      <p className="text-sm text-green-800">
                        Only this key file can reveal the anonymous votes when
                        the proposal is executed. Download it, keep it safe,
                        then select it to confirm you saved it.
                      </p>
                      <div className="flex flex-wrap items-center gap-3">
                        <Button
                          type="secondary"
                          size="sm"
                          onClick={downloadKeys}
                        >
                          Download key file
                        </Button>
                        <label className="text-sm text-green-800">
                          Select the saved key file
                          <input
                            type="file"
                            accept="application/json,.json"
                            className="ml-2"
                            onChange={(e) =>
                              confirmKeyFile(e.target.files?.[0])
                            }
                          />
                        </label>
                      </div>
                      {keysConfirmed && (
                        <p className="text-sm font-medium text-green-800">
                          Key file saved.
                        </p>
                      )}
                    </div>
                  )}

                  {isAnonymousVoting &&
                    existingAnonConfig &&
                    !resetAnonKeys && (
                      <div className="flex flex-col gap-2 p-3 bg-green-50 border border-green-200 rounded-md">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-green-800">
                            Already configured.
                          </span>
                          <button
                            type="button"
                            className="text-blue-500 hover:text-blue-700 underline text-sm"
                            onClick={() => setConfirmReset(true)}
                          >
                            Reset Keys
                          </button>
                        </div>
                        {confirmReset && (
                          <div className="flex flex-col gap-2 text-sm text-red-800">
                            <p>
                              Votes already cast on open anonymous proposals can
                              only be revealed with the current key file: keep
                              it until they are executed.
                            </p>
                            <Button
                              type="secondary"
                              size="sm"
                              onClick={async () => {
                                setGeneratedKeys(await generateRSAKeyPair());
                                setKeysConfirmed(false);
                                setResetAnonKeys(true);
                              }}
                            >
                              Replace the key
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                </div>
              </div>

              {/* Voting type: Badge based (default) or Token based */}
              <div className="flex flex-col gap-2 sm:gap-3 max-w-2xl">
                <label className="text-sm font-semibold text-primary">
                  Voting type
                </label>
                <select
                  value={votingType}
                  onChange={(e) =>
                    setVotingType(e.target.value as "badge" | "token")
                  }
                  className="rounded-md border border-zinc-700 bg-transparent px-3 py-2 text-primary focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="badge">Badge based</option>
                  <option value="token">Token based</option>
                </select>
                {votingType === "token" && (
                  <>
                    <Input
                      label="Token Contract Address"
                      placeholder="Enter SAC token contract address (C...)"
                      value={tokenContract}
                      onChange={(e) => setTokenContract(e.target.value)}
                    />
                    {tokenContract && (
                      <span className="text-sm text-blue-600">
                        Voting weight is capped by each voter's token balance.
                      </span>
                    )}
                  </>
                )}
              </div>

              <div className="max-w-2xl">
                <Input
                  label="Proposal Name"
                  placeholder="Write the name"
                  value={proposalName}
                  onChange={(e) => {
                    setProposalName(e.target.value);
                    setProposalNameError(null);
                  }}
                  error={proposalNameError}
                />
              </div>
            </div>
          </div>

          {/* Description Section */}
          <div className="space-y-4">
            <TemplateSelector
              templates={PROPOSAL_TEMPLATES}
              purpose="your proposal"
              onTemplateSelect={(template) => {
                setMdText(template.content);
                setDescriptionError(null);
              }}
            />
            <div className="flex items-center justify-between">
              <p className="text-lg font-semibold text-primary">Description</p>
              <span className="text-sm text-secondary">
                Supports Markdown formatting
              </span>
            </div>
            <MarkdownEditorWithImages
              value={mdText}
              onChange={(val) => {
                setMdText(val);
                setDescriptionError(null);
              }}
              imageFiles={imageFiles}
              onImageFilesChange={setImageFiles}
              imageError={imageError}
              onImageErrorChange={setImageError}
              placeholder="Input your proposal description here..."
            />
            {descriptionError && (
              <p className="text-red-500 text-sm">{descriptionError}</p>
            )}
          </div>

          {/* Footer Buttons */}
          <div className="flex flex-col sm:flex-row justify-end gap-3 sm:gap-[18px] mt-6">
            <Button type="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              data-testid="proposal-next"
              onClick={() => {
                try {
                  if (
                    !validateProposalNameField() ||
                    !validateDescriptionField()
                  )
                    throw new Error("Invalid proposal name or description");

                  if (
                    isAnonymousVoting &&
                    (!existingAnonConfig || resetAnonKeys) &&
                    !keysConfirmed
                  ) {
                    throw new Error(
                      "Download the anonymous key file and select it to confirm you saved it.",
                    );
                  }

                  validateTokenContractForVoting();

                  setStep(step + 1);
                } catch (err: any) {
                  console.error(err.message);
                  toast.error("Submit proposal", err.message);
                }
              }}
            >
              Next
            </Button>
          </div>
        </div>
      ) : step == 2 ? (
        <div className="flex flex-col gap-10 md:gap-14">
          {/* Header and title section */}
          <div className="flex flex-col gap-8 md:gap-10">
            <div className="flex flex-col sm:flex-row sm:items-center sm:gap-6">
              <img
                src="/images/cards.svg"
                alt="cards"
                className="w-20 h-auto mx-auto sm:mx-0 sm:w-24"
              />
              <div className="flex-grow flex flex-col justify-center gap-6 text-center sm:text-left">
                <Step step={step} totalSteps={4} />
                <Title
                  title="Outcome Details"
                  description="Provide descriptions and XDRs for approved, rejected, and canceled outcomes."
                />
              </div>
            </div>

            {/* Outcome Inputs */}
            <div className="space-y-8">
              {OUTCOMES.map((kind) => {
                const draft = outcomes[kind];
                return draft ? (
                  <OutcomeInput
                    key={kind}
                    type={kind}
                    draft={draft}
                    onChange={(next) =>
                      setOutcomes((all) => ({ ...all, [kind]: next }))
                    }
                    onRemove={() =>
                      setOutcomes(({ [kind]: _removed, ...rest }) => rest)
                    }
                  />
                ) : (
                  <div key={kind} className="flex justify-center">
                    <Button
                      type="secondary"
                      onClick={() =>
                        setOutcomes((all) => ({
                          ...all,
                          [kind]: emptyOutcome(),
                        }))
                      }
                    >
                      + Add {capitalizeFirstLetter(kind)} Outcome
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Navigation buttons */}
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-4 sm:gap-6">
            <Button
              type="secondary"
              onClick={() => setStep(step - 1)}
              className="w-full sm:w-auto"
            >
              Back
            </Button>

            <Button
              data-testid="proposal-next"
              onClick={() => {
                try {
                  if (
                    !validateProposalNameField() ||
                    !validateDescriptionField()
                  )
                    throw new Error("Invalid proposal name or description");

                  if (
                    isAnonymousVoting &&
                    (!existingAnonConfig || resetAnonKeys) &&
                    !keysConfirmed
                  ) {
                    throw new Error(
                      "Download the anonymous key file and select it to confirm you saved it.",
                    );
                  }

                  validateTokenContractForVoting();

                  setStep(step + 1);
                } catch (err: any) {
                  console.error(err.message);
                  toast.error("Submit proposal", err.message);
                }
              }}
            >
              Next
            </Button>
          </div>
        </div>
      ) : step == 3 ? (
        <div className="flex flex-col gap-10 md:gap-14">
          {/* Header and content */}
          <div className="flex flex-col sm:flex-row sm:items-start gap-6 sm:gap-8">
            <img
              src="/images/clock.svg"
              alt="clock icon"
              className="w-20 h-auto mx-auto sm:mx-0 sm:w-24"
            />

            <div className="flex-grow flex flex-col justify-center gap-6 sm:gap-8 text-center sm:text-left">
              <Step step={step} totalSteps={4} />
              <Title
                title="Voting Duration"
                description="Enter the number of days for the voting period."
              />

              {/* Voting Duration Controls */}
              <div className="flex flex-col gap-4 sm:gap-6">
                <p className="leading-4 text-base font-semibold text-primary">
                  Select End Day
                </p>

                <div className="flex flex-col gap-6">
                  <DatePicker
                    selectedDate={selectedDate}
                    onDateChange={setSelectedDate}
                  />

                  <div className="flex flex-col sm:flex-row sm:items-center sm:gap-3 text-sm sm:text-base">
                    <p className="leading-4 text-secondary">
                      Minimum duration:
                    </p>
                    <p className="leading-4 font-semibold text-primary">
                      1 day
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Buttons */}
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-4 sm:gap-6">
            <Button
              type="secondary"
              onClick={() => setStep(step - 1)}
              className="w-full sm:w-auto"
            >
              Back
            </Button>

            <Button
              data-testid="proposal-next"
              onClick={() => {
                try {
                  // Compute hour difference between now and the picked calendar date
                  let diffMs = new Date(selectedDate).getTime() - Date.now();
                  let diffHours = diffMs / (1000 * 60 * 60);

                  // Ensure at least 25 hours of duration
                  if (diffHours < 25) {
                    const corrected = new Date(
                      Date.now() + 25 * 60 * 60 * 1000,
                    );
                    setSelectedDate(corrected);
                    diffMs = corrected.getTime() - Date.now();
                    diffHours = diffMs / (1000 * 60 * 60);
                  }

                  if (diffHours > 30 * 24)
                    throw new Error("Voting duration cannot exceed 30 days");

                  setStep(step + 1);
                } catch (err: any) {
                  console.error(err.message);
                  toast.error("Submit proposal", err.message);
                }
              }}
              className="w-full sm:w-auto"
            >
              Next
            </Button>
          </div>
        </div>
      ) : step == 4 ? (
        <div className="flex flex-col gap-10 md:gap-14">
          {/* Header Section */}
          <div className="flex flex-col sm:flex-row gap-6 sm:gap-8">
            <img
              src="/images/note.svg"
              alt="note icon"
              className="w-20 h-auto mx-auto sm:mx-0 sm:w-24"
            />

            <div className="flex-grow flex flex-col justify-center gap-6 sm:gap-8 text-center sm:text-left">
              <Step step={step} totalSteps={4} />
              <Title
                title="Review and Submit Your Proposal"
                description="Take a moment to review your proposal before submitting. You can go back and make changes if needed."
              />
              {/* Note to the user */}
              <p className="px-3 py-1 text-sm sm:text-base bg-[#F5F1F9] text-primary">
                ℹ️ Creating a proposal requires 5 XLM collateral. This
                collateral is refunded when the proposal is executed.
              </p>
              {/* Buttons for small screens */}
              <div className="flex flex-col-reverse sm:flex-row justify-end gap-4 sm:gap-6">
                <Button
                  type="secondary"
                  onClick={() => setStep(step - 1)}
                  className="w-full sm:w-auto"
                >
                  Back
                </Button>
                <Button
                  onClick={handleRegisterProposal}
                  data-testid="proposal-register"
                  className="w-full sm:w-auto"
                >
                  Register Proposal
                </Button>
              </div>
            </div>
          </div>

          {/* Review Sections */}
          <div className="flex flex-col gap-8 sm:gap-10">
            {/* First Step */}
            <div className="flex flex-col gap-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <p className="text-lg sm:text-xl font-medium text-primary">
                  First Step
                </p>
                <Button
                  type="secondary"
                  size="sm"
                  className="px-3 py-1 text-sm sm:text-base"
                  onClick={() => setStep(1)}
                >
                  Back to the First Step
                </Button>
              </div>
              <Label label="Proposal name">
                <p className="text-lg sm:text-xl text-primary break-words">
                  {proposalName}
                </p>
              </Label>

              <Label label="Proposal description">
                <ExpandableText>{mdText}</ExpandableText>
              </Label>
            </div>

            <div className="h-[1px] bg-[#ECE3F4]" />

            {/* Second Step */}
            <div className="flex flex-col gap-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <p className="text-lg sm:text-xl font-medium text-primary">
                  Second Step
                </p>
                <Button
                  type="secondary"
                  size="sm"
                  className="px-3 py-1 text-sm sm:text-base"
                  onClick={() => setStep(2)}
                >
                  Back to the Second Step
                </Button>
              </div>

              {(() => {
                const stored = Object.entries(
                  storedOutcomes(outcomes).outcomes,
                );
                if (!stored.length) {
                  return (
                    <Label label="Contract Calls">
                      <p className="text-base sm:text-lg text-secondary">
                        None
                      </p>
                    </Label>
                  );
                }
                return stored.map(([kind, node]) => (
                  <div key={kind} className="flex flex-col gap-4">
                    <p
                      className={`text-lg sm:text-xl font-medium text-${kind}`}
                    >
                      {capitalizeFirstLetter(kind)} Outcome
                    </p>
                    <Label label="Description">
                      <ExpandableText>{node.description}</ExpandableText>
                    </Label>
                    {node.execution?.type === "xdr" && (
                      <Label label="XDR Transaction">
                        <p className="text-base sm:text-lg text-primary break-all font-mono">
                          {node.execution.xdr}
                        </p>
                      </Label>
                    )}
                    {node.execution?.contract && (
                      <Label label="Contract Call">
                        <p className="text-base sm:text-lg text-primary break-all font-mono">
                          {node.execution.contract.address}
                        </p>
                        <p className="text-base sm:text-lg text-primary font-mono break-all">
                          {node.execution.contract.execute_fn}(
                          {node.execution.contract.args.join(", ")})
                        </p>
                      </Label>
                    )}
                    {!node.execution && (
                      <Label label="Action">
                        <p className="text-base sm:text-lg text-secondary">
                          No automated action - description only
                        </p>
                      </Label>
                    )}
                  </div>
                ));
              })()}
            </div>

            <div className="h-[1px] bg-[#ECE3F4]" />

            {/* Third Step */}
            <div className="flex flex-col gap-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <p className="text-lg sm:text-xl font-medium text-primary">
                  Third Step
                </p>
                <Button
                  type="secondary"
                  size="sm"
                  className="px-3 py-1 text-sm sm:text-base"
                  onClick={() => setStep(3)}
                >
                  Back to the Third Step
                </Button>
              </div>
              <Label label="Voting End Day">
                <p className="text-base sm:text-lg text-primary">
                  {formatDate(selectedDate.toISOString())}
                </p>
              </Label>
            </div>
          </div>

          {/* Bottom Buttons (repeated for desktop) */}
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-4 sm:gap-6">
            <Button
              type="secondary"
              onClick={() => setStep(step - 1)}
              className="w-full sm:w-auto"
            >
              Back
            </Button>
            <Button
              onClick={handleRegisterProposal}
              data-testid="proposal-register"
              className="w-full sm:w-auto"
            >
              Register Proposal
            </Button>
          </div>
        </div>
      ) : step === 5 &&
        isAnonymousVoting &&
        (!existingAnonConfig || resetAnonKeys) ? (
        <div
          className="flex flex-col gap-10 md:gap-12"
          data-testid="anon-setup-step"
        >
          <div className="flex flex-col sm:flex-row sm:items-start gap-6 sm:gap-8">
            <img
              src="/images/scan.svg"
              alt="scan icon"
              className="w-20 h-auto mx-auto sm:mx-0 sm:w-24"
            />

            <div className="flex-grow flex flex-col gap-4 sm:gap-6 text-center sm:text-left">
              <Step step={1} totalSteps={5} />
              <Title
                title="Configure anonymous voting"
                description="Sign the setup transaction. This enables anonymous voting for this project."
              />

              <p className="text-sm sm:text-base text-secondary">
                Your key file is saved. Sign the setup transaction to use its
                key for this project's anonymous votes.
              </p>

              <div className="flex flex-col sm:flex-row justify-end gap-3 sm:gap-4 mt-4">
                <Button
                  data-testid="sign-setup"
                  disabled={isLoading}
                  onClick={async () => {
                    try {
                      setIsLoading(true);

                      if (!projectName) throw new Error("Project name missing");
                      if (!generatedKeys || !keysConfirmed)
                        throw new Error("The key file is not saved yet");

                      await setupAnonymousVoting(
                        projectName,
                        generatedKeys.publicKey,
                        resetAnonKeys,
                      );

                      setExistingAnonConfig(true);
                      setResetAnonKeys(false);

                      const files = preparedFiles || prepareProposalFiles();
                      await startProposalCreation(files);
                    } catch (e: any) {
                      setError(e.message);
                    } finally {
                      setIsLoading(false);
                    }
                  }}
                  className="w-full sm:w-auto flex items-center justify-center gap-2"
                >
                  {isLoading ? (
                    <div className="absolute inset-0 bg-white flex items-center justify-center z-50">
                      <Loading />
                    </div>
                  ) : (
                    "Sign setup"
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </FlowProgressModal>
  );
};

export default CreateProposalModal;
