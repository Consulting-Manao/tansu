import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { contributionMetricsQuery } from "../../../service/ContributionMetricsService";
import { queryClient } from "../../../service/queryClient";
import PonyFactorCard from "./PonyFactorCard";
import ContributorActivityChart from "./ContributorActivityChart";
import MonthlyActivityChart from "./MonthlyActivityChart";
import Loading from "components/utils/Loading";

interface ContributionMetricsProps {
  repoUrl: string;
  /** The maintainers' handles on the repository host. */
  maintainerHandles: string[];
}

const ContributionMetrics = ({
  repoUrl,
  maintainerHandles,
}: ContributionMetricsProps) => {
  // The commits are read once the section is in view: they cost requests
  // to the repository's host, which limits them.
  const section = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    if (inView || !section.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => entry?.isIntersecting && setInView(true),
      { rootMargin: "200px" },
    );
    observer.observe(section.current);
    return () => observer.disconnect();
  }, [inView]);
  const metricsRead = useQuery(
    { ...contributionMetricsQuery(repoUrl), enabled: inView },
    queryClient,
  );
  const metrics = metricsRead.data;
  const maintainers = maintainerHandles.map((name) => name.toLowerCase());

  const frame = (body: ReactNode, note?: string) => (
    <div
      ref={section}
      className="px-[16px] lg:px-[72px] py-12 flex flex-col gap-6"
    >
      <div className="flex flex-col gap-[18px]">
        <p className="leading-6 text-2xl font-medium text-primary">
          Contribution Metrics
        </p>
        {note && <p className="text-sm text-secondary">{note}</p>}
        <div className="border-t border-[#EEEEEE]" />
      </div>
      {body}
    </div>
  );

  if (metricsRead.isError) {
    return frame(
      <div className="p-6 bg-red-50 border border-red-200 rounded-lg">
        <p className="text-red-600">Failed to load contribution metrics</p>
      </div>,
    );
  }
  if (!metrics) {
    return frame(
      <div className="flex justify-center items-center py-12">
        <Loading />
      </div>,
    );
  }

  return frame(
    <>
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <div className="text-2xl font-bold text-primary">
            {metrics.totalCommits}
          </div>
          <div className="text-sm text-secondary">Total Commits</div>
        </div>
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <div className="text-2xl font-bold text-primary">
            {metrics.totalContributors}
          </div>
          <div className="text-sm text-secondary">Total Contributors</div>
        </div>
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <div className="text-2xl font-bold text-primary">
            {metrics.activeContributors}
          </div>
          <div className="text-sm text-secondary">Active (3 months)</div>
        </div>
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <div className="text-2xl font-bold text-primary">
            {metrics.repositoryTimespan.totalDays}
          </div>
          <div className="text-sm text-secondary">Days Active</div>
        </div>
      </div>

      <PonyFactorCard
        ponyFactor={metrics.ponyFactor}
        totalCommits={metrics.totalCommits}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ContributorActivityChart
          contributors={metrics.contributorActivity}
          maintainers={maintainers}
        />
        <MonthlyActivityChart monthlyStats={metrics.monthlyStats} />
      </div>
    </>,
    metrics.complete
      ? `Over all ${metrics.totalCommits} commits.`
      : `Over the latest ${metrics.totalCommits} commits.`,
  );
};

export default ContributionMetrics;
