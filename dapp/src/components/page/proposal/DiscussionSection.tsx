import Button from "components/utils/Button";
import DOMPurify from "dompurify";
import Markdown from "markdown-to-jsx";
import React, { useState } from "react";
import { getIpfsBasicLink } from "utils/ipfsFunctions";

interface DiscussionSectionProps {
  discussion: string | null;
  summary: string | null;
  isLoading: boolean;
  ipfsCid: string | null;
}

const markdownOptions = {
  overrides: {
    a: { props: { target: "_blank", rel: "noopener noreferrer" } },
    img: { props: { className: "max-w-full h-auto" } },
  },
};

const DiscussionSection: React.FC<DiscussionSectionProps> = ({
  discussion,
  summary,
  isLoading,
  ipfsCid,
}) => {
  const [showThread, setShowThread] = useState(false);

  const hasThread = !!discussion?.trim();
  const hasSummary = !!summary?.trim();
  const hasContent = hasThread || hasSummary;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-between items-center">
        <p className="text-2xl font-medium text-primary">Discussion</p>
        {hasContent && ipfsCid && (
          <Button
            type="secondary"
            icon="/icons/ipfs.svg"
            onClick={() => window.open(getIpfsBasicLink(ipfsCid), "_blank")}
          >
            View IPFS
          </Button>
        )}
      </div>

      {isLoading ? (
        <p className="text-gray-500 italic">Loading discussion…</p>
      ) : !hasContent ? (
        <p className="p-[30px] text-gray-500 italic bg-white">
          No discussion available for this proposal.
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          {hasSummary && (
            <div className="bg-white rounded-md border border-gray-200 p-[30px] flex flex-col gap-3">
              <p className="text-xl font-medium text-primary">Summary</p>
              <div className="markdown-body">
                <Markdown options={markdownOptions}>
                  {DOMPurify.sanitize(summary!)}
                </Markdown>
              </div>
            </div>
          )}

          {hasThread && (
            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={() => setShowThread((v) => !v)}
                className="self-start text-base font-medium text-primary underline"
              >
                {showThread ? "Hide full discussion" : "Show full discussion"}
              </button>

              {showThread && (
                <div className="bg-white rounded-md border border-gray-200 p-[30px] markdown-body">
                  <Markdown options={markdownOptions}>
                    {DOMPurify.sanitize(discussion!)}
                  </Markdown>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DiscussionSection;
