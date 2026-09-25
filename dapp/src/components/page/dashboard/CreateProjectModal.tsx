import { projectQuery, registerProject } from "@service/ProjectService";
import { queryClient } from "@service/queryClient";
import { useStore } from "@nanostores/react";
import { connectedPublicKey, walletInitialized } from "utils/store";
import { navigate } from "astro:transitions/client";
import Button from "components/utils/Button.tsx";
import Input from "components/utils/Input.tsx";
import Label from "components/utils/Label.tsx";
import FlowProgressModal from "components/utils/FlowProgressModal.tsx";
import Step from "components/utils/Step.tsx";
import Title from "components/utils/Title.tsx";
import { useState, type FC, useEffect, useRef } from "react";
import { toast } from "utils/utils";
import {
  validateProjectName as validateProjectNameUtil,
  validateGithubUrl,
} from "utils/validations.ts";
import {
  DEFAULT_FINALITY_THRESHOLD_PERCENT,
  validateFinalityThresholdPercent,
} from "constants/attestation";
import { ProjectType } from "types/projectConfig";
import {
  getRepositoryProviderLabel,
  type RepositoryProvider,
} from "utils/editLinkFunctions";
import MarkdownEditorWithImages, {
  embedImages,
  type AttachedImage,
} from "components/utils/MarkdownEditorWithImages";
import { projectUrl } from "utils/urls";
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
} from "components/page/project/ProjectFields";

