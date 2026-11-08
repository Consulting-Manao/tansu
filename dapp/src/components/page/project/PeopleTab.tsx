import { useQuery } from "@tanstack/react-query";
import { badgesQuery } from "@service/ProjectService";
import { queryClient } from "@service/queryClient";
import { Card, CardHeader, Loading } from "components/ui";
import { focusRing } from "components/ui/style";
import { truncateMiddle } from "utils/utils";

const BADGE_SECTIONS = [
  ["developer", "Developers"],
  ["triage", "Triage"],
  ["community", "Community"],
] as const;

/** A member: their git handle if the project knows it, and their address. */
export const Person = ({
  address,
  handle,
  onOpen,
}: {
  address: string;
  handle?: string | undefined;
  onOpen: (address: string) => void;
}) => (
  <button
    type="button"
    title={address}
    onClick={() => onOpen(address)}
    className={`flex w-full min-w-0 items-center gap-3 rounded-control p-2 text-left hover:bg-sunken ${focusRing}`}
  >
    <span
      aria-hidden="true"
      className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft font-bold text-accent-ink"
    >
      {(handle || address).slice(0, 1).toUpperCase()}
    </span>
    <span className="flex min-w-0 flex-col">
      {handle && <span className="truncate font-semibold">@{handle}</span>}
      <span className="truncate font-mono text-small text-ink-muted">
        {truncateMiddle(address, 16)}
      </span>
    </span>
  </button>
);

const People = ({
  title,
  addresses,
  handles,
  onOpen,
}: {
  title: string;
  addresses: string[];
  handles: Record<string, string>;
  onOpen: (address: string) => void;
}) => (
  <Card>
    <CardHeader title={`${title} · ${addresses.length}`} />
    <ul className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
      {addresses.map((address) => (
        <li key={address}>
          <Person address={address} handle={handles[address]} onOpen={onOpen} />
        </li>
      ))}
    </ul>
  </Card>
);

/** The project's people: its maintainers, then the members it badged. */
const PeopleTab = ({
  name,
  maintainers,
  handles,
  onOpen,
}: {
  name: string;
  maintainers: string[];
  handles: Record<string, string>;
  onOpen: (address: string) => void;
}) => {
  const badgesRead = useQuery(badgesQuery(name), queryClient);
  const badges = badgesRead.data;

  return (
    <div className="flex flex-col gap-6">
      <People
        title="Maintainers"
        addresses={maintainers}
        handles={handles}
        onOpen={onOpen}
      />
      {badgesRead.isPending ? (
        <Loading />
      ) : (
        BADGE_SECTIONS.map(
          ([badge, title]) =>
            !!badges?.[badge].length && (
              <People
                key={badge}
                title={title}
                addresses={badges[badge]}
                handles={handles}
                onOpen={onOpen}
              />
            ),
        )
      )}
    </div>
  );
};

export default PeopleTab;
