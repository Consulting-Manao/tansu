import { useState } from "react";
import MarkdownEditorWithImages, {
  embedImages,
} from "components/utils/MarkdownEditorWithImages";
import { validateGithubUrl } from "utils/validations";
import { carriedImages } from "utils/readmeImages";
import { useConfigForm } from "./useConfigForm";
import { updateConfig } from "@service/ProjectService";
import { validateFinalityThresholdPercent } from "constants/attestation";
import { getIpfsBasicLink } from "utils/ipfsFunctions";
import type { Project } from "../../../../packages/tansu";
import { getRepositoryProviderLabel } from "utils/editLinkFunctions";
import {
  validateFullName,
  validateOrganization,
  writeTansuToml,
} from "utils/tansuToml";
import {
  checkMaintainers,
  GovernanceFields,
  handleLabel,
  MaintainerRows,
  OrganizationFields,
  RepositoryFields,
  ThresholdField,
  validateGovernanceHours,
} from "./ProjectFields";
import {
  Button,
  FlowDialog,
  flowSteps,
  Input,
  StepBar,
  Title,
  useFlow,
} from "components/ui";

/**
 * For maintainers: change the project's maintainers and tansu.toml. The form
 * starts from the project's files as they are when the dialog opens, and the
 * update keeps what the form does not edit: it waits for them, a failed read
 * stops it, and so does a change another maintainer made meanwhile.
 */
const UpdateConfigModal = ({ project }: { project: Project }) => {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);

  const flow = useFlow();

  const {
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
  } = useConfigForm(project, open);

  const handleClose = () => {
    readmeImageFiles.forEach((img) => URL.revokeObjectURL(img.localUrl));
    setOpen(false);
    flow.reset();
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
    const timingCheck = {
      votingPeriod: timingChanged.votingPeriod
        ? validateGovernanceHours(timing.votingPeriod)
        : null,
      executeDelay: timingChanged.executeDelay
        ? validateGovernanceHours(timing.executeDelay)
        : null,
    };
    setTimingErrors(timingCheck);
    if (
      !fullNameError &&
      !Object.keys(errors).length &&
      !thresholdError &&
      !timingCheck.votingPeriod &&
      !timingCheck.executeDelay
    ) {
      setStep(3);
    }
  };

  const handleSubmit = async () => {
    flow.stage("prepare");
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
        onProgress: flow.stage,
        additionalFiles,
        // Omitted when unchanged: the contract treats `None` as "leave as is".
        ...(finalityThreshold !== originalThresholdRef.current
          ? { attestationThreshold: Number(finalityThreshold) }
          : {}),
        ...(timingChanged.votingPeriod
          ? { minVotingPeriod: BigInt(Number(timing.votingPeriod) * 3600) }
          : {}),
        ...(timingChanged.executeDelay
          ? { executeDelay: BigInt(Number(timing.executeDelay) * 3600) }
          : {}),
      });
      originalThresholdRef.current = finalityThreshold;
      originalTimingRef.current = timing;
      flow.done();
    } catch (error) {
      flow.fail(error);
    }
  };

  const stepLayout = (image: string, body: React.ReactNode) => (
    <div className="flex flex-col md:flex-row items-center gap-6 md:gap-4">
      <img alt="" className="flex-none md:w-1/3 w-45" src={image} />
      <div className="flex flex-col gap-4 w-full md:w-2/3">{body}</div>
    </div>
  );

  return (
    <>
      <Button
        tone="secondary"
        onClick={() => {
          setStep(1);
          setOpen(true);
        }}
      >
        Update config
      </Button>

      {open && (
        <FlowDialog
          state={flow.state}
          onClose={handleClose}
          steps={flowSteps("project configuration")}
          success={{
            title: "Config Updated!",
            description: "Project configuration updated successfully.",
          }}
          size="auto"
        >
          {step <= 3 && basedOn === null ? (
            <div className="flex flex-col gap-4">
              {readError ? (
                <div role="alert" className="flex flex-col gap-2 text-danger">
                  <p>
                    The project's current files could not be read, so the
                    configuration cannot be edited yet: {readError.message}
                  </p>
                  <Button
                    tone="secondary"
                    size="sm"
                    onClick={() =>
                      reads.forEach((read) => read.isError && read.refetch())
                    }
                  >
                    Retry
                  </Button>
                </div>
              ) : (
                <p className="text-ink-muted">
                  Loading the project's current files...
                </p>
              )}
            </div>
          ) : step === 1 ? (
            stepLayout(
              "/images/team.svg",
              <>
                <StepBar step={1} totalSteps={3} />
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
                <StepBar step={2} totalSteps={3} />
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
                  hint="Project name used for the project (cannot be modified)"
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
                  hint="Human-readable name shown in the UI (up to 100 ASCII characters)."
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
                <GovernanceFields
                  votingPeriod={timing.votingPeriod}
                  executeDelay={timing.executeDelay}
                  errors={timingErrors}
                  onChange={(field, value) => {
                    setTiming((prev) => ({ ...prev, [field]: value }));
                    setTimingErrors((prev) => ({ ...prev, [field]: null }));
                  }}
                />
                {timingNotice && (
                  <p className="text-ui text-ink-muted">{timingNotice}</p>
                )}
                {!isSoftware && (
                  <div className="flex flex-col gap-3">
                    <p className="text-ui font-medium text-ink">README</p>
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
                  <Button tone="secondary" onClick={() => setStep(1)}>
                    Back
                  </Button>
                  <Button onClick={nextFromDetails}>Next</Button>
                </div>
              </>,
            )
          ) : (
            step === 3 && (
              <div>
                <StepBar step={3} totalSteps={3} />
                <Title title="Review" description="Confirm and update" />
                <p className="mb-4">
                  A new tansu.toml will be generated and stored on IPFS.
                </p>
                {previousToml === null && (
                  <p role="alert" className="mb-4 text-danger">
                    The current tansu.toml is not valid TOML: only the values of
                    this form will be kept.
                  </p>
                )}
                <div className="flex justify-between">
                  <Button tone="secondary" onClick={() => setStep(2)}>
                    Back
                  </Button>
                  <Button onClick={handleSubmit}>Update Config</Button>
                </div>
              </div>
            )
          )}
        </FlowDialog>
      )}
    </>
  );
};

export default UpdateConfigModal;
