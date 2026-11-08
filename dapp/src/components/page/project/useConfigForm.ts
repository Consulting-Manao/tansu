import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { parse } from "smol-toml";
import { thresholdQuery } from "@service/AttestationService";
import {
  governanceActivation,
  governanceQuery,
} from "@service/ProposalService";
import { queryClient } from "@service/queryClient";
import type { AttachedImage } from "components/utils/MarkdownEditorWithImages";
import { DEFAULT_FINALITY_THRESHOLD_PERCENT } from "constants/attestation";
import type { ConfigData } from "types/projectConfig";
import { isValidCid } from "utils/contentHashes";
import {
  getRepositoryProvider,
  type RepositoryProvider,
} from "utils/editLinkFunctions";
import { ipfsQuery } from "utils/ipfsFunctions";
import type { validateOrganization } from "utils/tansuToml";
import { extractConfigData } from "utils/utils";
import type { Project } from "../../../../packages/tansu";
import {
  activeProvider,
  emptyOrganization,
  validateGovernanceHours,
  type MaintainerRow,
} from "./ProjectFields";

/**
 * The update-config form: its fields, filled once from the project's files
 * as they are when the dialog opens (`basedOn` is that directory, `null`
 * until it is read), and what a change of governance timing would do.
 */
export function useConfigForm(project: Project, open: boolean) {
  // The project directory the form was filled from; `null` until it is.
  const [basedOn, setBasedOn] = useState<string | null>(null);
  const [maintainers, setMaintainers] = useState<MaintainerRow[]>([]);
  const [repositoryUrl, setRepositoryUrl] = useState("");
  const [chosenProvider, setChosenProvider] =
    useState<RepositoryProvider>("github");
  const [repositoryUrlError, setRepositoryUrlError] = useState<string | null>(
    null,
  );
  const [projectFullName, setProjectFullName] = useState("");
  const [projectFullNameError, setProjectFullNameError] = useState<
    string | null
  >(null);
  const [org, setOrg] = useState(emptyOrganization);
  const [orgErrors, setOrgErrors] = useState<
    ReturnType<typeof validateOrganization>
  >({});
  const [finalityThreshold, setFinalityThreshold] = useState("");
  const [finalityThresholdError, setFinalityThresholdError] = useState<
    string | null
  >(null);
  const originalThresholdRef = useRef("");
  const [timing, setTiming] = useState({ votingPeriod: "", executeDelay: "" });
  const [timingErrors, setTimingErrors] = useState<{
    votingPeriod?: string | null;
    executeDelay?: string | null;
  }>({});
  const originalTimingRef = useRef(timing);
  const originalRepositoryUrlRef = useRef("");
  const [readmeContent, setReadmeContent] = useState("");
  const [readmeImageFiles, setReadmeImageFiles] = useState<AttachedImage[]>([]);
  const [readmeImageError, setReadmeImageError] = useState<string | null>(null);

  const cid = project.config.ipfs;
  const hasFiles = isValidCid(cid);
  const tomlRead = useQuery(
    { ...ipfsQuery(cid, "/tansu.toml"), enabled: open && hasFiles },
    queryClient,
  );
  /** The current tansu.toml; `null` when it is not valid TOML. */
  const previousToml = useMemo(() => {
    try {
      return tomlRead.data ? parse(tomlRead.data) : {};
    } catch {
      return null;
    }
  }, [tomlRead.data]);
  const current = useMemo(
    () => extractConfigData(previousToml ?? {}, project) as ConfigData,
    [previousToml, project],
  );
  const tomlKnown = !hasFiles || tomlRead.isSuccess;
  const isSoftware = current.projectType === "SOFTWARE";
  const readmeRead = useQuery(
    {
      ...ipfsQuery(cid, "/README.md"),
      enabled: open && hasFiles && tomlKnown && !isSoftware,
    },
    queryClient,
  );
  const thresholdRead = useQuery(
    { ...thresholdQuery(project.name), enabled: open },
    queryClient,
  );
  const governanceRead = useQuery(
    { ...governanceQuery(project.name), enabled: open },
    queryClient,
  );
  const reads = [tomlRead, readmeRead, thresholdRead, governanceRead];
  const readError = reads.find((read) => read.isError)?.error;
  const ready =
    tomlKnown &&
    thresholdRead.isSuccess &&
    governanceRead.isSuccess &&
    (isSoftware || !hasFiles || readmeRead.isSuccess);

  const provider = isSoftware
    ? activeProvider(repositoryUrl, chosenProvider)
    : undefined;

  useEffect(() => {
    if (!open) {
      setBasedOn(null);
      return;
    }
    if (basedOn !== null || !ready) return;
    setBasedOn(cid);
    setMaintainers(
      project.maintainers.map((address) => ({
        address,
        handle: current.handles[address] ?? "",
      })),
    );
    const url = current.officials.githubLink || project.config.url;
    originalRepositoryUrlRef.current = url;
    setRepositoryUrl(url);
    setChosenProvider(getRepositoryProvider(url) || "github");
    setProjectFullName(current.projectFullName || project.name);
    setOrg({
      orgName: current.organizationName,
      orgUrl: current.officials.websiteLink,
      orgLogo: current.logoImageLink,
      orgDescription: current.description,
    });
    const threshold = String(
      thresholdRead.data || DEFAULT_FINALITY_THRESHOLD_PERCENT,
    );
    originalThresholdRef.current = threshold;
    setFinalityThreshold(threshold);
    const hours = (seconds: number) => String(Math.round(seconds / 3600));
    const currentTiming = {
      votingPeriod: hours(governanceRead.data!.timing.minVotingPeriod),
      executeDelay: hours(governanceRead.data!.timing.executeDelay),
    };
    originalTimingRef.current = currentTiming;
    setTiming(currentTiming);
    setTimingErrors({});
    setReadmeContent(readmeRead.data ?? "");
  }, [open, ready]);

  // On open: no images attached yet.
  useEffect(() => {
    if (!open) return;
    setReadmeImageFiles((prev) => {
      prev.forEach((img) => URL.revokeObjectURL(img.localUrl));
      return [];
    });
    setReadmeImageError(null);
  }, [open]);

  const timingChanged = {
    votingPeriod:
      timing.votingPeriod !== originalTimingRef.current.votingPeriod,
    executeDelay:
      timing.executeDelay !== originalTimingRef.current.executeDelay,
  };
  const timingNotice = (() => {
    const current = governanceRead.data;
    if (!current) return null;
    const lines: string[] = [];
    if (current.pending) {
      lines.push(
        `A looser timing is pending and applies on ${new Date(current.pending.activatesAt * 1000).toLocaleString()}.`,
      );
    }
    const valid = (field: "votingPeriod" | "executeDelay") =>
      !timingChanged[field] || !validateGovernanceHours(timing[field]);
    if (
      (timingChanged.votingPeriod || timingChanged.executeDelay) &&
      valid("votingPeriod") &&
      valid("executeDelay")
    ) {
      const now = Math.floor(Date.now() / 1000);
      const seconds = (
        field: "votingPeriod" | "executeDelay",
        stored: number,
      ) => (timingChanged[field] ? Number(timing[field]) * 3600 : stored);
      const activatesAt = governanceActivation(
        current.timing,
        {
          minVotingPeriod: seconds(
            "votingPeriod",
            current.timing.minVotingPeriod,
          ),
          executeDelay: seconds("executeDelay", current.timing.executeDelay),
        },
        now,
      );
      lines.push(
        activatesAt === now
          ? "The new timing is stricter: it applies as soon as the update lands."
          : `The new timing is looser: it applies around ${new Date(activatesAt * 1000).toLocaleString()}, once proposals opened under the current timing are through.`,
      );
    }
    return lines.length ? lines.join(" ") : null;
  })();

  return {
    basedOn,
    maintainers,
    setMaintainers,
    repositoryUrl,
    setRepositoryUrl,
    chosenProvider,
    setChosenProvider,
    repositoryUrlError,
    setRepositoryUrlError,
    projectFullName,
    setProjectFullName,
    projectFullNameError,
    setProjectFullNameError,
    org,
    setOrg,
    orgErrors,
    setOrgErrors,
    finalityThreshold,
    setFinalityThreshold,
    finalityThresholdError,
    setFinalityThresholdError,
    originalThresholdRef,
    timing,
    setTiming,
    timingErrors,
    setTimingErrors,
    originalTimingRef,
    originalRepositoryUrlRef,
    readmeContent,
    setReadmeContent,
    readmeImageFiles,
    setReadmeImageFiles,
    readmeImageError,
    setReadmeImageError,
    cid,
    hasFiles,
    previousToml,
    current,
    isSoftware,
    reads,
    readError,
    provider,
    timingChanged,
    timingNotice,
  };
}
