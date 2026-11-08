/** Shares of a vote, as a percentage of the weight cast (0 when none). */
export const voteShares = (
  approve: number,
  reject: number,
  abstain: number,
) => {
  const total = approve + reject + abstain;
  const share = (part: number) =>
    total ? Math.round((part / total) * 100) : 0;
  return {
    total,
    approve: share(approve),
    reject: share(reject),
    abstain: share(abstain),
  };
};

/** A vote's result in one bar: approve, reject, abstain, by weight. */
export function ResultBar({
  approve,
  reject,
  abstain,
}: {
  approve: number;
  reject: number;
  abstain: number;
}) {
  const shares = voteShares(approve, reject, abstain);
  const parts = [
    ["Approve", shares.approve, "bg-vote-approve"],
    ["Reject", shares.reject, "bg-vote-reject"],
    ["Abstain", shares.abstain, "bg-vote-abstain"],
  ] as const;
  return (
    <div
      role="img"
      aria-label={
        shares.total
          ? parts.map(([name, share]) => `${name} ${share}%`).join(", ")
          : "No votes yet"
      }
      className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-sunken"
    >
      {parts.map(
        ([name, share, color]) =>
          share > 0 && (
            <span key={name} className={color} style={{ width: `${share}%` }} />
          ),
      )}
    </div>
  );
}
