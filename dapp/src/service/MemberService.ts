/** Member reads: profiles and voting weight. */
import { queryOptions } from "@tanstack/react-query";
import { tansuReads } from "../contracts/soroban_tansu";
import { readResult } from "../utils/contractErrors";
import { deriveProjectKey, projectKeyHex } from "../utils/projectKey";

const MINUTE = 60_000;

/** A member by address; `null` when the address never joined. */
export const memberQuery = (address: string) =>
  queryOptions({
    queryKey: ["member", address],
    queryFn: async () =>
      readResult(await tansuReads.get_member({ member_address: address }), 204),
    staleTime: 10 * MINUTE,
  });

/**
 * A member's weight in a project, from their badges (or NQG): what they vote
 * with, unless the proposal is token weighted.
 */
export const votingPowerQuery = (name: string, address: string) =>
  queryOptions({
    queryKey: ["votingPower", projectKeyHex(name), address],
    queryFn: async () =>
      readResult(
        await tansuReads.get_max_weight({
          project_key: deriveProjectKey(name),
          member_address: address,
        }),
      ),
    staleTime: MINUTE,
  });