/** Register a project: its name, repository, team and organization. */
const CreateProjectModal: FC<{ onClose: () => void }> = ({ onClose }) => {
  const [step, setStep] = useState(1);
  const [projectName, setProjectName] = useState("");
  const [projectNameError, setProjectNameError] = useState<string | null>(null);
  const [projectFullName, setProjectFullName] = useState("");
  const [projectFullNameError, setProjectFullNameError] = useState<
    string | null
  >(null);
  const [projectType, setProjectType] = useState(ProjectType.SOFTWARE);
  const [repositoryUrl, setRepositoryUrl] = useState("");
  const [chosenProvider, setChosenProvider] =
    useState<RepositoryProvider>("github");
  const [repositoryUrlError, setRepositoryUrlError] = useState<string | null>(
    null,
  );
  const [maintainers, setMaintainers] = useState<MaintainerRow[]>([
    { address: "", handle: "" },
  ]);
  const [org, setOrg] = useState(emptyOrganization);
  const [orgErrors, setOrgErrors] = useState<
    ReturnType<typeof validateOrganization>
  >({});
  const [finalityThreshold, setFinalityThreshold] = useState(
    String(DEFAULT_FINALITY_THRESHOLD_PERCENT),
  );
  const [finalityThresholdError, setFinalityThresholdError] = useState<
    string | null
  >(null);
  const [readmeContent, setReadmeContent] = useState("");
  const [readmeImageFiles, setReadmeImageFiles] = useState<AttachedImage[]>([]);
  const [readmeImageError, setReadmeImageError] = useState<string | null>(null);

  // Flow state management
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isSuccessful, setIsSuccessful] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const walletKey = useStore(connectedPublicKey);
  const isWalletReady = useStore(walletInitialized);
  const isSoftware = projectType === ProjectType.SOFTWARE;
  const provider = isSoftware
    ? activeProvider(repositoryUrl, chosenProvider)
    : undefined;
  const providerLabel = getRepositoryProviderLabel(provider);

  // Revoke blob URLs on modal unmount (not on step navigation)
  const readmeImageFilesRef = useRef<AttachedImage[]>([]);
  useEffect(() => {
    readmeImageFilesRef.current = readmeImageFiles;
  }, [readmeImageFiles]);
  useEffect(() => {
    return () => {
      readmeImageFilesRef.current.forEach((img) =>
        URL.revokeObjectURL(img.localUrl),
      );
    };
  }, []);

  // The connected wallet is the first maintainer.
  useEffect(() => {
    if (!walletKey) return;
    setMaintainers(([first, ...others]) =>
      first!.address
        ? [first!, ...others]
        : [{ ...first!, address: walletKey }, ...others],
    );
  }, [walletKey]);

  /** Free only when the contract has no project by that name, read fresh. */
  const checkProjectName = async (): Promise<boolean> => {
    const nameError = validateProjectNameUtil(projectName);
    if (nameError) {
      setProjectNameError(nameError);
      return false;
    }
    const taken = await queryClient.query({
      ...projectQuery(projectName),
      staleTime: 0,
    });
    setProjectNameError(taken ? "Project name already registered" : null);
    return !taken;
  };

  const nextFromNaming = async () => {
    if (!isWalletReady || !walletKey) {
      toast.error(
        "Connect Wallet",
        "Please connect your wallet first to create a project",
      );
      return;
    }
    const fullNameError = validateFullName(projectFullName);
    setProjectFullNameError(fullNameError);
    if (fullNameError) return;
    setIsLoading(true);
    try {
      if (!(await checkProjectName())) return;
      if (isSoftware) {
        const urlError = validateGithubUrl(repositoryUrl);
        setRepositoryUrlError(urlError);
        if (urlError) return;
      }
      setStep(2);
    } catch (err: any) {
      setProjectNameError(err.message || "Project name validation failed");
    } finally {
      setIsLoading(false);
    }
  };

  const nextFromTeam = () => {
    const checked = checkMaintainers(maintainers, handleLabel(provider));
    setMaintainers(checked.rows);
    if (checked.valid) setStep(3);
  };

  const nextFromDetails = () => {
    const errors = validateOrganization(org);
    setOrgErrors(errors);
    const thresholdError = validateFinalityThresholdPercent(finalityThreshold);
    setFinalityThresholdError(thresholdError);
    if (!Object.keys(errors).length && !thresholdError) setStep(4);
  };

  const handleRegisterProject = async () => {
    setIsLoading(true);
    try {
      if (!connectedPublicKey.get()) {
        throw new Error("Please connect your wallet first");
      }
      const tomlFile = new File(
        [
          writeTansuToml({
            projectType,
            maintainers: maintainers.map((row) => row.address),
            handles: maintainers.map((row) => row.handle),
            fullName: projectFullName,
            ...org,
            repositoryUrl,
            repositoryProvider: provider,
          }),
        ],
        "tansu.toml",
        { type: "text/plain" },
      );
      // A project without code has a README, possibly empty.
      const readme = embedImages(readmeContent, readmeImageFiles);
      setStep(6);
      await registerProject(projectName, {
        tomlFile,
        repositoryUrl: isSoftware ? repositoryUrl : "",
        maintainers: maintainers.map((row) => row.address),
        onProgress: setStep,
        attestationThreshold: Number(finalityThreshold),
        ...(!isSoftware && {
          additionalFiles: [
            new File([readme.text], "README.md", { type: "text/plain" }),
            ...readme.files,
          ],
        }),
      });
      setStep(10);
      toast.success("Success", "Project has been registered successfully!");
      onClose();
      navigate(projectUrl(projectName));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const footer = (next: () => void) => (
    <div className="flex flex-col sm:flex-row sm:justify-end gap-3 sm:gap-[18px]">
      <Button type="secondary" onClick={onClose} className="w-full sm:w-auto">
        Cancel
      </Button>
      <Button isLoading={isLoading} onClick={next} className="w-full sm:w-auto">
        Next
      </Button>
    </div>
  );

  const stepLayout = (image: string, body: React.ReactNode) => (
    <div
      key={step}
      className="flex flex-col md:flex-row items-center gap-6 md:gap-[18px]"
    >
      <img alt="" className="flex-none w-[140px] md:w-[260px]" src={image} />
      <div className="flex flex-col gap-6 md:gap-[42px] w-full">{body}</div>
    </div>
  );

  return (
    <FlowProgressModal
      isOpen={true}
      onClose={onClose}
      onSuccess={() => {
        onClose();
        navigate(projectUrl(projectName));
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
      signLabel="project registration"
      successTitle="Your Project Is Live!"
      successMessage="Congratulations! You've successfully created your project. Let's get the ball rolling!"
    >
      {step == 1
        ? stepLayout(
            "/images/megaphone.svg",
            <>
              <div className="flex flex-col gap-4 md:gap-[30px]">
                <div className="flex flex-col gap-3 md:gap-5">
                  <Step step={step} totalSteps={5} />
                  <Title
                    title="Welcome to Your New Project!"
                    description={
                      isSoftware
                        ? "Add your project name, choose a repository provider, and paste the repo URL early so the rest of the form adapts automatically."
                        : "Add your project name and display name to get started."
                    }
                  />
                </div>
                <Input
                  label="Project Name (On-chain)"
                  placeholder="Write the project name (e.g., myproject)"
                  value={projectName}
                  onChange={(e) => {
                    setProjectName(e.target.value.replace(/[^a-zA-Z0-9]/g, ""));
                    setProjectNameError(null);
                  }}
                  description="Project name must be 4-30 alphanumeric characters (a-z, A-Z, 0-9). This will be your unique on-chain identifier."
                  error={projectNameError}
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
                <fieldset className="flex flex-col gap-3">
                  <legend className="leading-4 text-base text-secondary mb-3">
                    Project Type
                  </legend>
                  <div className="flex gap-4">
                    {(
                      [
                        [
                          ProjectType.SOFTWARE,
                          "Software Project (uses a supported git provider)",
                        ],
                        [ProjectType.GENERIC, "Non-Software Project"],
                      ] as const
                    ).map(([type, label]) => (
                      <label
                        key={type}
                        className="flex items-center gap-2 cursor-pointer"
                      >
                        <input
                          type="radio"
                          name="projectType"
                          checked={projectType === type}
                          onChange={() => setProjectType(type)}
                          className="w-4 h-4"
                        />
                        <span className="text-primary">{label}</span>
                      </label>
                    ))}
                  </div>
                  <p className="text-sm text-secondary">
                    {isSoftware
                      ? "For software projects hosted on GitHub, GitLab, Bitbucket, Codeberg, Gitea, or public Radicle repositories"
                      : "For non-software projects like creative work, documentation, or community initiatives"}
                  </p>
                </fieldset>
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
              </div>
              {footer(nextFromNaming)}
            </>,
          )
        : step == 2
          ? stepLayout(
              "/images/team.svg",
              <>
                <div className="flex flex-col gap-4 md:gap-[30px]">
                  <div className="flex flex-col gap-3 md:gap-5">
                    <Step step={step} totalSteps={5} />
                    <Title
                      title="Build Your Team"
                      description={
                        isSoftware
                          ? `Add maintainer wallet addresses and ${providerLabel} handles for the contributors associated with this repository.`
                          : "Add yourself as the maintainer and optionally include team members to collaborate on your project."
                      }
                    />
                  </div>
                  <MaintainerRows
                    rows={maintainers}
                    onChange={setMaintainers}
                    provider={provider}
                  />
                </div>
                {footer(nextFromTeam)}
              </>,
            )
          : step == 3
            ? stepLayout(
                "/images/arrow.svg",
                <>
                  <div className="flex flex-col gap-4 md:gap-[30px]">
                    <div className="flex flex-col gap-3 md:gap-5">
                      <Step step={step} totalSteps={5} />
                      <Title
                        title={
                          isSoftware
                            ? "Add Organization Details"
                            : "Add Supporting Materials"
                        }
                        description={
                          isSoftware
                            ? "Add organization links, branding, and project context."
                            : "Attach links and README content to provide more context and strengthen your project proposal."
                        }
                      />
                    </div>
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
                      <MarkdownEditorWithImages
                        value={readmeContent}
                        onChange={setReadmeContent}
                        imageFiles={readmeImageFiles}
                        onImageFilesChange={setReadmeImageFiles}
                        imageError={readmeImageError}
                        onImageErrorChange={setReadmeImageError}
                        placeholder="Write your project README in markdown format..."
                      />
                    )}
                  </div>
                  {footer(nextFromDetails)}
                </>,
              )
            : step == 4 && (
                <div key={step} className="flex flex-col gap-[30px]">
                  <div className="flex items-center gap-[18px]">
                    <img
                      alt=""
                      className="flex-none w-[360px]"
                      src="/images/note.svg"
                    />
                    <div className="flex-grow flex flex-col gap-[30px]">
                      <div className="flex flex-col gap-5">
                        <Step step={step} totalSteps={5} />
                        <Title
                          title="Review and Submit Your Project"
                          description="Take a moment to review your project details before submitting. You can go back and make changes if needed."
                        />
                        <p className="text-sm text-secondary">
                          <span className="font-semibold">Note:</span> Project
                          registration requires a 5 XLM collateral deposit.
                        </p>
                      </div>
                      <div className="flex gap-[18px]">
                        <Button
                          isLoading={isLoading}
                          onClick={handleRegisterProject}
                        >
                          Register Project
                        </Button>
                        <Button type="secondary" onClick={onClose}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  </div>
                  <ReviewSection title="First Step" onBack={() => setStep(1)}>
                    <Label label="Project Name (On-chain)">
                      <p className="leading-6 text-xl text-primary">
                        {projectName}
                      </p>
                    </Label>
                    {projectFullName && (
                      <Label label="Project Full Name">
                        <p className="leading-6 text-xl text-primary">
                          {projectFullName}
                        </p>
                      </Label>
                    )}
                    <Label label="Project type">
                      <p className="leading-6 text-xl text-primary">
                        {isSoftware
                          ? "Software Project"
                          : "Non-Software Project"}
                      </p>
                    </Label>
                    {isSoftware && (
                      <Label label={`${providerLabel} Repository URL`}>
                        <p className="leading-6 text-xl text-primary break-all">
                          {repositoryUrl}
                        </p>
                      </Label>
                    )}
                  </ReviewSection>
                  <ReviewSection title="Second Step" onBack={() => setStep(2)}>
                    <Label label="Maintainers">
                      <div className="grid grid-cols-3 gap-x-9 gap-y-[18px]">
                        {maintainers.map((row, index) => (
                          <p
                            key={index}
                            className="leading-[14px] text-sm text-secondary"
                          >
                            {`(${row.address.slice(0, 24)}...)`}
                          </p>
                        ))}
                      </div>
                    </Label>
                  </ReviewSection>
                  <ReviewSection title="Third Step" onBack={() => setStep(3)}>
                    <Label label="Finality threshold">
                      <p className="leading-6 text-xl text-primary">
                        {finalityThreshold}%
                      </p>
                    </Label>
                  </ReviewSection>
                </div>
              )}
    </FlowProgressModal>
  );
};

/** A step's answers in the review, with the way back to it. */
const ReviewSection = ({
  title,
  onBack,
  children,
}: {
  title: string;
  onBack: () => void;
  children: React.ReactNode;
}) => (
  <>
    <div className="h-[1px] bg-[#ECE3F4]" />
    <div className="flex flex-col gap-6">
      <div className="flex gap-6">
        <p className="leading-6 text-xl font-medium text-primary">{title}</p>
        <Button
          type="secondary"
          size="sm"
          className="p-[2px_10px]"
          onClick={onBack}
        >
          Back to the {title}
        </Button>
      </div>
      {children}
    </div>
  </>
);

export default CreateProjectModal;
