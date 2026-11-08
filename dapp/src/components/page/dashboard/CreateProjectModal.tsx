import { projectQuery, registerProject } from "@service/ProjectService";
import { queryClient } from "@service/queryClient";
import { useStore } from "@nanostores/react";
import { connectedPublicKey, walletInitialized } from "utils/store";
import { navigate } from "astro:transitions/client";
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
import {
  Button,
  FlowDialog,
  flowSteps,
  Input,
  RadioGroup,
  StepBar,
  Title,
  useFlow,
} from "components/ui";
import CreateProjectReview from "./CreateProjectReview";

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

  const flow = useFlow();
  // Checking the name and the repository before the second step.
  const [isChecking, setIsChecking] = useState(false);

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
    setIsChecking(true);
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
      setIsChecking(false);
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
    flow.stage("prepare");
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
      await registerProject(projectName, {
        tomlFile,
        repositoryUrl: isSoftware ? repositoryUrl : "",
        maintainers: maintainers.map((row) => row.address),
        onProgress: flow.stage,
        attestationThreshold: Number(finalityThreshold),
        ...(!isSoftware && {
          additionalFiles: [
            new File([readme.text], "README.md", { type: "text/plain" }),
            ...readme.files,
          ],
        }),
      });
      flow.done();
    } catch (err) {
      flow.fail(err);
    }
  };

  /** A step: its illustration, the step bar and title, its fields, Next. */
  const stepLayout = (
    image: string,
    title: string,
    description: string,
    fields: React.ReactNode,
    next: () => void,
  ) => (
    <div
      key={step}
      className="flex flex-col md:flex-row items-center gap-6 md:gap-4"
    >
      <img alt="" className="flex-none w-35 md:w-65" src={image} />
      <div className="flex flex-col gap-6 md:gap-10 w-full">
        <div className="flex flex-col gap-4 md:gap-7">
          <div className="flex flex-col gap-3 md:gap-5">
            <StepBar step={step} totalSteps={4} />
            <Title title={title} description={description} />
          </div>
          {fields}
        </div>
        <div className="flex flex-col sm:flex-row sm:justify-end gap-3 sm:gap-4">
          <Button
            tone="secondary"
            onClick={onClose}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            loading={isChecking}
            onClick={next}
            className="w-full sm:w-auto"
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <FlowDialog
      state={flow.state}
      onClose={onClose}
      onSuccess={() => navigate(projectUrl(projectName))}
      steps={flowSteps("project registration")}
      success={{
        title: "Your Project Is Live!",
        description:
          "Congratulations! You've successfully created your project. Let's get the ball rolling!",
      }}
      size="auto"
    >
      {step === 1 ? (
        stepLayout(
          "/images/megaphone.svg",
          "Welcome to Your New Project!",
          isSoftware
            ? "Add your project name, choose a repository provider, and paste the repo URL early so the rest of the form adapts automatically."
            : "Add your project name and display name to get started.",
          <>
            <Input
              label="Project Name (On-chain)"
              placeholder="Write the project name (e.g., myproject)"
              value={projectName}
              onChange={(e) => {
                setProjectName(e.target.value.replace(/[^a-zA-Z0-9]/g, ""));
                setProjectNameError(null);
              }}
              hint="Project name must be 4-30 alphanumeric characters (a-z, A-Z, 0-9). This will be your unique on-chain identifier."
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
              hint="Human-readable name shown in the UI (up to 100 ASCII characters)."
              error={projectFullNameError}
            />
            <RadioGroup
              legend="Project Type"
              value={projectType}
              onChange={setProjectType}
              options={[
                {
                  value: ProjectType.SOFTWARE,
                  label: "Software Project (uses a supported git provider)",
                  description:
                    "For software projects hosted on GitHub, GitLab, Bitbucket, Codeberg, Gitea, or public Radicle repositories",
                },
                {
                  value: ProjectType.GENERIC,
                  label: "Non-Software Project",
                  description:
                    "For non-software projects like creative work, documentation, or community initiatives",
                },
              ]}
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
          </>,
          nextFromNaming,
        )
      ) : step === 2 ? (
        stepLayout(
          "/images/team.svg",
          "Build Your Team",
          isSoftware
            ? `Add maintainer wallet addresses and ${providerLabel} handles for the contributors associated with this repository.`
            : "Add yourself as the maintainer and optionally include team members to collaborate on your project.",
          <MaintainerRows
            rows={maintainers}
            onChange={setMaintainers}
            provider={provider}
          />,
          nextFromTeam,
        )
      ) : step === 3 ? (
        stepLayout(
          "/images/arrow.svg",
          isSoftware ? "Add Organization Details" : "Add Supporting Materials",
          isSoftware
            ? "Add organization links, branding, and project context."
            : "Attach links and README content to provide more context and strengthen your project proposal.",
          <>
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
          </>,
          nextFromDetails,
        )
      ) : (
        <CreateProjectReview
          projectName={projectName}
          projectFullName={projectFullName}
          isSoftware={isSoftware}
          repositoryLabel={`${providerLabel} Repository URL`}
          repositoryUrl={repositoryUrl}
          maintainers={maintainers.map((row) => row.address)}
          finalityThreshold={finalityThreshold}
          onBack={setStep}
          onRegister={handleRegisterProject}
          onCancel={onClose}
        />
      )}
    </FlowDialog>
  );
};

export default CreateProjectModal;
