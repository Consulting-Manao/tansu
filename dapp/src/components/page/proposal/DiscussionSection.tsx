import { Card, CardHeader, LinkButton } from "components/ui";
import Markdown from "components/utils/Markdown";
import React, { useState } from "react";
import { getIpfsBasicLink } from "utils/ipfsFunctions";

interface DiscussionSectionProps {
  discussion: string | null;
  summary: string | null;
  isLoading: boolean;
  ipfsCid: string | null;
}

const DiscussionSection: React.FC<DiscussionSectionProps> = ({
  discussion,
  summary,
  isLoading,
  ipfsCid,
}) => {
  const [showThread, setShowThread] = useState(false);
  const baseUrl = ipfsCid ? getIpfsBasicLink(ipfsCid) : undefined;

  const hasThread = !!discussion?.trim();
  const hasSummary = !!summary?.trim();
  const hasContent = hasThread || hasSummary;

  return (
    <Card>
      <CardHeader
        title="Discussion"
        action={
          hasContent &&
          ipfsCid && (
            <a
              href={getIpfsBasicLink(ipfsCid)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-small font-semibold text-link underline-offset-2 hover:underline"
            >
              View on IPFS
            </a>
          )
        }
      />
      {isLoading ? (
        <p className="text-ink-muted">Loading discussion…</p>
      ) : !hasContent ? (
        <p className="text-ink-muted">
          No discussion available for this proposal.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {hasSummary && <Markdown baseUrl={baseUrl}>{summary!}</Markdown>}
          {hasThread && (
            <div className="flex flex-col gap-3">
              <LinkButton
                className="self-start"
                onClick={() => setShowThread((v) => !v)}
              >
                {showThread ? "Hide full discussion" : "Show full discussion"}
              </LinkButton>
              {showThread && (
                <Markdown
                  className="rounded-control border border-line p-4"
                  baseUrl={baseUrl}
                >
                  {discussion!}
                </Markdown>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
};

export default DiscussionSection;
