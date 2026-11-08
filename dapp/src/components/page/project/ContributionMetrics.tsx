import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { contributionMetricsQuery } from "../../../service/ContributionMetricsService";
import { queryClient } from "../../../service/queryClient";
import PonyFactorCard from "./PonyFactorCard";
import ContributorActivityChart from "./ContributorActivityChart";
import MonthlyActivityChart from "./MonthlyActivityChart";
import { Loading, Notice, SectionTitle } from "components/ui";

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
    <section ref={section} className="flex flex-col gap-6">
      <SectionTitle>Contribution Metrics</SectionTitle>
      {note && <p className="-mt-3 text-small text-ink-muted">{note}</p>}
      {body}
    </section>
  );

  if (metricsRead.isError) {
    return frame(
      <Notice tone="danger">Failed to load contribution metrics</Notice>,
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
      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          [metrics.totalCommits, "Total Commits"],
          [metrics.totalContributors, "Total Contributors"],
          [metrics.activeContributors, "Active (3 months)"],
          [metrics.repositoryTimespan.totalDays, "Days Active"],
        ].map(([value, label]) => (
          <div
            key={label}
            className="flex flex-col-reverse gap-1 rounded-card border border-line bg-surface p-4 shadow-raise sm:p-6"
          >
            <dt className="text-small text-ink-muted">{label}</dt>
            <dd className="figures-tabular text-section font-bold">{value}</dd>
          </div>
        ))}
      </dl>

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
