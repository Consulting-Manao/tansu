import { useEffect, useMemo, useRef, useState } from "react";
import JsonView from "react18-json-view";
import { projectUrl } from "utils/urls";
import { CopyButton, IconButton, LinkButton } from "components/ui";

interface CommitRecordProps {
  /** Main title line – for on-chain rows this is a concise summary */
  message: string;
  /** Author display name (GitHub user or member address) */
  authorName?: string;
  /** Link to author profile (GitHub, explorer, …) */
  authorLink?: string;
  /** Commit / tx hash */
  sha?: string;
  /** External link for the hash (GitHub commit page or explorer tx) */
  shaLink?: string;
  /** Backwards compatibility – project page still passes commitLink */
  commitLink?: string;
  /** Whether the author is a project maintainer (adds the green badge) */
  isMaintainer?: boolean;
  /** Extra Tailwind class for background colour */
  bgClass?: string;
  /** Project name – if provided a blue pill navigates to project page */
  projectName?: string | null;
  /** Any raw payload (XDR, Horizon record, …) shown in collapsible view */
  showXDR?: unknown | null;
  /** Optional link to related proposal page */
  proposalLink?: string | null | undefined;
  /** Attestation control rendered next to the hash; omit to hide entirely */
  attestation?: React.ReactNode;
  /** The commit is the project's latest one on chain. */
  isLatest?: boolean;
}

const CommitRecord: React.FC<CommitRecordProps> = ({
  message,
  authorName,
  authorLink,
  sha,
  shaLink,
  commitLink,
  isMaintainer = false,
  bgClass = "bg-surface",
  projectName = null,
  showXDR = null,
  proposalLink = null,
  attestation = null,
  isLatest = false,
}) => {
  const messageRef = useRef<HTMLAnchorElement | null>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  const [firstLine, ...otherLines] = useMemo(
    () =>
      message
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean),
    [message],
  );

  const hasMoreLines = isOverflowing || otherLines.length > 0;

  useEffect(() => {
    const checkOverflow = () => {
      if (messageRef.current) {
        setIsOverflowing(
          messageRef.current.scrollHeight > messageRef.current.clientHeight,
        );
      }
    };
    checkOverflow();
    window.addEventListener("resize", checkOverflow);
    return () => window.removeEventListener("resize", checkOverflow);
  }, [message]);

  return (
    <div className={`relative p-4 lg:p-7 flex flex-col gap-3 ${bgClass}`}>
      {(isLatest || isMaintainer) && (
        <div className="absolute top-0.5 left-1 flex space-x-1">
          {isLatest && (
            <span className="text-label font-bold leading-3 bg-accent-soft rounded-control p-0.5">
              verified commit
            </span>
          )}
        </div>
      )}

      {/* Project pill */}
      {projectName && (
        <a
          href={projectUrl(projectName)}
          className="self-start mb-2 px-2 py-0.5 text-label font-semibold bg-info text-surface rounded-control no-underline"
        >
          {projectName}
        </a>
      )}

      {/* Title & hash */}
      <div className="flex flex-wrap justify-between items-start gap-x-3 gap-y-1">
        <div className="min-w-0 flex-[1_1_12rem] flex gap-2 items-start">
          <a
            ref={messageRef}
            href={commitLink || shaLink || "#"}
            target="_blank"
            rel="noopener noreferrer"
            className={`text-body lg:text-lead font-medium text-ink hover:underline ${!isExpanded && "line-clamp-1"}`}
          >
            {firstLine}
          </a>
          {hasMoreLines && (
            <IconButton
              label={isExpanded ? "Show less" : "Show the full message"}
              aria-expanded={isExpanded}
              onClick={() => setIsExpanded(!isExpanded)}
              className="size-7 sm:size-7"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                width="18"
                height="18"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                className={isExpanded ? "rotate-180" : undefined}
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </IconButton>
          )}
        </div>
        {sha && (
          <div className="flex shrink-0 items-center gap-1">
            <CopyButton
              textToCopy={sha}
              size="sm"
              className="hover:bg-line-strong"
            />
            <a
              href={shaLink || commitLink}
              target="_blank"
              rel="noopener noreferrer"
              className="text-ui lg:text-card text-ink underline"
            >
              {sha.substring(0, 7)}
            </a>
            {attestation}
          </div>
        )}
      </div>

      {hasMoreLines && isExpanded && (
        <div className="whitespace-pre-wrap break-all break-words text-body text-ink-muted">
          {otherLines.join("\n")}
          {proposalLink && (
            <div className="mt-2">
              <a href={proposalLink} className="text-link underline break-all">
                View proposal ↗
              </a>
            </div>
          )}
        </div>
      )}

      {/* Author (no date – grouping done by parent) */}
      {authorName && (
        <div className="mt-1 text-ui text-ink-muted flex items-center gap-2">
          {authorLink ? (
            <a
              href={authorLink}
              target="_blank"
              rel="noopener noreferrer"
              className="px-2 py-0.5 bg-sunken text-ink font-bold"
            >
              @{authorName}
            </a>
          ) : (
            <span className="px-2 py-0.5 bg-sunken text-ink font-bold">
              @{authorName}
            </span>
          )}
          {isMaintainer && (
            <span className="text-label font-medium bg-accent-soft px-1 rounded-control">
              maintainer
            </span>
          )}
        </div>
      )}

      {/* Raw toggle */}
      {!!showXDR && (
        <div className="mt-2">
          <LinkButton onClick={() => setShowRaw(!showRaw)}>
            {showRaw ? "Hide raw transaction" : "Show raw transaction"}
          </LinkButton>
          {showRaw && (
            <div className="mt-2 max-h-96 overflow-auto bg-sunken p-2 rounded text-label">
              {/* JsonView provides nice folding – fallback to <pre> if not available */}
              <JsonView src={showXDR as any} theme="vscode" collapsed={2} />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CommitRecord;
