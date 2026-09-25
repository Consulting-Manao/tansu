import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState, useRef } from "react";
import { parse } from "smol-toml";
import FlowProgressModal from "components/utils/FlowProgressModal";
import Button from "components/utils/Button";
import Input from "components/utils/Input";
import Step from "components/utils/Step";
import Title from "components/utils/Title";
import MarkdownEditorWithImages, {
  embedImages,
  type AttachedImage,
} from "components/utils/MarkdownEditorWithImages";
import { validateGithubUrl } from "utils/validations";
import { updateConfig } from "@service/ProjectService";
import { thresholdQuery } from "@service/AttestationService";
import { queryClient } from "@service/queryClient";
import {
  DEFAULT_FINALITY_THRESHOLD_PERCENT,
  validateFinalityThresholdPercent,
} from "constants/attestation";
import { extractConfigData } from "utils/utils";
import {
  fetchFromIpfs,
  getIpfsBasicLink,
  ipfsQuery,
} from "utils/ipfsFunctions";
import { isValidCid } from "utils/contentHashes";
import { IpfsMissError } from "utils/ipfsMissCache";
import type { Project } from "../../../../packages/tansu";
import type { ConfigData } from "types/projectConfig";
import {
  getRepositoryProvider,
  getRepositoryProviderLabel,
  type RepositoryProvider,
} from "utils/editLinkFunctions";
import {
  validateFullName,
  validateOrganization,
  writeTansuToml,
} from "utils/tansuToml";
import {
  activeProvider,
  checkMaintainers,
  emptyOrganization,
  handleLabel,
  MaintainerRows,
  OrganizationFields,
  RepositoryFields,
  ThresholdField,
  type MaintainerRow,
} from "./ProjectFields";

/**
 * The images a README shows from its directory, as files for the new one; a
 * file already missing is left out. One that cannot be read stops the update
 * rather than go missing.
 */
async function carriedImages(
  cid: string,
  readme: string,
  already: Set<string>,
): Promise<File[]> {
  const paths = [
    ...readme.matchAll(/!\[[^\]]*\]\((?!https?:\/\/)([^)]+)\)/g),
  ].flatMap(([, path]) => (path && !already.has(path) ? [path] : []));
  const files = await Promise.all(
    [...new Set(paths)].map(async (path) => {
      const response = await fetchFromIpfs(cid, path).catch((error) => {
        if (error instanceof IpfsMissError && error.scope === "path") {
          return null;
        }
        throw new Error(
          `Could not copy the README image ${path}: ${error.message}`,
        );
      });
      if (!response) return null;
      const blob = await response.blob();
      return new File([blob], path, { type: blob.type });
    }),
  );
  return files.filter((file) => file !== null);
}

/**
 * For maintainers: change the project's maintainers and tansu.toml. The form
 * starts from the project's files as they are when the dialog opens, and the
 * update keeps what the form does not edit: it waits for them, a failed read
 * stops it, and so does a change another maintainer made meanwhile.
 */
