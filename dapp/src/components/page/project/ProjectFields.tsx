/**
 * The fields of a project's configuration, and their checks, shared by
 * registering a project and updating it: its repository, its maintainers
 * with their handles, its organization and finality threshold.
 */
import Button from "components/utils/Button";
import Input from "components/utils/Input";
import Textarea from "components/utils/Textarea";
import {
  MAX_FINALITY_THRESHOLD_PERCENT,
  MIN_FINALITY_THRESHOLD_PERCENT,
} from "constants/attestation";
import {
  getRepositoryHandleLabel,
  getRepositoryHandlePlaceholder,
  getRepositoryProvider,
  getRepositoryProviderLabel,
  getRepositoryUrlPlaceholder,
  SUPPORTED_REPOSITORY_PROVIDERS,
  type RepositoryProvider,
} from "utils/editLinkFunctions";
import {
  validateHandle,
  validateOrganization,
  type TansuTomlForm,
} from "utils/tansuToml";
import { validateMaintainerAddress } from "utils/validations";

/** A maintainer: their address, and their handle on the repository host. */
export interface MaintainerRow {
  address: string;
  handle: string;
  addressError?: string | null;
  handleError?: string | null;
}

/** What a handle is called: on the repository's host, or generic. */
export const handleLabel = (provider: RepositoryProvider | undefined) =>
  provider ? getRepositoryHandleLabel(provider) : "Maintainer Handle";

/** The rows with their errors; `valid` when none has one. */
export function checkMaintainers(
  rows: MaintainerRow[],
  label: string,
): { rows: MaintainerRow[]; valid: boolean } {
  const checked = rows.map((row) => ({
    ...row,
    addressError: validateMaintainerAddress(row.address),
    handleError: validateHandle(row.handle, label),
  }));
  return {
    rows: checked,
    valid: checked.every((row) => !row.addressError && !row.handleError),
  };
}

export const MaintainerRows = ({
  rows,
  onChange,
  provider,
}: {
  rows: MaintainerRow[];
  onChange: (rows: MaintainerRow[]) => void;
  provider: RepositoryProvider | undefined;
}) => {
  const set = (i: number, change: Partial<MaintainerRow>) =>
    onChange(rows.map((row, j) => (j === i ? { ...row, ...change } : row)));
  return (
    <div className="flex flex-col gap-[18px]">
      {rows.map((row, i) => (
        <div
          key={i}
          className="flex flex-col md:flex-row md:items-end gap-[18px]"
        >
          <Input
            className="flex-1"
            label={i === 0 ? "Maintainer Address" : undefined}
            aria-label={i === 0 ? undefined : `Maintainer ${i + 1} address`}
            placeholder="G... or C..."
            value={row.address}
            error={row.addressError}
            onChange={(e) =>
              set(i, { address: e.target.value.trim(), addressError: null })
            }
          />
          <Input
            className="flex-1"
            label={i === 0 ? handleLabel(provider) : undefined}
            aria-label={i === 0 ? undefined : `Maintainer ${i + 1} handle`}
            placeholder={getRepositoryHandlePlaceholder(provider)}
            value={row.handle}
            error={row.handleError}
            onChange={(e) =>
              set(i, { handle: e.target.value, handleError: null })
            }
          />
          {rows.length > 1 && (
            <button
              type="button"
              aria-label={`Remove maintainer ${i + 1}`}
              className="self-center min-w-6 min-h-6"
              onClick={() => onChange(rows.filter((_, j) => j !== i))}
            >
              <img alt="" src="/icons/remove.svg" />
            </button>
          )}
        </div>
      ))}
      <div className="flex justify-end">
        <Button
          type="tertiary"
          icon="/icons/plus.svg"
          onClick={() => onChange([...rows, { address: "", handle: "" }])}
        >
          Add Maintainer
        </Button>
      </div>
    </div>
  );
};

/** The repository's host, as chosen or read from its URL. */
export const activeProvider = (url: string, chosen: RepositoryProvider) =>
  getRepositoryProvider(url) || chosen;

