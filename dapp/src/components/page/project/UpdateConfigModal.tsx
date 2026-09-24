import { useEffect, useState, useRef } from "react";
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
import { toast } from "utils/utils";
import { getIpfsBasicLink, ipfsQuery } from "utils/ipfsFunctions";
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
import toml from "toml";
import {
  validateFullName,
  validateHandle,
  validateOrganization,
  writeTansuToml,
} from "utils/tansuToml";

/** A file of the project's IPFS directory; `null` when it cannot be read. */
const readIpfsFile = (cid: string, path: string) =>
  queryClient.query(ipfsQuery(cid, path)).catch(() => null);

/** For maintainers: change the project's maintainers and tansu.toml. */
const UpdateConfigModal = ({
  project,
  config,
  isSoftware: isSoftwareProject,
}: {
  project: Project;
  config: ConfigData;
  isSoftware: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const [ipfsBaseUrl, setIpfsBaseUrl] = useState<string | undefined>(undefined);
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);

  // Flow state management
  const [isUploading, setIsUploading] = useState(false);
  const [isSuccessful, setIsSuccessful] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Holds the raw parsed existing TOML so we can merge into it on submit
  const existingTomlRef = useRef<Record<string, any> | null>(null);

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

  const loadThreshold = async (name: string) => {
    if (!name) return;
    const value = await queryClient
      .query(thresholdQuery(name))
      .catch(() => DEFAULT_FINALITY_THRESHOLD_PERCENT);
    const resolved = String(value || DEFAULT_FINALITY_THRESHOLD_PERCENT);
    originalThresholdRef.current = resolved;
    setFinalityThreshold(resolved);
  };

  // Pre-fill all fields from the project and its config, as they load
  useEffect(() => {
    setMaintainerAddresses(project.maintainers);
    setMaintainerGithubs(
      config.authorGithubNames.length
        ? config.authorGithubNames
        : project.maintainers.map(() => ""),
    );
    const repositoryUrl = config.officials.githubLink || project.config.url;
    originalRepositoryUrlRef.current = repositoryUrl;
    setGithubRepoUrl(repositoryUrl);
    setSelectedRepositoryProvider(
      getRepositoryProvider(repositoryUrl) || "github",
    );
    setProjectName(project.name);
    setProjectFullName(config.projectFullName || project.name);
    setOrgName(config.organizationName);
    setOrgUrl(config.officials.websiteLink);
    setOrgLogo(config.logoImageLink);
    setOrgDescription(config.description);
    loadThreshold(project.name);

    setAddrErrors(project.maintainers.map(() => null));
    setGhErrors(project.maintainers.map(() => null));
  }, [project, config]);

  /**
   * When the modal opens, fetch the existing tansu.toml from IPFS so we can
   * merge into it rather than overwrite it.
   *
   * We also sync README.md from the file on IPFS as the source of truth.
   */
  useEffect(() => {
    if (!open) return;

    setReadmeImageFiles((prev) => {
      prev.forEach((img) => URL.revokeObjectURL(img.localUrl));
      return [];
    });
    setReadmeImageError(null);

    const ipfsCid = project.config.ipfs;
    if (!ipfsCid) {
      existingTomlRef.current = null;
      return;
    }

    setIpfsBaseUrl(getIpfsBasicLink(ipfsCid));

    // Parallel read of TOML and README, usually from the query cache
    Promise.all([
      readIpfsFile(ipfsCid, "/tansu.toml"),
      !isSoftwareProject ? readIpfsFile(ipfsCid, "/README.md") : null,
    ]).then(([tomlText, readme]) => {
      try {
        existingTomlRef.current = tomlText ? toml.parse(tomlText) : null;
      } catch {
        existingTomlRef.current = null;
      }

      // Use the README from IPFS as the source of truth so the form is
      // always in sync with what will be preserved.
      if (!isSoftwareProject && readme !== null) {
        setReadmeContent(readme);
      }
    });
  }, [open, isSoftwareProject]);

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
        projectType: config.projectType,
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
      existingTomlRef.current ?? {},
      originalRepositoryUrlRef.current,
    );

  const handleSubmit = async () => {
    setIsLoading(true);
    try {
      const ipfsCid = project.config.ipfs;

      // Double-check: if readmeContent is empty and we have an existing CID,
      // try one last time to fetch it to prevent accidental overwrites if
      // the initial fetch on mount was slow/failed.
      let finalReadme = readmeContent;
      if (!isSoftwareProject && !finalReadme && ipfsCid) {
        const existing = await readIpfsFile(ipfsCid, "/README.md");
        if (existing) finalReadme = existing;
      }

      const tomlContent = buildToml();
      const tomlFile = new File([tomlContent], "tansu.toml", {
        type: "text/plain",
      });

      const additionalFiles: File[] = [];
      if (!isSoftwareProject) {
        let readmeToSave = finalReadme || "";
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
        // Re-fetch any existing relative images from the old IPFS CID so they
        // are carried over into the new CAR and not orphaned after the update.
        if (ipfsCid) {
          const handledPaths = new Set(imageFilesToInclude.map((f) => f.name));
          const relativeImgRegex = /!\[([^\]]*)\]\((?!https?:\/\/)([^)]+)\)/g;
          const matches = [...readmeToSave.matchAll(relativeImgRegex)];
          await Promise.all(
            matches.map(async (match) => {
              const relativePath = match[2];
              if (!relativePath || handledPaths.has(relativePath)) return;
              try {
                const res = await fetch(
                  `${getIpfsBasicLink(ipfsCid)}/${relativePath}`,
                );
                if (!res.ok) return;
                const blob = await res.blob();
                imageFilesToInclude.push(
                  new File([blob], relativePath, { type: blob.type }),
                );
              } catch {
                // image no longer reachable — leave the reference as-is
              }
            }),
          );
        }

        additionalFiles.push(
          new File([readmeToSave], "README.md", { type: "text/markdown" }),
        );
        additionalFiles.push(...imageFilesToInclude);
      }

      await updateConfig(project.name, {
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

      toast.success(
        "Config updated",
        "Project configuration updated successfully.",
      );
      setIsSuccessful(true);
    } catch (e: any) {
      toast.error("Update config", e.message);
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
        onClick={() => setOpen(true)}
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
          {step <= 3 && (
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
                      <div key={i} className="flex gap-3 mb-3">
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
                  <div className="flex justify-between">
                    <Button type="secondary" onClick={() => setStep(2)}>
                      Back
                    </Button>
                    <Button isLoading={isLoading} onClick={handleSubmit}>
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
