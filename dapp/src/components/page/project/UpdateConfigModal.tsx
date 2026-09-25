import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState, useRef } from "react";
import { parse } from "smol-toml";
import FlowProgressModal from "components/utils/FlowProgressModal";
import Button from "components/utils/Button";
import Input from "components/utils/Input";
import Textarea from "components/utils/Textarea";
import Step from "components/utils/Step";
import Title from "components/utils/Title";
import MarkdownEditorWithImages, {
  type AttachedImage,
} from "components/utils/MarkdownEditorWithImages";
import {
  validateMaintainerAddress,
  validateGithubUrl,
} from "utils/validations";
import { updateConfig } from "@service/ProjectService";
import { thresholdQuery } from "@service/AttestationService";
import { queryClient } from "@service/queryClient";
import {
  DEFAULT_FINALITY_THRESHOLD_PERCENT,
  MAX_FINALITY_THRESHOLD_PERCENT,
  MIN_FINALITY_THRESHOLD_PERCENT,
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
  getRepositoryHandleLabel,
  getRepositoryHandlePlaceholder,
  getRepositoryProvider,
  getRepositoryProviderLabel,
  getRepositoryUrlPlaceholder,
  SUPPORTED_REPOSITORY_PROVIDERS,
  type RepositoryProvider,
} from "utils/editLinkFunctions";
import {
  validateFullName,
  validateHandle,
  validateOrganization,
  writeTansuToml,
} from "utils/tansuToml";

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
  const [ipfsBaseUrl, setIpfsBaseUrl] = useState<string | undefined>(undefined);
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);

  // Flow state management
  const [isUploading, setIsUploading] = useState(false);
  const [isSuccessful, setIsSuccessful] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // fields
  const [maintainerAddresses, setMaintainerAddresses] = useState<string[]>([
    "",
  ]);
  const [maintainerGithubs, setMaintainerGithubs] = useState<string[]>([""]);
  const [githubRepoUrl, setGithubRepoUrl] = useState("");
  const [selectedRepositoryProvider, setSelectedRepositoryProvider] =
    useState<RepositoryProvider>("github");
  const [projectFullName, setProjectFullName] = useState("");
  const [projectName, setProjectName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [orgUrl, setOrgUrl] = useState("");
  const [orgLogo, setOrgLogo] = useState("");
  const [orgDescription, setOrgDescription] = useState("");
  const [finalityThreshold, setFinalityThreshold] = useState("");
  const originalThresholdRef = useRef("");
  const [readmeContent, setReadmeContent] = useState("");
  const [readmeImageFiles, setReadmeImageFiles] = useState<AttachedImage[]>([]);
  const [readmeImageError, setReadmeImageError] = useState<string | null>(null);
  const originalRepositoryUrlRef = useRef("");

  // errors
  const [addrErrors, setAddrErrors] = useState<(string | null)[]>([null]);
  const [ghErrors, setGhErrors] = useState<(string | null)[]>([null]);
  const [repoError, setRepoError] = useState<string | null>(null);
  const [projectFullNameError, setProjectFullNameError] = useState<
    string | null
  >(null);
  const [finalityThresholdError, setFinalityThresholdError] = useState<
    string | null
  >(null);
  const [orgErrors, setOrgErrors] = useState<
    ReturnType<typeof validateOrganization>
  >({});
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
  const isSoftwareProject = current.projectType === "SOFTWARE";
  const readmeRead = useQuery(
    {
      ...ipfsQuery(cid, "/README.md"),
      enabled: open && hasFiles && tomlKnown && !isSoftwareProject,
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
    (isSoftwareProject || !hasFiles || readmeRead.isSuccess);

  const parsedRepositoryProvider = getRepositoryProvider(githubRepoUrl);
  const activeRepositoryProvider = isSoftwareProject
    ? parsedRepositoryProvider || selectedRepositoryProvider
    : undefined;
  const repositoryProviderLabel = getRepositoryProviderLabel(
    activeRepositoryProvider,
  );
  const repositoryHandleLabel = isSoftwareProject
    ? getRepositoryHandleLabel(activeRepositoryProvider)
    : "Maintainer Handle";
  const repositoryHandlePlaceholder = getRepositoryHandlePlaceholder(
    activeRepositoryProvider,
  );
  const repositoryUrlPlaceholder = getRepositoryUrlPlaceholder(
    activeRepositoryProvider,
  );

  useEffect(() => {
    if (!open) {
      setBasedOn(null);
      return;
    }
    if (basedOn !== null || !ready) return;
    setBasedOn(cid);
    setIpfsBaseUrl(hasFiles ? getIpfsBasicLink(cid) : undefined);
    setMaintainerAddresses(project.maintainers);
    setMaintainerGithubs(
      project.maintainers.map((address) => current.handles[address] ?? ""),
    );
    const repositoryUrl = current.officials.githubLink || project.config.url;
    originalRepositoryUrlRef.current = repositoryUrl;
    setGithubRepoUrl(repositoryUrl);
    setSelectedRepositoryProvider(
      getRepositoryProvider(repositoryUrl) || "github",
    );
    setProjectName(project.name);
    setProjectFullName(current.projectFullName || project.name);
    setOrgName(current.organizationName);
    setOrgUrl(current.officials.websiteLink);
    setOrgLogo(current.logoImageLink);
    setOrgDescription(current.description);
    const threshold = String(
      thresholdRead.data || DEFAULT_FINALITY_THRESHOLD_PERCENT,
    );
    originalThresholdRef.current = threshold;
    setFinalityThreshold(threshold);
    setReadmeContent(readmeRead.data ?? "");
    setAddrErrors(project.maintainers.map(() => null));
    setGhErrors(project.maintainers.map(() => null));
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

  // validation helpers
  const validateMaintainers = () => {
    let ok = true;
    const newAddrErr = maintainerAddresses.map((a) => {
      const e = validateMaintainerAddress(a);
      if (e) ok = false;
      return e;
    });
    const newGhErr = maintainerGithubs.map((h) => {
      const e = validateHandle(h, repositoryHandleLabel);
      if (e) ok = false;
      return e;
    });
    setAddrErrors(newAddrErr);
    setGhErrors(newGhErr);
    return ok;
  };

  const validateRepo = () => {
    const e = validateGithubUrl(githubRepoUrl);
    setRepoError(e);
    return e === null;
  };

  const validateProjectFullName = (): boolean => {
    const dbaError = validateFullName(projectFullName);
    setProjectFullNameError(dbaError);
    return dbaError === null;
  };

  /** The new tansu.toml, over the current one so its other fields stay. */
  const buildToml = (): string =>
    writeTansuToml(
      {
        projectType: current.projectType,
        maintainers: maintainerAddresses,
        handles: maintainerGithubs,
        fullName: projectFullName,
        orgName,
        orgUrl,
        orgLogo,
        orgDescription,
        repositoryUrl: githubRepoUrl,
        repositoryProvider: activeRepositoryProvider,
      },
      previousToml ?? {},
      originalRepositoryUrlRef.current,
    );

  const handleSubmit = async () => {
    setIsLoading(true);
    try {
      if (basedOn === null) {
        throw new Error("The project's files are not loaded");
      }
      const tomlContent = buildToml();
      const tomlFile = new File([tomlContent], "tansu.toml", {
        type: "text/plain",
      });

      const additionalFiles: File[] = [];
      if (!isSoftwareProject) {
        let readmeToSave = readmeContent;
        const imageFilesToInclude: File[] = [];
        readmeImageFiles.forEach((img) => {
          if (readmeToSave.includes(img.localUrl)) {
            readmeToSave = readmeToSave.replace(
              new RegExp(
                img.localUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
                "g",
              ),
              img.publicUrl,
            );
            imageFilesToInclude.push(
              new File([img.source], img.publicUrl, { type: img.source.type }),
            );
          }
        });
        // The images the README already had move to the new directory; one
        // that cannot be read stops the update rather than go missing.
        if (hasFiles) {
          const handledPaths = new Set(imageFilesToInclude.map((f) => f.name));
          const relativeImgRegex = /!\[([^\]]*)\]\((?!https?:\/\/)([^)]+)\)/g;
          const matches = [...readmeToSave.matchAll(relativeImgRegex)];
          await Promise.all(
            matches.map(async (match) => {
              const relativePath = match[2];
              if (!relativePath || handledPaths.has(relativePath)) return;
              handledPaths.add(relativePath);
              const response = await fetchFromIpfs(cid, relativePath).catch(
                (error) => {
                  // Missing already: there is nothing to lose.
                  if (error instanceof IpfsMissError && error.scope === "path")
                    return null;
                  throw new Error(
                    `Could not copy the README image ${relativePath}: ${error.message}`,
                  );
                },
              );
              if (!response) return;
              const blob = await response.blob();
              imageFilesToInclude.push(
                new File([blob], relativePath, { type: blob.type }),
              );
            }),
          );
        }

        additionalFiles.push(
          new File([readmeToSave], "README.md", { type: "text/markdown" }),
        );
        additionalFiles.push(...imageFilesToInclude);
      }

      await updateConfig(project.name, {
        basedOn,
        tomlFile,
        repositoryUrl: githubRepoUrl,
        maintainers: maintainerAddresses,
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

  const handleNextFromStep2 = () => {
    const isDbaValid = validateProjectFullName();
    const errors = validateOrganization({
      orgName,
      orgUrl,
      orgLogo,
      orgDescription,
    });
    setOrgErrors(errors);

    const thresholdError = validateFinalityThresholdPercent(finalityThreshold);
    setFinalityThresholdError(thresholdError);

    if (isDbaValid && Object.keys(errors).length === 0 && !thresholdError) {
      setStep(3);
    }
  };

  const handleNextFromStep1 = () => {
    const maintainersAreValid = validateMaintainers();
    const repoIsValid = isSoftwareProject ? validateRepo() : true;

    if (maintainersAreValid && repoIsValid) {
      setStep(2);
    }
  };

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
          {step <= 3 && basedOn === null && (
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
          )}
          {step <= 3 && basedOn !== null && (
            <div className="flex flex-col gap-8">
              {step === 1 && (
                <div className="flex flex-col md:flex-row items-center gap-6 md:gap-[18px]">
                  <img
                    className="flex-none md:w-1/3 w-[180px]"
                    src="/images/team.svg"
                  />
                  <div className="flex flex-col gap-4 w-full md:w-2/3">
                    <Step step={1} totalSteps={3} />
                    <Title
                      title={
                        isSoftwareProject
                          ? "Repository and Maintainers"
                          : "Maintainers"
                      }
                      description={
                        isSoftwareProject
                          ? `Confirm the repository provider or URL first, then update maintainer wallet addresses and ${activeRepositoryProvider === "radicle" ? "Radicle aliases" : `${repositoryProviderLabel} handles`}.`
                          : "Edit maintainer addresses and public handles"
                      }
                    />
                    {isSoftwareProject && (
                      <div className="flex flex-col gap-4 mb-4">
                        <div className="flex flex-col gap-3">
                          <div className="leading-4 text-base text-secondary">
                            Repository Provider
                          </div>
                          <select
                            value={
                              activeRepositoryProvider ||
                              selectedRepositoryProvider
                            }
                            onChange={(e) =>
                              setSelectedRepositoryProvider(
                                e.target.value as RepositoryProvider,
                              )
                            }
                            className="p-[18px] border border-[#978AA1] outline-none bg-white"
                          >
                            {SUPPORTED_REPOSITORY_PROVIDERS.map((provider) => (
                              <option key={provider} value={provider}>
                                {getRepositoryProviderLabel(provider)}
                              </option>
                            ))}
                          </select>
                        </div>

                        <Input
                          label={`${repositoryProviderLabel} Repository URL`}
                          placeholder={repositoryUrlPlaceholder}
                          value={githubRepoUrl}
                          onChange={(e) => {
                            const nextValue = e.target.value;
                            setGithubRepoUrl(nextValue);
                            setRepoError(null);

                            const parsedProvider =
                              getRepositoryProvider(nextValue);
                            if (parsedProvider) {
                              setSelectedRepositoryProvider(parsedProvider);
                            }
                          }}
                          description={
                            activeRepositoryProvider === "radicle"
                              ? "Paste the full Radicle node URL when possible, e.g. https://radicle.network/nodes/iris.radicle.network/rad:z3gqc.... If only rad:... is provided, Tansu will use the default seed."
                              : `Paste an HTTPS or SSH URL for ${repositoryProviderLabel}. The provider selector updates automatically when the URL is recognized.`
                          }
                          error={repoError || undefined}
                        />
                      </div>
                    )}
                    {maintainerAddresses.map((addr, i) => (
                      <div key={i} className="flex items-end gap-3 mb-3">
                        <Input
                          label={
                            i === 0 ? "Maintainer Wallet Address" : undefined
                          }
                          value={addr ?? ""}
                          error={addrErrors[i] || undefined}
                          onChange={(e) => {
                            const v = [...maintainerAddresses];
                            v[i] = e.target.value;
                            setMaintainerAddresses(v);
                          }}
                        />
                        <Input
                          label={i === 0 ? repositoryHandleLabel : undefined}
                          placeholder={repositoryHandlePlaceholder}
                          value={maintainerGithubs[i] ?? ""}
                          error={ghErrors[i] || undefined}
                          onChange={(e) => {
                            const v = [...maintainerGithubs];
                            v[i] = e.target.value;
                            setMaintainerGithubs(v);
                          }}
                        />
                        {maintainerAddresses.length > 1 && (
                          <Button
                            type="tertiary"
                            size="sm"
                            aria-label={`Remove maintainer ${i + 1}`}
                            onClick={() => {
                              const without = <T,>(list: T[]) =>
                                list.filter((_, j) => j !== i);
                              setMaintainerAddresses(without);
                              setMaintainerGithubs(without);
                              setAddrErrors(without);
                              setGhErrors(without);
                            }}
                          >
                            Remove
                          </Button>
                        )}
                      </div>
                    ))}
                    <Button
                      type="tertiary"
                      onClick={() => {
                        setMaintainerAddresses([...maintainerAddresses, ""]);
                        setMaintainerGithubs([...maintainerGithubs, ""]);
                        setAddrErrors([...addrErrors, null]);
                        setGhErrors([...ghErrors, null]);
                      }}
                    >
                      Add Maintainer
                    </Button>
                    <div className="flex justify-end mt-4">
                      <Button onClick={handleNextFromStep1}>Next</Button>
                    </div>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="flex flex-col md:flex-row items-center gap-6 md:gap-[18px]">
                  <img
                    className="flex-none md:w-1/3 w-[180px]"
                    src="/images/arrow.svg"
                  />
                  <div className="flex flex-col gap-4 w-full md:w-2/3">
                    <Step step={2} totalSteps={3} />
                    <Title
                      title="Project details"
                      description={
                        isSoftwareProject
                          ? "Review project naming, organization details, and supporting metadata. Repository details were handled in the previous step."
                          : "Project name, organisation, and README details"
                      }
                    />

                    <Input
                      label="Project Name (read-only)"
                      value={projectName}
                      description="Project name used for the project (cannot be modified)"
                      disabled
                    />

                    <Input
                      label="Project Full Name"
                      placeholder="My Awesome Project"
                      value={projectFullName}
                      onChange={(e) => {
                        const sanitized = e.target.value.replace(
                          /[^\x20-\x7E]/g,
                          "",
                        );
                        setProjectFullName(sanitized.slice(0, 100));
                        setProjectFullNameError(null);
                      }}
                      description="Human-readable name shown in the UI (up to 100 ASCII characters)."
                      error={projectFullNameError || undefined}
                    />

                    <Input
                      label="Organisation name"
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                      error={orgErrors.orgName}
                    />
                    <Input
                      label="Organisation URL"
                      value={orgUrl}
                      onChange={(e) => setOrgUrl(e.target.value)}
                      error={orgErrors.orgUrl}
                    />
                    <Input
                      label="Logo URL"
                      value={orgLogo}
                      onChange={(e) => setOrgLogo(e.target.value)}
                      error={orgErrors.orgLogo}
                    />
                    <Textarea
                      label="Description"
                      value={orgDescription}
                      onChange={(e) => setOrgDescription(e.target.value)}
                      error={orgErrors.orgDescription}
                    />
                    <Input
                      label="Finality threshold (%)"
                      type="number"
                      min={MIN_FINALITY_THRESHOLD_PERCENT}
                      max={MAX_FINALITY_THRESHOLD_PERCENT}
                      value={finalityThreshold}
                      onChange={(e) => {
                        setFinalityThreshold(e.target.value);
                        setFinalityThresholdError(null);
                      }}
                      description={`Percent of maintainers who must attest a commit for it to be final. Between ${MIN_FINALITY_THRESHOLD_PERCENT} and ${MAX_FINALITY_THRESHOLD_PERCENT}.`}
                      error={finalityThresholdError || undefined}
                    />

                    {!isSoftwareProject && (
                      <div className="flex flex-col gap-3">
                        <label className="text-sm font-medium text-primary">
                          README
                        </label>
                        <MarkdownEditorWithImages
                          value={readmeContent}
                          onChange={setReadmeContent}
                          imageFiles={readmeImageFiles}
                          onImageFilesChange={setReadmeImageFiles}
                          imageError={readmeImageError}
                          onImageErrorChange={setReadmeImageError}
                          placeholder="Write your project README in markdown format..."
                          {...(ipfsBaseUrl !== undefined && {
                            imageBaseUrl: ipfsBaseUrl,
                          })}
                        />
                      </div>
                    )}

                    <div className="flex justify-between mt-4">
                      <Button type="secondary" onClick={() => setStep(1)}>
                        Back
                      </Button>
                      <Button onClick={handleNextFromStep2}>Next</Button>
                    </div>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div>
                  <Step step={3} totalSteps={3} />
                  <Title title="Review" description="Confirm and update" />
                  <p className="mb-4">
                    A new tansu.toml will be generated and stored on IPFS.
                  </p>
                  {previousToml === null && (
                    <p role="alert" className="mb-4 text-red-600">
                      The current tansu.toml is not valid TOML: only the values
                      of this form will be kept.
                    </p>
                  )}
                  <div className="flex justify-between">
                    <Button type="secondary" onClick={() => setStep(2)}>
                      Back
                    </Button>
                    <Button
                      isLoading={isLoading}
                      disabled={basedOn === null || isLoading}
                      onClick={handleSubmit}
                    >
                      Update Config
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </FlowProgressModal>
      )}
    </>
  );
};

export default UpdateConfigModal;
