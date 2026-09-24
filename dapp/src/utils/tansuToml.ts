/**
 * tansu.toml, a project's information file (like SEP-1's stellar.toml): the
 * rules for its form, and a writer that keeps what the form does not manage.
 */
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

/**
 * The file for a form. Over a previous file (parsed), what the form does not
 * manage stays: unknown keys, and the Radicle seed of the same repository.
 */
export function writeTansuToml(
  form: TansuTomlForm,
  previous: Toml = {},
  previousRepositoryUrl?: string,
): string {
  const isSoftware = form.projectType === ProjectType.SOFTWARE;
  const isRadicle = isSoftware && form.repositoryProvider === "radicle";

  const doc: Toml = { ...(previous.DOCUMENTATION ?? {}) };
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

  const principal = getRepositoryPrincipalField(form.repositoryProvider);
  const { VERSION: _version, PROJECT_TYPE: _type, ...rest } = previous;
  return serialize({
    VERSION: "2.0.0",
    PROJECT_TYPE: form.projectType,
    ...rest,
    ACCOUNTS: form.maintainers,
    DOCUMENTATION: doc,
    PRINCIPALS: form.handles.map((handle) => ({ [principal]: handle })),
  });
}

/** A TOML value: strings as basic strings, which JSON's escaping fits. */
const value = (v: unknown) =>
  typeof v === "string" ? JSON.stringify(v) : String(v);

const isScalar = (v: unknown) =>
  typeof v === "string" || typeof v === "number" || typeof v === "boolean";

/** Top-level keys first, then the tables, in the order readers expect. */
function serialize(data: Toml): string {
  const lines: string[] = [];
  const tables = new Set(["ACCOUNTS", "DOCUMENTATION", "PRINCIPALS"]);
  for (const [key, v] of Object.entries(data)) {
    if (!tables.has(key) && isScalar(v)) lines.push(`${key}=${value(v)}`);
  }
  const accounts = (data.ACCOUNTS as string[]).map((a) => `    ${value(a)}`);
  lines.push("", `ACCOUNTS=[\n${accounts.join(",\n")}\n]`, "");
  lines.push("[DOCUMENTATION]");
  for (const [key, v] of Object.entries(data.DOCUMENTATION as Toml)) {
    if (isScalar(v)) lines.push(`${key}=${value(v)}`);
  }
  for (const principal of data.PRINCIPALS as Toml[]) {
    lines.push("", "[[PRINCIPALS]]");
    for (const [key, v] of Object.entries(principal)) {
      lines.push(`${key}=${value(v)}`);
    }
  }
  return `${lines.join("\n")}\n`;
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
