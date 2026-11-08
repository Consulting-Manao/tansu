import { useEffect, useRef, useState } from "react";
import { commitHash, commitQuery } from "@service/ProjectService";
import { queryClient } from "@service/queryClient";
import {
  repoCommitQuery,
  repoHeadQuery,
} from "@service/RepositoryMetadataService";
import { formatDate } from "utils/formatTimeFunctions";
import { toast } from "utils/utils";

export interface CommitInfo {
  sha: string;
  html_url: string;
  date: string;
  author: string;
}

/**
 * The commit the finality dialog shows: the one on chain when it opens, with
 * the repository's metadata; a maintainer may edit it (starting from the
 * repository's head) and save it on chain.
 */
export function useCommitHash(
  projectName: string,
  repositoryUrl: string,
  open: boolean,
) {
  const [hash, setHash] = useState("");
  const [commit, setCommit] = useState<CommitInfo | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const onChain = useRef("");

  useEffect(() => {
    if (!open) return;
    setEditing(false);
    (async () => {
      const latest = await queryClient
        .query(commitQuery(projectName))
        .catch(() => null);
      if (!latest) {
        setHash("");
        setCommit(null);
        return;
      }
      setHash(latest);
      onChain.current = latest;
      if (!repositoryUrl) return;
      try {
        const found = await queryClient.query(
          repoCommitQuery(repositoryUrl, latest),
        );
        if (found) {
          setCommit({
            sha: found.sha,
            html_url: found.html_url || "",
            date: formatDate(found.commit.committer.date),
            author: found.commit.author.name,
          });
        }
      } catch {
        // The hash alone, then.
        setCommit(null);
      }
    })();
  }, [open, projectName, repositoryUrl]);

  const startEditing = async () => {
    setEditing(true);
    if (!repositoryUrl) return;
    try {
      const head = await queryClient.query(repoHeadQuery(repositoryUrl));
      if (head) setHash(head);
    } catch {
      // Keep the current hash.
    }
  };

  const cancelEditing = () => {
    setEditing(false);
    setHash(onChain.current);
  };

  const save = async () => {
    if (!hash.trim()) {
      toast.error("Update Hash", "Please enter a commit hash.");
      return;
    }
    setSaving(true);
    try {
      await commitHash(projectName, hash);
      toast.success(
        "Hash Updated",
        "Commit hash has been updated on-chain. Evidence will reload.",
      );
      setEditing(false);
      onChain.current = hash;
    } catch (err: any) {
      toast.error(
        "Update Hash",
        err?.message || "Failed to update commit hash.",
      );
    } finally {
      setSaving(false);
    }
  };

  return {
    hash,
    setHash,
    commit,
    editing,
    saving,
    startEditing,
    cancelEditing,
    save,
  };
}

export type CommitHashState = ReturnType<typeof useCommitHash>;
