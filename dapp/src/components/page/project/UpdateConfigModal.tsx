import { useStore } from "@nanostores/react";
import {
  loadProjectInfo,
  loadConfigData,
  setConfigData,
  setProject,
} from "@service/StateService";
import { projectInfoLoaded, configData as configDataStore } from "utils/store";
import { useEffect, useState, useRef } from "react";
import FlowProgressModal from "components/utils/FlowProgressModal";
import Button from "components/utils/Button";
import Input from "components/utils/Input";
import Textarea from "components/utils/Textarea";
import Step from "components/utils/Step";
import Title from "components/utils/Title";
import {
  validateMaintainerAddress,
  validateGithubUrl,
} from "utils/validations";
import { updateConfigFlow } from "@service/FlowService";
import { toast, extractConfigData } from "utils/utils";
import { getProject } from "@service/ReadContractService";
import {
  calculateDirectoryCid,
  getIpfsBasicLink,
  fetchTextFromIpfs,
} from "utils/ipfsFunctions";
import {
  getRepositoryHandleLabel,
  getRepositoryHandlePlaceholder,
  getRepositoryProjectPath,
  getRepositoryProvider,
  getRepositoryProviderLabel,
  getRepositoryUrlPlaceholder,
  SUPPORTED_REPOSITORY_PROVIDERS,
  type RepositoryProvider,
} from "utils/editLinkFunctions";
import toml from "toml";

// Validate DBA (Project Full Name): ASCII-only, max 100 chars
const validateDbaField = (value: string): string | null => {
  if (!value.trim()) {
    return "Project full name is required";
  }
  if (value.length > 100) {
    return "Project full name must be 100 characters or fewer";
  }
  // Printable ASCII characters only
  if (!/^[\x20-\x7E]+$/.test(value)) {
    return "Project full name may only contain ASCII characters";
  }
  return null;
};

/**
 * Fetch and parse the existing tansu.toml from IPFS.
 * Returns the raw parsed object (any shape), or null on failure.
 */
async function fetchExistingToml(
  ipfsCid: string,
): Promise<Record<string, any> | null> {
  try {
    const url = `${getIpfsBasicLink(ipfsCid)}/tansu.toml`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const text = await res.text();
    return toml.parse(text) as Record<string, any>;
  } catch {
    return null;
  }
}

/**
 * Merge form-managed fields into the existing parsed TOML object,
 * preserving every field we don't explicitly manage (e.g. PROJECT_TYPE).
 *
 * TOML structure we manage:
 *   VERSION
 *   ACCOUNTS = [...]
 *   [DOCUMENTATION]
 *     ORG_DBA, ORG_NAME, ORG_URL, ORG_LOGO, ORG_DESCRIPTION, ORG_GITHUB
 *   [[PRINCIPALS]]
 *     github = "..."
 */
function mergeTomlData(
  existing: Record<string, any>,
  fields: {
    maintainerAddresses: string[];
    maintainerGithubs: string[];
    projectFullName: string;
    orgName: string;
    orgUrl: string;
    orgLogo: string;
    orgDescription: string;
    githubRepoUrl: string;
    isSoftwareProject: boolean;
  },
): Record<string, any> {
  const merged = { ...existing };

  // Always bump / set version
  merged["VERSION"] = "2.0.0";

  // Overwrite only the accounts array
  merged["ACCOUNTS"] = fields.maintainerAddresses;

  // Merge DOCUMENTATION sub-table — preserve unknown keys inside it
  const existingDoc: Record<string, any> =
    typeof existing["DOCUMENTATION"] === "object" &&
    existing["DOCUMENTATION"] !== null
      ? { ...existing["DOCUMENTATION"] }
      : {};

  existingDoc["ORG_DBA"] = fields.projectFullName.trim();
  existingDoc["ORG_NAME"] = fields.orgName;
  existingDoc["ORG_URL"] = fields.orgUrl;
  existingDoc["ORG_LOGO"] = fields.orgLogo;
  existingDoc["ORG_DESCRIPTION"] = fields.orgDescription;
  existingDoc["ORG_GITHUB"] = fields.isSoftwareProject
    ? getRepositoryProjectPath(fields.githubRepoUrl)
    : "";

  // README is now only stored as a separate file, so we explicitly remove it
  // from the TOML if it was previously there to enforce a single source of truth.
  delete existingDoc["README"];

  merged["DOCUMENTATION"] = existingDoc;

  // Replace PRINCIPALS array entirely (only field we manage there is github)
  merged["PRINCIPALS"] = fields.maintainerGithubs.map((gh) => ({ github: gh }));

  return merged;
}

