import classNames from "classnames";
import AnonymousTalliesDisplay from "./AnonymousTalliesDisplay";
import InvalidBallots from "./InvalidBallots";
import type { AnonymousTally } from "./useAnonymousTally";

/** The key file a maintainer selects to count an anonymous vote. */
export const KeyFileField = ({
  tally,
  onCounted,
}: {
  tally: AnonymousTally;
  onCounted: () => void;
}) => (
  <div className="flex flex-col gap-2">
    <div
      className={classNames(
        "border p-3 w-full rounded-control transition-colors",
        tally.error ? "border-danger" : "border-ink",
      )}
    >
      {tally.processing ? (
        <div className="text-ink text-center sm:text-left">
          Processing key file...
        </div>
      ) : (
        <label className="cursor-pointer text-ink underline block text-center sm:text-left">
          Choose key file
          <input
            type="file"
            accept="application/json"
            className="hidden"
            onChange={async (e) => {
              if (await tally.readKeyFile(e.target.files?.item(0))) onCounted();
            }}
          />
        </label>
      )}
    </div>
    {tally.error && (
      <p className="text-danger text-ui text-center sm:text-left break-words">
        {tally.error}
      </p>
    )}
  </div>
);

/** The counted vote: its tallies and proof, and the ballots that cannot count. */
export const TallyResult = ({
  tally,
  projectName,
  proposalId,
}: {
  tally: AnonymousTally;
  projectName: string;
  proposalId: number;
}) => (
  <>
    <AnonymousTalliesDisplay
      voteStatus={tally.tally?.voteStatus}
      decodedVotes={tally.tally?.decodedVotes ?? []}
      tallies={tally.tally?.tallies ?? []}
      proofOk={tally.tally?.proofOk ?? null}
      proofErrorMessage={tally.tally?.proofErrorMessage ?? null}
      exportFileNameBase={`${projectName.replace(
        /[^a-z0-9_-]+/gi,
        "-",
      )}-proposal-${proposalId}-decoded-votes`}
    />
    <InvalidBallots
      invalid={tally.tally?.invalid ?? []}
      removing={tally.removing}
      onRemove={tally.removeInvalid}
    />
  </>
);
