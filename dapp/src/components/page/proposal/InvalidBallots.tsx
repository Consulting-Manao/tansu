import type { InvalidBallot } from "utils/anonymousVoting";
import { Button } from "components/ui";

/**
 * Anonymous ballots the tally cannot count. The proposal executes once a
 * maintainer removed them.
 */
const InvalidBallots = ({
  invalid,
  removing,
  onRemove,
}: {
  invalid: InvalidBallot[];
  removing?: string | null;
  onRemove?: (address: string) => void;
}) => {
  if (!invalid.length) return null;
  return (
    <div
      role="alert"
      className="flex flex-col gap-3 p-4 bg-danger-soft border border-danger/40 rounded-control"
    >
      <p className="text-sm font-semibold text-danger">
        These ballots cannot count. They must be removed before the proposal is
        executed.
      </p>
      {invalid.map(({ address, reason }) => (
        <div
          key={address}
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-2"
        >
          <div className="text-sm text-danger">
            <p className="font-mono break-all">{address}</p>
            <p>{reason}</p>
          </div>
          {onRemove && (
            <Button
              tone="secondary"
              size="sm"
              loading={removing === address}
              disabled={!!removing}
              onClick={() => onRemove(address)}
            >
              Remove
            </Button>
          )}
        </div>
      ))}
    </div>
  );
};

export default InvalidBallots;
