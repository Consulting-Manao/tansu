import Bar from "components/utils/Bar";
import type { PonyFactorResult } from "../../../types/contributionMetrics";

interface PonyFactorCardProps {
  ponyFactor: PonyFactorResult;
  totalCommits: number;
}

const PonyFactorCard: React.FC<PonyFactorCardProps> = ({
  ponyFactor,
  totalCommits,
}) => {
  const getRiskLevel = (
    factor: number,
  ): { level: string; color: string; description: string } => {
    if (factor <= 2) {
      return {
        level: "High Risk",
        color: "text-danger bg-danger-soft border-danger/40",
        description:
          "Very few contributors control most of the codebase. Consider encouraging more diverse contributions.",
      };
    } else if (factor <= 5) {
      return {
        level: "Medium Risk",
        color: "text-warning bg-warning-soft border-warning/40",
        description:
          "A small group controls most contributions. Good, but could benefit from broader participation.",
      };
    } else {
      return {
        level: "Low Risk",
        color: "text-success bg-success-soft border-success/40",
        description:
          "Well-distributed contributions across multiple contributors. Excellent bus factor!",
      };
    }
  };

  const risk = getRiskLevel(ponyFactor.factor);

  return (
    <div className="bg-surface p-6 rounded-control border border-line">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="text-card font-semibold text-ink">Pony Factor</h3>
          <div
            className={`px-3 py-1 rounded-full text-label font-medium border ${risk.color}`}
          >
            {risk.level}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-title font-bold text-ink">
            {ponyFactor.factor}
          </div>
          <div className="flex-1">
            <div className="text-ui text-ink-muted mb-1">
              {ponyFactor.explanation}
            </div>
            <div className="text-label text-ink-muted">{risk.description}</div>
          </div>
        </div>

        <div className="mt-4">
          <div className="text-ui font-medium text-ink-muted mb-2">
            Top Contributors (50% of commits)
          </div>
          <div className="space-y-2">
            {ponyFactor.topContributors
              .slice(0, 5)
              .map((contributor, index) => {
                const percentage =
                  totalCommits > 0
                    ? (contributor.commitCount / totalCommits) * 100
                    : 0;
                const contributorKey = `${contributor.author.name}-${contributor.author.email || "no-email"}`;
                return (
                  <div
                    key={contributorKey}
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 bg-info-soft rounded-full flex items-center justify-center text-label font-medium text-link">
                        {index + 1}
                      </div>
                      <span className="text-ui text-ink">
                        {contributor.author.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-label text-ink-muted">
                        {contributor.commitCount} commits
                      </span>
                      <Bar percent={percentage} className="w-16" />
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        <div className="mt-4 p-3 bg-sunken rounded-control">
          <div className="text-label text-ink-muted">
            <strong>What is Pony Factor?</strong> The minimum number of
            contributors whose removal would leave the project in a critical
            state. Based on the principle that if key contributors were "hit by
            a pony" (bus factor), how many would need to be replaced?{" "}
            <a
              href="https://ke4qqq.wordpress.com/2015/02/08/pony-factor-math/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-link hover:underline"
            >
              Learn more ↗
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PonyFactorCard;
