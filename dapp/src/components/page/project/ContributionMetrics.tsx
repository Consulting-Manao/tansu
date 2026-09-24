import { useQuery } from "@tanstack/react-query";
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
  const metricsRead = useQuery(contributionMetricsQuery(repoUrl), queryClient);
  const metrics = metricsRead.data;
  const loading = metricsRead.isPending;
  const error = metricsRead.isError
    ? "Failed to load contribution metrics"
    : null;
  const maintainers = maintainerHandles
    .filter((name) => typeof name === "string")
    .map((name) => name.toLowerCase());

  if (loading) {
    return (
      <div className="px-[16px] lg:px-[72px] flex flex-col gap-6">
        <div className="flex flex-col gap-[18px]">
          <p className="leading-6 text-2xl font-medium text-primary">
            Contribution Metrics
          </p>
          <div className="border-t border-[#EEEEEE]" />
        </div>
        <div className="flex justify-center items-center py-12">
          <Loading />
        </div>
      </div>
    );
  }

  if (error || !metrics) {
    return (
      <div className="px-[16px] lg:px-[72px] flex flex-col gap-6">
        <div className="flex flex-col gap-[18px]">
          <p className="leading-6 text-2xl font-medium text-primary">
            Contribution Metrics
          </p>
          <div className="border-t border-[#EEEEEE]" />
        </div>
        <div className="p-6 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-600">
            {error || "Unable to load contribution metrics"}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-[16px] lg:px-[72px] py-12 flex flex-col gap-6">
      <div className="flex flex-col gap-[18px]">
        <p className="leading-6 text-2xl font-medium text-primary">
          Contribution Metrics
        </p>
        <div className="border-t border-[#EEEEEE]" />
      </div>

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
    </div>
  );
};

export default ContributionMetrics;
