import { Button, CopyButton, IconButton } from "components/ui";
import type { CommitHashState } from "./useCommitHash";

/** The commit's hash, its metadata and, for maintainers, its edit and save. */
const CommitHashSection = ({
  commit,
  isMaintainer,
  onHashChange,
}: {
  commit: CommitHashState;
  isMaintainer: boolean;
  onHashChange: () => void;
}) => {
  const { hash, commit: info, editing } = commit;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-ui font-semibold text-ink">Commit Hash</p>
      <div className="p-2 sm:py-3 sm:px-4 flex items-center gap-2 sm:gap-4 bg-accent-soft w-full">
        {isMaintainer && editing ? (
          <input
            type="text"
            aria-label="Commit hash"
            className="flex-1 bg-transparent text-body sm:text-lead text-ink outline-none border-none font-mono"
            placeholder="Enter commit hash"
            value={hash}
            onChange={(e) => {
              commit.setHash(e.target.value);
              onHashChange();
            }}
          />
        ) : (
          <p className="flex-1 text-body sm:text-lead text-ink break-all font-mono">
            {hash
              ? isMaintainer
                ? hash
                : `${hash.slice(0, 24)}…`
              : "No hash available"}
          </p>
        )}
        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          <CopyButton textToCopy={hash} size="sm" />
          {info?.html_url && (
            <a
              className="p-2 hover:bg-sunken rounded"
              href={info.html_url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open commit in new tab"
            >
              <img src="/icons/link.svg" className="w-4 h-4" alt="" />
            </a>
          )}
          {isMaintainer && (
            <IconButton
              onClick={editing ? commit.cancelEditing : commit.startEditing}
              label={editing ? "Cancel editing" : "Edit commit hash"}
            >
              <img
                src={editing ? "/icons/cancel.svg" : "/icons/edit.svg"}
                className="w-4 h-4"
                alt=""
              />
            </IconButton>
          )}
        </div>
      </div>

      {info && (
        <div className="flex flex-wrap gap-x-6 gap-y-2 mt-1">
          {info.date && (
            <div className="flex gap-2">
              <p className="text-ui text-ink-muted">Date:</p>
              <p className="text-ui text-ink font-medium">{info.date}</p>
            </div>
          )}
          {info.author && (
            <div className="flex gap-2">
              <p className="text-ui text-ink-muted">Author:</p>
              <p className="text-ui text-ink font-medium">@{info.author}</p>
            </div>
          )}
        </div>
      )}

      {isMaintainer && (
        <div className="flex justify-end mt-1">
          <Button
            onClick={commit.save}
            loading={commit.saving}
            disabled={commit.saving || !hash.trim()}
            size="sm"
            tone="secondary"
            className="w-full sm:w-auto"
          >
            {commit.saving ? "Saving…" : "Save Hash to Chain"}
          </Button>
        </div>
      )}

      {!hash.trim() && (
        <p className="text-ui text-warning">
          No commit hash found on-chain. Enter a hash manually to view or attach
          evidence.
        </p>
      )}
    </div>
  );
};

export default CommitHashSection;
