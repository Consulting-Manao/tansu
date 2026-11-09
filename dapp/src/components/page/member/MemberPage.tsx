import { useQueries, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Buffer } from "buffer";
import { activityQuery } from "@service/OnChainActivityService";
import { projectByKeyQuery } from "@service/ProjectService";
import { queryClient } from "@service/queryClient";
import { Badge, Card, CardHeader, Loading, Tabs } from "components/ui";
import { withErrorBoundary } from "components/utils/ErrorBoundary";
import Markdown from "components/utils/Markdown";
import { badgeName } from "utils/badges";
import { getIpfsBasicLink } from "utils/ipfsFunctions";
import {
  memberAddressFromUrl,
  memberTabFromUrl,
  memberUrl,
  projectUrl,
  type MemberTab,
} from "utils/urls";
import OnChainActions from "../dashboard/OnChainActions";
import { useMemberProfile } from "./useMemberProfile";

/** The member page under its head: Profile (about, projects) and On-chain activity, the one shown named by `?tab=`. */
const MemberPage = () => {
  const address = memberAddressFromUrl();
  const { memberRead, member, cid, profile } = useMemberProfile(address);
  const [tab, setTab] = useState<MemberTab>(memberTabFromUrl);
  const activity = useQuery(
    { ...activityQuery(address), enabled: !!address },
    queryClient,
  );
  const projectReads = useQueries(
    {
      queries: (member?.projects ?? []).map(({ project }) =>
        projectByKeyQuery(Buffer.from(project).toString("hex")),
      ),
    },
    queryClient,
  );
  const projects = (member?.projects ?? []).map((project, index) => ({
    key: Buffer.from(project.project).toString("hex"),
    name: projectReads[index]?.data?.name,
    badges: [...new Set(project.badges)],
  }));

  if (!address) return null;
  if (memberRead.isPending) return <Loading />;

  const profileTab = (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      {profile?.description && (
        <Card>
          <CardHeader title="About" />
          <Markdown baseUrl={getIpfsBasicLink(cid)}>
            {profile.description}
          </Markdown>
        </Card>
      )}
      <Card className={profile?.description ? "" : "lg:col-span-2"}>
        <CardHeader title="Projects" />
        {projects.length === 0 ? (
          <p className="text-ink-muted">
            No community engagement with any projects yet
          </p>
        ) : (
          <ul className="-mx-2 flex flex-col">
            {projects.map((project) => (
              <li key={project.key}>
                <a
                  href={project.name ? projectUrl(project.name) : undefined}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-control p-2 text-ink no-underline hover:bg-sunken"
                >
                  <span className="font-mono font-semibold">
                    {project.name ?? "Unknown project"}
                  </span>
                  <span className="flex flex-wrap gap-1.5">
                    {project.badges.map((badge) => (
                      <Badge key={badge}>{badgeName(badge)}</Badge>
                    ))}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );

  return (
    <Tabs
      label="Member"
      layout="page"
      items={[
        { id: "profile", label: "Profile", panel: profileTab },
        {
          id: "activity",
          label: "On-chain activity",
          count: activity.data?.length,
          panel: (
            <OnChainActions
              address={address}
              projectNames={Object.fromEntries(
                projects.map((project) => [project.key, project.name ?? ""]),
              )}
            />
          ),
        },
      ]}
      value={tab}
      onChange={(id) => {
        setTab(id as MemberTab);
        window.history.replaceState(
          window.history.state,
          "",
          memberUrl(address, id as MemberTab),
        );
      }}
    />
  );
};

export default withErrorBoundary(MemberPage);
