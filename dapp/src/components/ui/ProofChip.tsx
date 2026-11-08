import cx from "classnames";
import { Children, Fragment, type ReactNode } from "react";
import { CheckCircleIcon, ErrorIcon, InfoIcon } from "./icons";

export type ProofTone = "verified" | "pending" | "failed";

const tones: Record<ProofTone, string> = {
  verified: "border-accent/45 bg-accent-soft text-accent-ink",
  pending: "border-line-strong bg-sunken text-ink-muted",
  failed: "border-danger/45 bg-danger-soft text-danger",
};

const seals: Record<ProofTone, ReactNode> = {
  verified: <CheckCircleIcon />,
  pending: <InfoIcon />,
  failed: <ErrorIcon />,
};

interface ProofChipProps {
  /** The value on chain: a commit, a transaction (shown short). */
  hash: string;
  tone?: ProofTone;
  /** Show the whole value: an identity like codeberg:ada, not a hash. */
  full?: boolean;
  /** What was checked: "In git history", "4 of 6 maintainers". */
  children?: ReactNode;
  className?: string;
}

/** Something on chain and what was checked about it: hash, seal, facts. */
export function ProofChip({
  hash,
  tone = "verified",
  full,
  children,
  className,
}: ProofChipProps) {
  return (
    <span
      title={hash}
      className={cx(
        "inline-flex h-8 max-w-full items-center gap-2 rounded-control border pr-3 pl-2 text-small whitespace-nowrap",
        tones[tone],
        className,
      )}
    >
      <span className={tone === "verified" ? "text-accent" : undefined}>
        {seals[tone]}
      </span>
      <code className="font-mono text-ink">
        {full ? hash : hash.slice(0, 9)}
      </code>
      {Children.toArray(children).map((fact, index) => (
        <Fragment key={index}>
          <span aria-hidden="true" className="h-4 w-px bg-current opacity-40" />
          <span className="truncate">{fact}</span>
        </Fragment>
      ))}
    </span>
  );
}
