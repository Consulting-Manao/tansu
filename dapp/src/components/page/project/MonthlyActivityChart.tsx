import { useState } from "react";
import Bar from "components/utils/Bar";
import type { ContributionMetrics } from "../../../types/contributionMetrics";

type Metric = "commits" | "contributors";

const RANGES = { "6m": 6, "12m": 12, all: Infinity } as const;

/** "2026-03" as "Mar 26". */
const formatMonth = (month: string) => {
  const [year, index] = month.split("-").map(Number);
  return new Date(year!, index! - 1).toLocaleDateString("en-US", {
    month: "short",
    year: "2-digit",
  });
};

/** Commits or contributors per active month, newest first. */
const MonthlyActivityChart = ({
  monthlyStats,
}: {
  monthlyStats: ContributionMetrics["monthlyStats"];
}) => {
  const [metric, setMetric] = useState<Metric>("commits");
  const [timeRange, setTimeRange] = useState<keyof typeof RANGES>("12m");

  // "YYYY-MM" keys sort as text.
  const months = Object.keys(monthlyStats)
    .sort()
    .reverse()
    .slice(0, RANGES[timeRange]);
  const values = months.map((month) => monthlyStats[month]?.[metric] ?? 0);
  const total = values.reduce((sum, value) => sum + value, 0);
  const max = Math.max(...values, 1);

  return (
    <div className="bg-white p-6 rounded-lg border border-gray-200 h-full">
      <div className="flex flex-col gap-4 h-full">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h3 className="text-lg font-semibold text-primary">
            Monthly Activity
          </h3>
          <div className="flex gap-2 flex-wrap">
            <select
              value={metric}
              onChange={(e) => setMetric(e.target.value as Metric)}
              className="px-3 py-1 text-xs border border-gray-300 rounded-md bg-white"
            >
              <option value="commits">Commits</option>
              <option value="contributors">Contributors</option>
            </select>
            <select
              value={timeRange}
              onChange={(e) =>
                setTimeRange(e.target.value as keyof typeof RANGES)
              }
              className="px-3 py-1 text-xs border border-gray-300 rounded-md bg-white"
            >
              <option value="6m">Last 6 months</option>
              <option value="12m">Last 12 months</option>
              <option value="all">All time</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
          <div className="text-center">
            <div className="text-2xl font-bold text-primary">{total}</div>
            <div className="text-xs text-secondary">Total {metric}</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-primary">
              {months.length ? Math.round(total / months.length) : 0}
            </div>
            <div className="text-xs text-secondary">Monthly average</div>
          </div>
        </div>

        {months.length > 0 ? (
          <ul className="flex flex-col gap-2 max-h-[250px] overflow-y-auto">
            {months.map((month, i) => (
              <li
                key={month}
                className="flex items-center gap-3 text-xs text-secondary"
              >
                <span className="w-12 shrink-0">{formatMonth(month)}</span>
                <Bar percent={(values[i]! / max) * 100} className="flex-1" />
                <span className="w-8 shrink-0 text-right text-primary">
                  {values[i]}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex items-center justify-center min-h-[120px] text-secondary text-sm">
            No data available
          </div>
        )}
      </div>
    </div>
  );
};

export default MonthlyActivityChart;
