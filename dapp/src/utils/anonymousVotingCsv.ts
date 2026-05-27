import type { DecodedVote } from "./anonymousVoting";

const CSV_HEADERS = [
  "Address",
  "Vote",
  "Weight (A/R/Abs)",
  "Max Weight",
  "Seed (A/R/Abs)",
];

export function escapeCsvValue(value: unknown): string {
  const normalized = String(value ?? "");
  if (!/[",\n]/.test(normalized)) {
    return normalized;
  }

  return `"${normalized.replaceAll('"', '""')}"`;
}

export function buildDecodedVotesCsv(decodedVotes: DecodedVote[]): string {
  const rows = decodedVotes.map((vote) =>
    [
      vote.address,
      vote.vote,
      vote.outcomeWeights.join("/"),
      vote.maxWeight,
      vote.outcomeSeeds.join("/"),
    ]
      .map(escapeCsvValue)
      .join(","),
  );

  return [CSV_HEADERS.map(escapeCsvValue).join(","), ...rows].join("\n");
}