/**
 * Serialize a merged TOML object back to a TOML string.
 *
 * We do this manually so we keep the same key ordering the contract expects
 * and handle the array-of-tables ([[PRINCIPALS]]) syntax correctly.
 * Unknown top-level scalar/string keys (like PROJECT_TYPE) are emitted first.
 */
function serializeToml(data: Record<string, any>): string {
  const lines: string[] = [];

  // 1. Known scalar keys first
  const knownTopLevelKeys = new Set([
    "VERSION",
    "ACCOUNTS",
    "DOCUMENTATION",
    "PRINCIPALS",
  ]);

  // Emit VERSION
  if (data["VERSION"] !== undefined) {
    lines.push(`VERSION="${data["VERSION"]}"`);
  }

  // Emit unknown top-level scalars/strings (e.g. PROJECT_TYPE) — preserve them
  for (const key of Object.keys(data)) {
    if (knownTopLevelKeys.has(key)) continue;
    const val = data[key];
    if (typeof val === "string") {
      lines.push(`${key}="${val}"`);
    } else if (typeof val === "number" || typeof val === "boolean") {
      lines.push(`${key}=${val}`);
    }
    // arrays/objects that are not in our known set: skip (rare edge case)
  }

  lines.push("");

  // 2. ACCOUNTS array
  if (Array.isArray(data["ACCOUNTS"])) {
    const accounts = (data["ACCOUNTS"] as string[])
      .map((a) => `    "${a}"`)
      .join(",\n");
    lines.push(`ACCOUNTS=[\n${accounts}\n]`);
  }

  lines.push("");

  // 3. [DOCUMENTATION] table
  if (data["DOCUMENTATION"] && typeof data["DOCUMENTATION"] === "object") {
    lines.push("[DOCUMENTATION]");
    const doc = data["DOCUMENTATION"] as Record<string, any>;
    for (const key of Object.keys(doc)) {
      const val = doc[key];
      if (typeof val === "string") {
        lines.push(`${key}="${val}"`);
      } else if (typeof val === "number" || typeof val === "boolean") {
        lines.push(`${key}=${val}`);
      }
    }
  }

  lines.push("");

  // 4. [[PRINCIPALS]] array of tables
  if (Array.isArray(data["PRINCIPALS"])) {
    for (const principal of data["PRINCIPALS"] as Record<string, any>[]) {
      lines.push("[[PRINCIPALS]]");
      for (const key of Object.keys(principal)) {
        const val = principal[key];
        if (typeof val === "string") {
          lines.push(`${key}="${val}"`);
        }
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}

const UpdateConfigModal = () => {
  const infoLoaded = useStore(projectInfoLoaded);
  // Subscribe to configData store so the component re-renders when config arrives
  const storeConfigData = useStore(configDataStore);

  const [showButton, setShowButton] = useState(false);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);

  // Flow state management
  const [isUploading, setIsUploading] = useState(false);
  const [isSuccessful, setIsSuccessful] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Holds the raw parsed existing TOML so we can merge into it on submit
  const existingTomlRef = useRef<Record<string, any> | null>(null);

  // Derived directly from the reactive store value — no separate useState needed
  const isSoftwareProject = storeConfigData?.projectType === "SOFTWARE";

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
  const [readmeContent, setReadmeContent] = useState("");

  // errors
  const [addrErrors, setAddrErrors] = useState<(string | null)[]>([null]);
  const [ghErrors, setGhErrors] = useState<(string | null)[]>([null]);
  const [repoError, setRepoError] = useState<string | null>(null);
  const [projectFullNameError, setProjectFullNameError] = useState<
    string | null
  >(null);
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

  // Pre-fill all fields whenever projectInfo OR configData becomes available
  useEffect(() => {
    if (!infoLoaded) return;
    const projectInfo = loadProjectInfo();
    const cfg = loadConfigData();

    if (!projectInfo || !projectInfo.maintainers || !projectInfo.config) {
      setShowButton(false);
      return;
    }

    setMaintainerAddresses(projectInfo.maintainers);
    setMaintainerGithubs(
      cfg?.authorGithubNames || projectInfo.maintainers.map(() => ""),
    );
    setGithubRepoUrl(projectInfo.config.url || "");
    setSelectedRepositoryProvider(
      getRepositoryProvider(projectInfo.config.url || "") || "github",
    );
    setProjectName(projectInfo.name || "");
    setProjectFullName(cfg?.projectFullName || projectInfo.name || "");
    setOrgName(cfg?.organizationName || "");
    setOrgUrl(cfg?.officials?.websiteLink || "");
    setOrgLogo(cfg?.logoImageLink || "");
    setOrgDescription(cfg?.description || "");

    setAddrErrors(projectInfo.maintainers.map(() => null));
    setGhErrors(projectInfo.maintainers.map(() => null));

    // Show button only if the connected wallet is a maintainer
    import("@service/walletService")
      .then(({ loadedPublicKey }) => {
        const publicKey = loadedPublicKey();
        setShowButton(
          publicKey ? projectInfo.maintainers.includes(publicKey) : false,
        );
      })
      .catch(() => setShowButton(false));
  }, [infoLoaded, storeConfigData]);

  /**
   * When the modal opens, fetch the existing tansu.toml from IPFS so we can
   * merge into it rather than overwrite it.
   *
   * We also sync README.md from the file on IPFS as the source of truth.
   */
  useEffect(() => {
    if (!open) return;

    const projectInfo = loadProjectInfo();
    const ipfsCid = projectInfo?.config?.ipfs;
    if (!ipfsCid) {
      existingTomlRef.current = null;
      return;
    }

    // Parallel fetch of TOML and README
    Promise.all([
      fetchExistingToml(ipfsCid),
      !isSoftwareProject ? fetchTextFromIpfs(ipfsCid, "/README.md") : null,
    ]).then(([parsedToml, readme]) => {
      existingTomlRef.current = parsedToml;

      // Use the README from IPFS as the source of truth so the form is
      // always in sync with what will be preserved.
      if (!isSoftwareProject && readme !== null) {
        setReadmeContent(readme);
      }
    });
  }, [open, isSoftwareProject]);

  const handleClose = () => {
    const wasSuccessful = isSuccessful;
    setOpen(false);
    setIsSuccessful(false);
    if (wasSuccessful) {
      window.location.reload();
      window.location.reload(); // double reload to ensure we bypass any stale cache and fetch the latest config from IPFS on load
    }
  };

  // validation helpers
  const ghRegex = /^[A-Za-z0-9_-]{1,30}$/;
  const validateMaintainers = () => {
    let ok = true;
    const newAddrErr = maintainerAddresses.map((a) => {
      const e = validateMaintainerAddress(a);
      if (e) ok = false;
      return e;
    });
    const newGhErr = maintainerGithubs.map((h) => {
      if (!h.trim()) {
        ok = false;
        return `${repositoryHandleLabel} is required`;
      }
      if (!ghRegex.test(h)) {
        ok = false;
        return `${repositoryHandleLabel} must use ASCII letters, digits, _ or -, and be 30 characters or fewer`;
      }
      return null;
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
    const dbaError = validateDbaField(projectFullName);
    setProjectFullNameError(dbaError);
    return dbaError === null;
  };

  /**
   * Build the TOML string by:
   * 1. Starting from the existing parsed TOML (preserves PROJECT_TYPE etc.)
   * 2. Merging only the fields managed by this form
   * 3. Serializing back to TOML
   *
   * Falls back to a blank base object if the existing file couldn't be fetched.
   */
  const buildToml = (): string => {
    const base: Record<string, any> = existingTomlRef.current ?? {};

    // Critical fix: ensure PROJECT_TYPE is preserved even if existingTomlRef is empty
    if (!base["PROJECT_TYPE"] && storeConfigData?.projectType) {
      base["PROJECT_TYPE"] = storeConfigData.projectType;
    }

    const merged = mergeTomlData(base, {
      maintainerAddresses,
      maintainerGithubs,
      projectFullName,
      orgName,
      orgUrl,
      orgLogo,
      orgDescription,
      githubRepoUrl,
      isSoftwareProject,
    });

    return serializeToml(merged);
  };

  const handleSubmit = async () => {
    setIsLoading(true);
    try {
      const projectInfo = loadProjectInfo();
      const ipfsCid = projectInfo?.config?.ipfs;

      // Double-check: if readmeContent is empty and we have an existing CID,
      // try one last time to fetch it to prevent accidental overwrites if
      // the initial fetch on mount was slow/failed.
      let finalReadme = readmeContent;
      if (!isSoftwareProject && !finalReadme && ipfsCid) {
        const existing = await fetchTextFromIpfs(ipfsCid, "/README.md");
        if (existing) finalReadme = existing;
      }

      const tomlContent = buildToml();
      const tomlFile = new File([tomlContent], "tansu.toml", {
        type: "text/plain",
      });

      const additionalFiles: File[] = [];
      if (!isSoftwareProject) {
        additionalFiles.push(
          new File([finalReadme || ""], "README.md", { type: "text/markdown" }),
        );
      }

      await updateConfigFlow({
        tomlFile,
        githubRepoUrl,
        maintainers: maintainerAddresses,
        onProgress: setStep,
        additionalFiles,
      });
      const p = await getProject();
      if (p) {
        setProject(p);
        await calculateDirectoryCid([tomlFile, ...additionalFiles]);
        const parsedToml = toml.parse(tomlContent) as Parameters<
          typeof extractConfigData
        >[0];
        setConfigData(extractConfigData(parsedToml, p));
      }

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
    if (isDbaValid) setStep(3);
  };

  const handleNextFromStep1 = () => {
    const maintainersAreValid = validateMaintainers();
    const repoIsValid = isSoftwareProject ? validateRepo() : true;

    if (maintainersAreValid && repoIsValid) {
      setStep(2);
    }
  };

  if (!showButton) return null;
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
                          ? `Confirm the repository provider or URL first, then update maintainer wallet addresses and ${repositoryProviderLabel} handles.`
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
                          description={`Paste an HTTPS or SSH URL for ${repositoryProviderLabel}. The provider selector updates automatically when the URL is recognized.`}
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
                    />
                    <Input
                      label="Organisation URL"
                      value={orgUrl}
                      onChange={(e) => setOrgUrl(e.target.value)}
                    />
                    <Input
                      label="Logo URL"
                      value={orgLogo}
                      onChange={(e) => setOrgLogo(e.target.value)}
                    />
                    <Textarea
                      label="Description"
                      value={orgDescription}
                      onChange={(e) => setOrgDescription(e.target.value)}
                    />

                    {!isSoftwareProject && (
                      <Textarea
                        label="README"
                        value={readmeContent}
                        onChange={(e) => {
                          setReadmeContent(e.target.value);
                        }}
                        description="Project README content (Markdown)"
                      />
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
