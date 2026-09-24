import { useStore } from "@nanostores/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { projectQuery } from "@service/ProjectService";
import { queryClient } from "@service/queryClient";
import Button from "components/utils/Button";
import { ErrorBoundary } from "components/utils/ErrorBoundary";
import { connectedPublicKey } from "utils/store";
import { projectNameFromUrl, projectUrl } from "utils/urls";
import CreateProposalModal from "../proposal/CreateProposalModal";

/** The way back to the project and, for its maintainers, a new proposal. */
const GovernanceHeader = () => {
  const name = projectNameFromUrl();
  const publicKey = useStore(connectedPublicKey);
  const { data: project } = useQuery(
    { ...projectQuery(name), enabled: !!name },
    queryClient,
  );
  const [isProposing, setIsProposing] = useState(false);
  const maintainers = project?.maintainers ?? [];

  return (
    <>
      <div className="z-[1] flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 sm:gap-0">
        <a href={projectUrl(name)} className="flex gap-[14px] items-center">
          <img src="/icons/back.svg" alt="" />
          <p className="leading-5 text-base sm:text-xl text-primary">
            Back to Project Page
          </p>
        </a>
        {!!publicKey && maintainers.includes(publicKey) && (
          <Button icon="/icons/send.svg" onClick={() => setIsProposing(true)}>
            Submit Proposal
          </Button>
        )}
      </div>
      {project && (
        <ErrorBoundary>
          <CreateProposalModal
            projectName={name}
            maintainers={maintainers}
            open={isProposing}
            onClose={() => setIsProposing(false)}
          />
        </ErrorBoundary>
      )}
    </>
  );
};

export default GovernanceHeader;
