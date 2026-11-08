import { useEffect, useRef, useState } from "react";
import {
  NO_CALL,
  OutcomeCallError,
  prepareOutcomeCall,
} from "@service/ContractIntrospectionService";
import {
  embedImages,
  type AttachedImage,
} from "components/utils/MarkdownEditorWithImages";
import {
  OUTCOMES,
  outcomeSlots,
  storedOutcomes,
  type Outcome,
  type OutcomeDrafts,
} from "utils/proposalOutcomes";
import { validateProposalName, validateTextContent } from "utils/validations";
import { useAnonymousKeySetup } from "./AnonymousKeySetup";

const HOUR_MS = 60 * 60 * 1000;

/** The last moment of `day`: the vote runs through the day picked. */
export function endOfDay(day: Date): Date {
  const end = new Date(day);
  end.setHours(23, 59, 59, 0);
  return end;
}

/** Two days from now, to comfortably exceed the 24 h minimum. */
function defaultEndDay(): Date {
  const day = new Date();
  day.setDate(day.getDate() + 2);
  return endOfDay(day);
}

export type OutcomeErrors = Partial<
  Record<Outcome, { message: string; args: number[] }>
>;

/**
 * A proposal being written: its fields, the checks each step runs before the
 * next, and the files and calls it is created with. It lives as long as the
 * wizard, so a draft survives closing the dialog.
 */
export function useProposalDraft(projectName: string) {
  const [proposalName, setProposalName] = useState("");
  const [proposalNameError, setProposalNameError] = useState<string | null>(
    null,
  );
  const [mdText, setMdText] = useState("");
  const [descriptionError, setDescriptionError] = useState<string | null>(null);
  const [imageFiles, setImageFiles] = useState<AttachedImage[]>([]);
  const [imageError, setImageError] = useState<string | null>(null);
  // The outcomes the author added, by kind; a removed one is absent.
  const [outcomes, setOutcomes] = useState<OutcomeDrafts>({});
  // Outcome calls that failed their check on Next, with what to highlight.
  const [outcomeErrors, setOutcomeErrors] = useState<OutcomeErrors>({});
  const [selectedDate, setSelectedDate] = useState(defaultEndDay);
  const [votingType, setVotingType] = useState<"badge" | "token">("badge");
  const [tokenContract, setTokenContract] = useState("");
  const anonymous = useAnonymousKeySetup(projectName);

  // The images' object URLs are revoked when the wizard unmounts, not when
  // it closes: the description still points at them (issue #177).
  const imageFilesRef = useRef<AttachedImage[]>([]);
  useEffect(() => {
    imageFilesRef.current = imageFiles;
  }, [imageFiles]);
  useEffect(
    () => () =>
      imageFilesRef.current.forEach((img) => URL.revokeObjectURL(img.localUrl)),
    [],
  );

  const checkTokenContract = () => {
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

  /** The first step's fields; throws what is missing. */
  const checkBasics = () => {
    const nameError = validateProposalName(proposalName);
    setProposalNameError(nameError);
    const textError = validateTextContent(mdText, 10, "Proposal description");
    setDescriptionError(textError);
    if (nameError || textError) {
      throw new Error("Invalid proposal name or description");
    }
    if (anonymous.needsSetup && !anonymous.saved) {
      throw new Error(
        "Download the anonymous key file and select it to confirm you saved it.",
      );
    }
    checkTokenContract();
  };

  /**
   * Run every outcome call as `execute` will, marking the ones that fail;
   * throws the first failure. Creating the proposal checks them again.
   */
  const checkOutcomeCalls = async () => {
    const slots = outcomeSlots(outcomes) ?? [];
    const failures = await Promise.all(
      OUTCOMES.map(async (kind, i) => {
        const call = slots[i];
        if (!call) return undefined;
        try {
          await prepareOutcomeCall(call);
          return undefined;
        } catch (err) {
          return { kind, err };
        }
      }),
    );
    const failed = failures.filter((f) => f !== undefined);
    setOutcomeErrors(
      Object.fromEntries(
        failed.map(({ kind, err }) => [
          kind,
          {
            message: (err as Error).message,
            args: err instanceof OutcomeCallError ? err.args : [],
          },
        ]),
      ),
    );
    if (failed[0]) {
      throw new Error(
        `Invalid ${failed[0].kind} outcome: ${(failed[0].err as Error).message}`,
      );
    }
  };

  /** The vote's end: at least 25 hours away; throws past 30 days. */
  const checkSchedule = () => {
    const minimum = Date.now() + 25 * HOUR_MS;
    if (selectedDate.getTime() < minimum) setSelectedDate(new Date(minimum));
    else if (selectedDate.getTime() - Date.now() > 30 * 24 * HOUR_MS)
      throw new Error("Voting duration cannot exceed 30 days");
  };

  /** outcomes.json, the description and its images. */
  const files = (): File[] => {
    const description = embedImages(mdText, imageFiles);
    return [
      new File([JSON.stringify(storedOutcomes(outcomes))], "outcomes.json"),
      ...description.files,
      new File([description.text], "proposal.md"),
    ];
  };

  /** What `create_proposal` takes besides the files. */
  const submission = async () => {
    checkTokenContract();
    let targetTs = selectedDate.getTime();
    if (!isFinite(targetTs) || targetTs <= 0) {
      throw new Error(`Invalid voting end date: ${selectedDate}`);
    }
    targetTs = Math.max(
      Date.now() + 25 * HOUR_MS,
      Math.min(Date.now() + 30 * 24 * HOUR_MS, targetTs),
    );
    // Each call in its outcome's slot, typed and dry-run as the executor
    // makes it; a gap gets a call that changes nothing.
    const slots = outcomeSlots(outcomes);
    const outcomeContracts =
      slots &&
      (await Promise.all(
        slots.map((call) => (call ? prepareOutcomeCall(call) : NO_CALL)),
      ));
    return {
      proposalName,
      votingEndsAt: Math.floor(targetTs / 1000),
      publicVoting: !anonymous.enabled,
      outcomeContracts,
      ...(votingType === "token"
        ? { tokenContract: tokenContract.trim() }
        : {}),
    };
  };

  /** A submitted proposal leaves no draft to submit twice. */
  const reset = () => {
    imageFiles.forEach((img) => URL.revokeObjectURL(img.localUrl));
    setImageFiles([]);
    setProposalName("");
    setMdText("");
    setOutcomes({});
    setOutcomeErrors({});
    setSelectedDate(defaultEndDay());
    anonymous.reset();
    setVotingType("badge");
    setTokenContract("");
  };

  return {
    proposalName,
    setProposalName,
    proposalNameError,
    setProposalNameError,
    mdText,
    setMdText,
    descriptionError,
    setDescriptionError,
    imageFiles,
    setImageFiles,
    imageError,
    setImageError,
    outcomes,
    setOutcomes,
    outcomeErrors,
    setOutcomeErrors,
    selectedDate,
    setSelectedDate,
    votingType,
    setVotingType,
    tokenContract,
    setTokenContract,
    anonymous,
    checkBasics,
    checkOutcomeCalls,
    checkSchedule,
    files,
    submission,
    reset,
  };
}

export type ProposalDraft = ReturnType<typeof useProposalDraft>;