/**
 * The repository: its host, which a pasted URL sets, and its URL. Labels and
 * placeholders follow the host.
 */
export const RepositoryFields = ({
  url,
  provider,
  onChange,
  error,
}: {
  url: string;
  provider: RepositoryProvider;
  onChange: (url: string, provider: RepositoryProvider) => void;
  error?: string | null | undefined;
}) => {
  const active = activeProvider(url, provider);
  const label = getRepositoryProviderLabel(active);
  return (
    <div className="flex flex-col gap-[30px]">
      <label className="flex flex-col gap-3">
        <span className="leading-4 text-base text-secondary">
          Repository Provider
        </span>
        <select
          value={active}
          onChange={(e) => onChange(url, e.target.value as RepositoryProvider)}
          className="p-[18px] border border-[#978AA1] outline-none bg-white"
        >
          {SUPPORTED_REPOSITORY_PROVIDERS.map((host) => (
            <option key={host} value={host}>
              {getRepositoryProviderLabel(host)}
            </option>
          ))}
        </select>
        <span className="leading-[16px] text-base text-tertiary">
          You can choose the provider first or paste the repository URL below
          and let the form detect it.
        </span>
      </label>
      <Input
        label={`${label} Repository URL`}
        placeholder={getRepositoryUrlPlaceholder(active)}
        value={url}
        onChange={(e) =>
          onChange(
            e.target.value,
            getRepositoryProvider(e.target.value) || active,
          )
        }
        description={
          active === "radicle"
            ? "Paste the full Radicle node URL when possible, e.g. https://radicle.network/nodes/iris.radicle.network/rad:z3gqc.... If only rad:... is provided, Tansu will use the default seed."
            : `Supported formats are HTTPS or SSH URLs for ${label}.`
        }
        error={error}
      />
    </div>
  );
};

type OrgField = "orgName" | "orgUrl" | "orgLogo" | "orgDescription";
export type Organization = Pick<TansuTomlForm, OrgField>;

export const emptyOrganization = (): Organization => ({
  orgName: "",
  orgUrl: "",
  orgLogo: "",
  orgDescription: "",
});

/** The organization's name, links and description, with their errors. */
export const OrganizationFields = ({
  org,
  errors,
  onChange,
}: {
  org: Organization;
  errors: ReturnType<typeof validateOrganization>;
  onChange: (org: Organization, field: OrgField) => void;
}) => {
  const field = (name: OrgField) => ({
    value: org[name],
    error: errors[name],
    onChange: (e: { target: { value: string } }) =>
      onChange({ ...org, [name]: e.target.value }, name),
  });
  return (
    <>
      <Input
        label="Organization Name"
        placeholder="Your organisation / project owner name"
        {...field("orgName")}
      />
      <Input
        label="Organization Website URL"
        placeholder="https://example.com"
        {...field("orgUrl")}
      />
      <Input
        label="Organization Logo URL"
        placeholder="https://.../logo.png"
        {...field("orgLogo")}
      />
      <Textarea
        label="Project Description"
        placeholder="Describe your project (min 3 words)"
        {...field("orgDescription")}
      />
    </>
  );
};

/** The share of maintainers whose attestations make a commit final. */
export const ThresholdField = ({
  value,
  error,
  onChange,
}: {
  value: string;
  error?: string | null | undefined;
  onChange: (value: string) => void;
}) => (
  <Input
    label="Finality threshold (%)"
    type="number"
    min={MIN_FINALITY_THRESHOLD_PERCENT}
    max={MAX_FINALITY_THRESHOLD_PERCENT}
    value={value}
    onChange={(e) => onChange(e.target.value)}
    description={`Percent of maintainers who must attest a commit for it to be final. Between ${MIN_FINALITY_THRESHOLD_PERCENT} and ${MAX_FINALITY_THRESHOLD_PERCENT}; it can be changed later in the project config.`}
    error={error}
  />
);
