import { useQueries } from "@tanstack/react-query";
import { Buffer } from "buffer";
import { useState } from "react";
import Button from "components/utils/Button";
import Input from "components/utils/Input";
import Modal from "components/utils/Modal";
import { toast } from "utils/utils";
import { projectByKeyQuery, setSubProjects } from "@service/ProjectService";
import { queryClient } from "@service/queryClient";
import type { Project } from "../../../../packages/tansu";

/** For maintainers: the projects an organization groups. */
const ManageSubProjectsModal = ({ project }: { project: Project }) => {
  const subProjects = useQueries(
    {
      queries: (project.sub_projects ?? []).map((key) =>
        projectByKeyQuery(Buffer.from(key).toString("hex")),
      ),
    },
    queryClient,
  );
  const [subProjectNames, setSubProjectNames] = useState<string[]>([]);
  const [newProjectName, setNewProjectName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const handleOpen = () => {
    setSubProjectNames(
      subProjects.flatMap(({ data }) => (data ? [data.name] : [])),
    );
    setIsOpen(true);
  };

  const handleClose = () => {
    setIsOpen(false);
  };

  const handleAddProject = () => {
    if (!newProjectName.trim()) {
      setError("Project name cannot be empty");
      return;
    }

    if (subProjectNames.includes(newProjectName.trim())) {
      setError("Project already in list");
      return;
    }

    setSubProjectNames([...subProjectNames, newProjectName.trim()]);
    setNewProjectName("");
    setError(null);
  };

  const handleRemoveProject = (index: number) => {
    setSubProjectNames(subProjectNames.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    setIsLoading(true);
    setError(null);

    try {
      await setSubProjects(project.name, subProjectNames);

      toast.success(
        "Sub-projects updated",
        "Project sub-projects have been updated successfully.",
      );

      handleClose();
    } catch (err: any) {
      setError(err.message || "Failed to update sub-projects");
      toast.error("Error", err.message || "Failed to update sub-projects");
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
              <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            {subProjectNames.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium text-primary">
                  Current sub-projects
                </p>
                <ul className="border border-gray-200 rounded-md divide-y divide-gray-100">
                  {subProjectNames.map((name, index) => (
                    <li
                      key={`${name}-${index}`}
                      className="flex items-center justify-between gap-2 px-3 py-2"
                    >
                      <span className="text-sm text-primary truncate">
                        {name}
                      </span>
                      <Button
                        type="secondary"
                        onClick={() => handleRemoveProject(index)}
                        disabled={isLoading}
                        className="shrink-0 text-xs py-1 px-2"
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
                placeholder="Enter project name"
                value={newProjectName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setNewProjectName(e.target.value)
                }
                onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                  if (e.key === "Enter") {
                    handleAddProject();
                  }
                }}
                className="flex-1"
              />
              <Button onClick={handleAddProject} disabled={isLoading}>
                Add
              </Button>
            </div>

            <div className="flex justify-end gap-3">
              <Button onClick={handleClose} type="secondary">
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={isLoading}
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