const UpdateConfigModal = ({ project }: { project: Project }) => {
  const [open, setOpen] = useState(false);
  // The project directory the form was filled from; `null` until it is.
  const [basedOn, setBasedOn] = useState<string | null>(null);
  const [step, setStep] = useState(1);

  // Flow state management
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isSuccessful, setIsSuccessful] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // fields
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
  const readError = [tomlRead, readmeRead, thresholdRead].find(
    (read) => read.isError,
  )?.error;
  const ready =
    tomlKnown &&
    thresholdRead.isSuccess &&
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

  const handleClose = () => {
    readmeImageFiles.forEach((img) => URL.revokeObjectURL(img.localUrl));
    setOpen(false);
    setIsSuccessful(false);
  };

  const nextFromTeam = () => {
    const checked = checkMaintainers(maintainers, handleLabel(provider));
    setMaintainers(checked.rows);
    const urlError = isSoftware ? validateGithubUrl(repositoryUrl) : null;
    setRepositoryUrlError(urlError);
    if (checked.valid && !urlError) setStep(2);
  };

  const nextFromDetails = () => {
    const fullNameError = validateFullName(projectFullName);
    setProjectFullNameError(fullNameError);
    const errors = validateOrganization(org);
    setOrgErrors(errors);
    const thresholdError = validateFinalityThresholdPercent(finalityThreshold);
    setFinalityThresholdError(thresholdError);
    if (!fullNameError && !Object.keys(errors).length && !thresholdError) {
      setStep(3);
    }
  };

  const handleSubmit = async () => {
    setIsLoading(true);
    try {
      if (basedOn === null) {
        throw new Error("The project's files are not loaded");
      }
      // The new tansu.toml, over the current one so its other fields stay.
      const tomlFile = new File(
        [
          writeTansuToml(
            {
              projectType: current.projectType,
              maintainers: maintainers.map((row) => row.address),
              handles: maintainers.map((row) => row.handle),
              fullName: projectFullName,
              ...org,
              repositoryUrl,
              repositoryProvider: provider,
            },
            previousToml ?? {},
            originalRepositoryUrlRef.current,
          ),
        ],
        "tansu.toml",
        { type: "text/plain" },
      );

      const additionalFiles: File[] = [];
      if (!isSoftware) {
        const readme = embedImages(readmeContent, readmeImageFiles);
        const carried = hasFiles
          ? await carriedImages(
              cid,
              readme.text,
              new Set(readme.files.map((file) => file.name)),
            )
          : [];
        additionalFiles.push(
          new File([readme.text], "README.md", { type: "text/markdown" }),
          ...readme.files,
          ...carried,
        );
      }

      await updateConfig(project.name, {
        basedOn,
        tomlFile,
        repositoryUrl,
        maintainers: maintainers.map((row) => row.address),
        onProgress: setStep,
        additionalFiles,
        // Omitted when unchanged: the contract treats `None` as "leave as is".
        ...(finalityThreshold !== originalThresholdRef.current
          ? { attestationThreshold: Number(finalityThreshold) }
          : {}),
      });
      originalThresholdRef.current = finalityThreshold;
      setIsSuccessful(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  };

  const stepLayout = (image: string, body: React.ReactNode) => (
    <div className="flex flex-col md:flex-row items-center gap-6 md:gap-[18px]">
      <img alt="" className="flex-none md:w-1/3 w-[180px]" src={image} />
      <div className="flex flex-col gap-4 w-full md:w-2/3">{body}</div>
    </div>
  );

  return (
    <>
      <button
        className="inline-flex items-center gap-2 px-2 py-1.5 sm:px-3 sm:py-2 min-w-0 flex-1 sm:flex-initial rounded-lg border border-zinc-200 bg-white text-primary text-sm font-medium shadow-[var(--shadow-card)] hover:bg-zinc-50 hover:border-zinc-300 transition-colors cursor-pointer text-left whitespace-nowrap"
        onClick={() => {
          setStep(1);
          setOpen(true);
        }}
      >
        <img src="/icons/gear.svg" className="w-5 h-5 flex-shrink-0" alt="" />
        <span>Update config</span>
      </button>

      {open && (
        <FlowProgressModal
          isOpen={open}
          onClose={handleClose}
          onSuccess={handleClose}
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
          signLabel="project configuration"
          successTitle="Config Updated!"
          successMessage="Project configuration updated successfully."
        >
          {step <= 3 && basedOn === null ? (
            <div className="flex flex-col gap-4">
              {readError ? (
                <div role="alert" className="flex flex-col gap-2 text-red-600">
                  <p>
                    The project's current files could not be read, so the
                    configuration cannot be edited yet: {readError.message}
                  </p>
                  <Button
                    type="secondary"
                    size="sm"
                    onClick={() =>
                      [tomlRead, readmeRead, thresholdRead].forEach(
                        (read) => read.isError && read.refetch(),
                      )
                    }
                  >
                    Retry
                  </Button>
                </div>
              ) : (
                <p className="text-secondary">
                  Loading the project's current files...
                </p>
              )}
            </div>
          ) : step === 1 ? (
            stepLayout(
              "/images/team.svg",
              <>
                <Step step={1} totalSteps={3} />
                <Title
                  title={
                    isSoftware ? "Repository and Maintainers" : "Maintainers"
                  }
                  description={
                    isSoftware
                      ? `Confirm the repository, then update maintainer wallet addresses and ${getRepositoryProviderLabel(provider)} handles.`
                      : "Edit maintainer addresses and public handles"
                  }
                />
                {isSoftware && (
                  <RepositoryFields
                    url={repositoryUrl}
                    provider={chosenProvider}
                    error={repositoryUrlError}
                    onChange={(url, host) => {
                      setRepositoryUrl(url);
                      setChosenProvider(host);
                      setRepositoryUrlError(null);
                    }}
                  />
                )}
                <MaintainerRows
                  rows={maintainers}
                  onChange={setMaintainers}
                  provider={provider}
                />
                <div className="flex justify-end mt-4">
                  <Button onClick={nextFromTeam}>Next</Button>
                </div>
              </>,
            )
          ) : step === 2 ? (
            stepLayout(
              "/images/arrow.svg",
              <>
                <Step step={2} totalSteps={3} />
                <Title
                  title="Project details"
                  description={
                    isSoftware
                      ? "Review project naming, organization details, and supporting metadata."
                      : "Project name, organisation, and README details"
                  }
                />
                <Input
                  label="Project Name (read-only)"
                  value={project.name}
                  description="Project name used for the project (cannot be modified)"
                  disabled
                />
                <Input
                  label="Project Full Name"
                  placeholder="My Awesome Project"
                  value={projectFullName}
                  onChange={(e) => {
                    // Printable ASCII, at most 100 characters.
                    setProjectFullName(
                      e.target.value.replace(/[^\x20-\x7E]/g, "").slice(0, 100),
                    );
                    setProjectFullNameError(null);
                  }}
                  description="Human-readable name shown in the UI (up to 100 ASCII characters)."
                  error={projectFullNameError}
                />
                <OrganizationFields
                  org={org}
                  errors={orgErrors}
                  onChange={(next, field) => {
                    setOrg(next);
                    setOrgErrors(({ [field]: _fixed, ...rest }) => rest);
                  }}
                />
                <ThresholdField
                  value={finalityThreshold}
                  error={finalityThresholdError}
                  onChange={(value) => {
                    setFinalityThreshold(value);
                    setFinalityThresholdError(null);
                  }}
                />
                {!isSoftware && (
                  <div className="flex flex-col gap-3">
                    <p className="text-sm font-medium text-primary">README</p>
                    <MarkdownEditorWithImages
                      value={readmeContent}
                      onChange={setReadmeContent}
                      imageFiles={readmeImageFiles}
                      onImageFilesChange={setReadmeImageFiles}
                      imageError={readmeImageError}
                      onImageErrorChange={setReadmeImageError}
                      placeholder="Write your project README in markdown format..."
                      {...(hasFiles && { imageBaseUrl: getIpfsBasicLink(cid) })}
                    />
                  </div>
                )}
                <div className="flex justify-between mt-4">
                  <Button type="secondary" onClick={() => setStep(1)}>
                    Back
                  </Button>
                  <Button onClick={nextFromDetails}>Next</Button>
                </div>
              </>,
            )
          ) : (
            step === 3 && (
              <div>
                <Step step={3} totalSteps={3} />
                <Title title="Review" description="Confirm and update" />
                <p className="mb-4">
                  A new tansu.toml will be generated and stored on IPFS.
                </p>
                {previousToml === null && (
                  <p role="alert" className="mb-4 text-red-600">
                    The current tansu.toml is not valid TOML: only the values of
                    this form will be kept.
                  </p>
                )}
                <div className="flex justify-between">
                  <Button type="secondary" onClick={() => setStep(2)}>
                    Back
                  </Button>
                  <Button isLoading={isLoading} onClick={handleSubmit}>
                    Update Config
                  </Button>
                </div>
              </div>
            )
          )}
        </FlowProgressModal>
      )}
    </>
  );
};

export default UpdateConfigModal;
