// src/components/page/dashboard/OnChainActions.tsx
// Renders the list of on-chain actions grouped by day. Uses the shared
// CommitRecord component for individual rows.

import { useQuery } from "@tanstack/react-query";
import Loading from "../../utils/Loading";
import {
  activityQuery,
  type OnChainAction,
} from "../../../service/OnChainActivityService";
import { queryClient } from "../../../service/queryClient";
import { formatDate } from "../../../utils/formatTimeFunctions";
import { getStellarExpertUrl } from "../../../utils/urls";
import CommitRecord from "../../CommitRecord";
import {
  paramNamesForMethod,
  summaryForMethod,
} from "../../../constants/onchain";
import { badgeName } from "../../../utils/badges";
import { proposalUrl } from "utils/urls";

interface Props {
  /** Stellar address of the member we are displaying. */
  address: string;
  /** Project names by hex key, for the calls whose name the list lacks. */
  projectNames: Record<string, string>;
}

const OnChainActions: React.FC<Props> = ({ address, projectNames }) => {
  const activity = useQuery(activityQuery(address), queryClient);
  const actions = (activity.data ?? []).map((action) => ({
    ...action,
    projectName:
      action.projectName ??
      (action.projectKey && projectNames[action.projectKey]) ??
      null,
  }));
  const isLoading = activity.isPending;
  const loadError = activity.isError
    ? "Could not load on-chain activity."
    : null;

  // Group by calendar day (ISO key YYYY-MM-DD) for stable sorting
  const grouped = actions.reduce<Record<string, OnChainAction[]>>(
    (acc, act) => {
      const isoKey = new Date(act.timestamp).toISOString().slice(0, 10);
      (acc[isoKey] ??= []).push(act);
      return acc;
    },
    {},
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6" aria-busy="true">
        <Loading />
      </div>
    );
  }

  if (loadError) {
    return (
      <p className="text-sm text-red-600 py-4" role="alert">
        {loadError}
      </p>
    );
  }

  if (actions.length === 0) {
    return <p className="text-sm text-secondary">No on-chain activity yet.</p>;
  }

  return (
    <div className="flex flex-col gap-6 pl-6 max-h-96 overflow-visible">
      {Object.entries(grouped)
        // Sort day groups by ISO date key descending (latest first)
        .sort(([d1], [d2]) => (d1 < d2 ? 1 : -1))
        .map(([isoDay, list]) => (
          <div key={isoDay} className="flex flex-col gap-4">
            <h3 className="relative">
              <div className="absolute -left-6 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-[#2D0F512E] rounded-full bg-transparent" />
              <span className="text-lg font-medium text-primary">
                {formatDate(`${isoDay}T00:00:00.000Z`)}
              </span>
            </h3>
            {list
              // Ensure items within a day are sorted by timestamp descending
              .slice()
              .sort((a, b) => b.timestamp - a.timestamp)
              .map((a) => (
                <div key={a.txHash} className="relative">
                  <div className="absolute -left-[21px] lg:-left-[31px] w-[2px] h-full bg-[#2D0F510D]" />
                  {(() => {
                    const link = proposalLink(a);
                    const props = link
                      ? { commitLink: link }
                      : {
                          shaLink: getStellarExpertUrl(a.txHash, "transaction"),
                        };
                    return (
                      <CommitRecord
                        message={summaryFor(a)}
                        sha={a.txHash}
                        {...props}
                        bgClass="bg-indigo-50"
                        projectName={a.projectName ?? null}
                        showXDR={a.raw}
                        proposalLink={proposalLink(a) ?? null}
                      />
                    );
                  })()}
                </div>
              ))}
          </div>
        ))}
    </div>
  );
};

export default OnChainActions;

// -----------------------------------------------------------------------------
// Helper utilities
// -----------------------------------------------------------------------------

function summaryFor(a: OnChainAction): string {
  const firstLine = summaryForMethod(a.method, a.details);

  const params: any[] = (a.details.params as any[]) ?? [];

  const pretty = (v: any): string => {
    if (v === null || v === undefined) return "";
    if (typeof v === "string" || typeof v === "number") return String(v);
    if (typeof v.address === "string") return v.address;
    if (typeof v.str === "string") return v.str;
    if (typeof v.sym === "string") return v.sym;
    if (typeof v.bin === "string") return `${v.bin.slice(0, 8)}…`;
    if (Array.isArray(v.vec)) {
      // Special-case badge vectors for readability
      const maybeInts = v.vec.every(
        (x: any) =>
          typeof x === "number" || x?.i32 !== undefined || x?.u32 !== undefined,
      );
      if (maybeInts) {
        return `[${v.vec.map((b: any) => badgeName(typeof b === "number" ? b : (b?.i32 ?? b?.u32 ?? 0))).join(", ")}]`;
      }
      return `[${v.vec.map(pretty).join(", ")}]`;
    }
    return JSON.stringify(v);
  };

  const paramNames = paramNamesForMethod(a.method);
  const paramLines = params.map((p, idx) => {
    const label = paramNames[idx] ?? `arg${idx}`;
    return `${label}: ${pretty(p)}`;
  });

  // Add proposal link only for vote / execute (create_proposal intentionally skipped for now)
  if (["vote", "execute"].includes(a.method)) {
    const link = proposalLink(a);
    if (link) paramLines.push(`proposal_link: ${link}`);
  }

  return paramLines.length ? [firstLine, ...paramLines].join("\n") : firstLine;
}

function proposalLink(a: OnChainAction): string | undefined {
  if (
    (a.method === "vote" || a.method === "execute") &&
    a.details.proposalId !== undefined &&
    a.details.proposalId !== null
  ) {
    return proposalUrl(a.projectName ?? "", a.details.proposalId as number);
  }
  return undefined;
}
