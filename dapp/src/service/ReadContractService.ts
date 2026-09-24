/**
 * The reads of the pages that still hold the current project outside React
 * (StateService), over the queries of ProjectService, MemberService and
 * ProposalService. Like before, a failed read is `null`.
 */
import { Buffer } from "buffer";
import type { Badges, Member, Project } from "../../packages/tansu";
import { loadProjectName } from "./StateService";
import { memberQuery } from "./MemberService";
import {
  anonymousConfigQuery,
  badgesQuery,
  commitQuery,
  projectByKeyQuery,
  projectQuery,
  projectsQuery,
} from "./ProjectService";
import { conflictsQuery } from "./ProposalService";
import { queryClient } from "./queryClient";

const orNull = <T>(read: Promise<T>) => read.catch(() => null);

export const getProjectFromName = (name: string): Promise<Project | null> =>
  name.trim()
    ? orNull(queryClient.query(projectQuery(name)))
    : Promise.resolve(null);

export const getProjectFromId = (key: Uint8Array): Promise<Project | null> =>
  orNull(
    queryClient.query(projectByKeyQuery(Buffer.from(key).toString("hex"))),
  );

export const getProject = () => getProjectFromName(loadProjectName() ?? "");

export const getProjectHash = (): Promise<string | null> => {
  const name = loadProjectName();
  return name
    ? orNull(queryClient.query(commitQuery(name)))
    : Promise.resolve(null);
};

export const getBadges = (): Promise<Badges | null> => {
  const name = loadProjectName();
  return name
    ? orNull(queryClient.query(badgesQuery(name)))
    : Promise.resolve(null);
};

export const getMember = (address: string): Promise<Member | null> =>
  address.trim()
    ? orNull(queryClient.query(memberQuery(address)))
    : Promise.resolve(null);

export const getProjectsPage = async (page: number): Promise<Project[]> =>
  (await orNull(queryClient.query(projectsQuery(page)))) ?? [];

/** Unlike the others, a failed read throws: it is not an empty list. */
export const getConflictOfInterest = (name: string, id: number) =>
  queryClient.query(conflictsQuery(name, Number(id)));

export const hasAnonymousVotingConfig = async (name: string) =>
  !!(await orNull(queryClient.query(anonymousConfigQuery(name))));
