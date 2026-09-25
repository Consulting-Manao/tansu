import { useQueries } from "@tanstack/react-query";
import { Buffer } from "buffer";
import { useState } from "react";
import Button from "components/utils/Button";
import Input from "components/utils/Input";
import Modal from "components/utils/Modal";
import { toast } from "utils/utils";
import { projectKeyHex } from "utils/projectKey";
import {
  projectByKeyQuery,
  projectQuery,
  setSubProjects,
} from "@service/ProjectService";
import { queryClient } from "@service/queryClient";
import type { Project } from "../../../../packages/tansu";

/** The contract's limit. */
const MAX_SUB_PROJECTS = 10;

/**
 * For maintainers: the projects an organization groups. Saving replaces
 * them all, so the dialog starts from the chain, and keeps them by key: one
 * whose name cannot be read stays. One added must exist.
 */
const ManageSubProjectsModal = ({ project }: { project: Project }) => {
  // The list being edited, by key in hex; `null` while it is read.
  const [keys, setKeys] = useState<string[] | null>(null);
  const reads = useQueries(
    { queries: (keys ?? []).map(projectByKeyQuery) },
    queryClient,
  );
  const [newProjectName, setNewProjectName] = useState("");
  const [isChecking, setIsChecking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const handleOpen = async () => {
    setKeys(null);
    setError(null);
    setIsOpen(true);
    try {
      const fresh = await queryClient.query({
        ...projectQuery(project.name),
        staleTime: 0,
      });
      setKeys(
        (fresh?.sub_projects ?? []).map((key) =>
          Buffer.from(key).toString("hex"),
        ),
      );
    } catch (err: any) {
      setError(`Could not read the current sub-projects: ${err.message}`);
    }
  };

  const handleClose = () => {
    if (!isLoading) setIsOpen(false);
  };

  const label = (key: string) => {
    const read = reads[keys?.indexOf(key) ?? -1];
    const short = `${key.slice(0, 8)}…`;
    if (read?.data) return read.data.name;
    if (read?.isSuccess) return `Unknown project (${short})`;
    return read?.isError
      ? `Unreadable project (${short})`
      : `Loading project (${short})`;
  };

  const handleAddProject = async () => {
    if (!keys) return;
    const name = newProjectName.trim();
    const key = projectKeyHex(name);
    const problem = !name
      ? "Project name cannot be empty"
      : key === projectKeyHex(project.name)
        ? "A project cannot be its own sub-project"
        : keys.includes(key)
          ? "Project already in list"
          : keys.length >= MAX_SUB_PROJECTS
            ? `An organization has at most ${MAX_SUB_PROJECTS} sub-projects`
            : null;
    if (problem) {
      setError(problem);
      return;
    }
    setIsChecking(true);
    try {
      const found = await queryClient.query({
        ...projectQuery(name),
        staleTime: 0,
      });
      if (!found) throw new Error(`No project is named "${name}"`);
      setKeys((list) => list && [...list, key]);
      setNewProjectName("");
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsChecking(false);
    }
  };

  const handleSubmit = async () => {
    if (!keys) return;
    setIsLoading(true);
    setError(null);
    try {
      await setSubProjects(project.name, keys);
      toast.success(
        "Sub-projects updated",
        "Project sub-projects have been updated successfully.",
      );
      setIsOpen(false);
    } catch (err: any) {
      setError(err.message || "Failed to update sub-projects");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <button
        className="inline-flex items-center gap-2 px-2 py-1.5 sm:px-3 sm:py-2 min-w-0 flex-1 sm:flex-initial rounded-lg border border-zinc-200 bg-white text-primary text-sm font-medium shadow-[var(--shadow-card)] hover:bg-zinc-50 hover:border-zinc-300 transition-colors cursor-pointer text-left whitespace-nowrap"
        onClick={handleOpen}
      >
        <img
          src="/icons/plus-fill.svg"
          className="w-5 h-5 flex-shrink-0"
          alt=""
        />
        <span>Sub-Projects</span>
      </button>

      {isOpen && (
        <Modal onClose={handleClose}>
          <div className="flex flex-col gap-6 w-full">
            <h6 className="text-xl font-medium text-primary">Sub-Projects</h6>

            {error && (
              <div
                role="alert"
                className="p-3 bg-red-50 border border-red-200 rounded-md"
              >
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            {!keys && !error && (
              <p className="text-sm text-secondary">
                Reading the current sub-projects...
              </p>
            )}

            {keys && keys.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium text-primary">
                  Current sub-projects
                </p>
                <ul className="border border-gray-200 rounded-md divide-y divide-gray-100">
                  {keys.map((key) => (
                    <li
                      key={key}
                      className="flex items-center justify-between gap-2 px-3 py-2"
                    >
                      <span className="text-sm text-primary truncate">
                        {label(key)}
                      </span>
                      <Button
                        type="secondary"
                        onClick={() =>
                          setKeys(
                            (list) => list && list.filter((k) => k !== key),
                          )
                        }
                        disabled={isLoading}
                        className="shrink-0 text-xs py-1 px-2"
                        aria-label={`Remove ${label(key)}`}
                      >
                        Remove
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex gap-2">
              <Input
                type="text"
                aria-label="Project name"
                placeholder="Enter project name"
                value={newProjectName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setNewProjectName(e.target.value)
                }
                onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                  if (e.key === "Enter") handleAddProject();
                }}
                className="flex-1"
              />
              <Button
                onClick={handleAddProject}
                disabled={!keys || isLoading || isChecking}
                isLoading={isChecking}
              >
                Add
              </Button>
            </div>

            <div className="flex justify-end gap-3">
              <Button
                onClick={handleClose}
                type="secondary"
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={!keys || isLoading || isChecking}
                isLoading={isLoading}
              >
                Save Changes
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
};

export default ManageSubProjectsModal;
