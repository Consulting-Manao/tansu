import Button from "components/utils/Button";
import DOMPurify from "dompurify";
import Markdown from "markdown-to-jsx";
import React, { useState } from "react";
import type { DiscussionPost } from "types/proposal";
import { getIpfsBasicLink } from "utils/ipfsFunctions";

interface DiscussionSectionProps {
  discussion: DiscussionPost[] | null;
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

function formatTimestamp(timestamp: string | number): string {
  if (timestamp === "" || timestamp === null || timestamp === undefined) {
    return "";
  }
  const ms =
    typeof timestamp === "number"
      ? timestamp < 1e12
        ? timestamp * 1000
        : timestamp
      : Date.parse(timestamp);
  if (Number.isNaN(ms)) return typeof timestamp === "string" ? timestamp : "";
  return new Date(ms).toLocaleString();
}

const DiscussionSection: React.FC<DiscussionSectionProps> = ({
  discussion,
  summary,
  isLoading,
  ipfsCid,
}) => {
  const [showThread, setShowThread] = useState(false);

  const hasThread = !!discussion && discussion.length > 0;
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
                {showThread
                  ? "Hide full discussion"
                  : `Show full discussion (${discussion!.length})`}
              </button>

              {showThread && (
                <div className="flex flex-col gap-3">
                  {discussion!.map((post, index) => (
                    <div
                      key={index}
                      className="bg-white rounded-md border border-gray-200 p-[30px] flex flex-col gap-2"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-base font-semibold text-primary">
                          {post.author}
                        </p>
                        {formatTimestamp(post.timestamp) && (
                          <span className="text-xs text-secondary">
                            {formatTimestamp(post.timestamp)}
                          </span>
                        )}
                      </div>
                      <div className="markdown-body">
                        <Markdown options={markdownOptions}>
                          {DOMPurify.sanitize(post.body)}
                        </Markdown>
                      </div>
                      {post.source && (
                        <a
                          href={post.source}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-secondary underline self-start"
                        >
                          View original
                        </a>
                      )}
                    </div>
                  ))}
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
