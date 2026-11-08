import { useStore } from "@nanostores/react";
import { useState } from "react";
import { Button, SectionTitle } from "components/ui";
import { ErrorBoundary } from "components/utils/ErrorBoundary";
import { connectedPublicKey } from "utils/store";
import CreateProposalModal from "../proposal/CreateProposalModal";
import ConnectedVoterSummary from "./ConnectedVoterSummary";
import ProposalList from "./ProposalList";

/**
 * A project's proposals: what the connected voter has left to vote on, the
 * list, and for the project's maintainers a new proposal. The title shows
 * before the project is read, offline too.
 */
const ProposalsTab = ({
  name,
  maintainers,
}: {
  name: string;
  maintainers: string[];
}) => {
  const publicKey = useStore(connectedPublicKey);
  const [isProposing, setIsProposing] = useState(false);
  const isMaintainer = !!publicKey && maintainers.includes(publicKey);

  return (
    <section className="flex flex-col gap-6">
      <SectionTitle
        action={
          isMaintainer && (
            <Button onClick={() => setIsProposing(true)}>
              Submit proposal
            </Button>
          )
        }
      >
        Proposals
      </SectionTitle>
      <ConnectedVoterSummary />
      <ProposalList />
      {isMaintainer && (
        <ErrorBoundary>
          <CreateProposalModal
            projectName={name}
            maintainers={maintainers}
            open={isProposing}
            onClose={() => setIsProposing(false)}
          />
        </ErrorBoundary>
      )}
    </section>
  );
};

export default ProposalsTab;
