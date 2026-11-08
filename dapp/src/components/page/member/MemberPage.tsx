import { useQueries } from "@tanstack/react-query";
import { Buffer } from "buffer";
import { projectByKeyQuery } from "@service/ProjectService";
import { queryClient } from "@service/queryClient";
import { Badge, Card, CardHeader, Loading, SectionTitle } from "components/ui";
import { withErrorBoundary } from "components/utils/ErrorBoundary";
import Markdown from "components/utils/Markdown";
import { badgeName } from "utils/badges";
import { getIpfsBasicLink } from "utils/ipfsFunctions";
import { memberAddressFromUrl, projectUrl } from "utils/urls";
import OnChainActions from "../dashboard/OnChainActions";
import { useMemberProfile } from "./useMemberProfile";

/** The member page under its head: about, their projects, their activity. */
const MemberPage = () => {
  const address = memberAddressFromUrl();
  const { memberRead, member, cid, profile } = useMemberProfile(address);
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

  return (
    <div className="mx-auto grid w-full max-w-[1120px] gap-6 px-4 py-8 sm:px-6 sm:py-10 lg:grid-cols-[minmax(0,1fr)_360px] lg:px-10">
      <div className="flex min-w-0 flex-col gap-6">
        {profile?.description && (
          <Card>
            <CardHeader title="About" />
            <Markdown baseUrl={getIpfsBasicLink(cid)}>
              {profile.description}
            </Markdown>
          </Card>
        )}
        <Card>
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
      <section className="flex min-w-0 flex-col gap-4">
        <SectionTitle>On-chain activity</SectionTitle>
        <OnChainActions
          address={address}
          projectNames={Object.fromEntries(
            projects.map((project) => [project.key, project.name ?? ""]),
          )}
        />
      </section>
    </div>
  );
};

export default withErrorBoundary(MemberPage);
