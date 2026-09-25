/**
 * tansu.toml, a project's information file (like SEP-1's stellar.toml): the
 * rules for its form, and a writer that keeps what the form does not manage.
 */
import { stringify } from "smol-toml";
import { ProjectType } from "../types/projectConfig";
import {
  getRepositoryPrincipalField,
  getRepositoryProjectPath,
  getRepositoryRid,
  getRepositorySeedHost,
  type RepositoryProvider,
} from "./editLinkFunctions";

/** What the project configuration form edits. */
export interface TansuTomlForm {
  projectType: ProjectType;
  /** The maintainers' Stellar addresses. */
  maintainers: string[];
  /** Their handles on the repository host, in the same order. */
  handles: string[];
  fullName: string;
  orgName: string;
  orgUrl: string;
  orgLogo: string;
  orgDescription: string;
  repositoryUrl: string;
  repositoryProvider?: RepositoryProvider | undefined;
}

type Toml = Record<string, any>;

const isTable = (value: unknown): value is Toml =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * The file for a form. Over a previous file (parsed), what the form does not
 * manage stays: every other value, each maintainer's other principal fields,
 * and the Radicle seed of the same repository.
 */
export function writeTansuToml(
  form: TansuTomlForm,
  previous: Toml = {},
  previousRepositoryUrl?: string,
): string {
  const isSoftware = form.projectType === ProjectType.SOFTWARE;
  const isRadicle = isSoftware && form.repositoryProvider === "radicle";

  const doc: Toml = isTable(previous.DOCUMENTATION)
    ? { ...previous.DOCUMENTATION }
    : {};
  doc.ORG_DBA = form.fullName.trim();
  doc.ORG_NAME = form.orgName.trim();
  doc.ORG_URL = form.orgUrl.trim();
  doc.ORG_LOGO = form.orgLogo.trim();
  doc.ORG_DESCRIPTION = form.orgDescription.trim();
  // The README is its own file, not a key here.
  delete doc.README;
  delete doc.ORG_GITHUB;
  delete doc.ORG_REPOSITORY_PROVIDER;
  if (isRadicle) {
    doc.ORG_REPOSITORY_PROVIDER = "radicle";
    const seed = getRepositorySeedHost(form.repositoryUrl);
    const sameRepository =
      !!getRepositoryRid(form.repositoryUrl) &&
      getRepositoryRid(form.repositoryUrl) ===
        getRepositoryRid(previousRepositoryUrl);
    if (seed) doc.ORG_REPOSITORY_SEED = seed;
    else if (!sameRepository) delete doc.ORG_REPOSITORY_SEED;
  } else {
    delete doc.ORG_REPOSITORY_SEED;
    if (isSoftware) {
      doc.ORG_GITHUB = getRepositoryProjectPath(form.repositoryUrl);
    }
  }

  // PRINCIPALS[i] is ACCOUNTS[i]'s: a maintainer keeps their entry.
  const accounts: unknown[] = Array.isArray(previous.ACCOUNTS)
    ? previous.ACCOUNTS
    : [];
  const principals: unknown[] = Array.isArray(previous.PRINCIPALS)
    ? previous.PRINCIPALS
    : [];
  const field = getRepositoryPrincipalField(form.repositoryProvider);
  const PRINCIPALS = form.maintainers.map((address, i) => {
    const entry = principals[accounts.indexOf(address)];
    const {
      github: _github,
      radicle: _radicle,
      ...other
    } = isTable(entry) ? entry : {};
    return { ...other, [field]: form.handles[i] ?? "" };
  });

  const {
    VERSION: _version,
    PROJECT_TYPE: _type,
    ACCOUNTS: _accounts,
    DOCUMENTATION: _doc,
    PRINCIPALS: _principals,
    ...rest
  } = previous;
  return stringify({
    VERSION: "2.0.0",
    PROJECT_TYPE: form.projectType,
    ...rest,
    ACCOUNTS: form.maintainers,
    DOCUMENTATION: doc,
    PRINCIPALS,
  });
}

/** The project's display name: printable ASCII, at most 100 characters. */
export function validateFullName(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return "Project full name is required";
  if (trimmed.length > 100) {
    return "Project full name must be 100 characters or fewer";
  }
  if (!/^[\x20-\x7E]+$/.test(trimmed)) {
    return "Project full name may only contain ASCII characters";
  }
  return null;
}

/** A maintainer's handle on the repository host (`label` names it). */
export function validateHandle(handle: string, label: string): string | null {
  if (!handle.trim()) return `${label} is required`;
  if (!/^[A-Za-z0-9_-]{1,30}$/.test(handle)) {
    return `${label} must use ASCII letters, digits, _ or -, and be 30 characters or fewer`;
  }
  return null;
}

type OrgField = "orgName" | "orgUrl" | "orgLogo" | "orgDescription";

/** The organization fields' errors, by field; empty when all are valid. */
export function validateOrganization(
  form: Pick<TansuTomlForm, OrgField>,
): Partial<Record<OrgField, string>> {
  const errors: Partial<Record<OrgField, string>> = {};
  if (!form.orgName.trim()) errors.orgName = "Organization name is required";
  if (form.orgUrl && !form.orgUrl.startsWith("https://")) {
    errors.orgUrl = "URL must start with https://";
  }
  if (form.orgLogo && !form.orgLogo.startsWith("https://")) {
    errors.orgLogo = "Logo URL must start with https://";
  }
  if (form.orgDescription.trim().split(/\s+/).length < 3) {
    errors.orgDescription = "Description must contain at least 3 words";
  }
  return errors;
}
