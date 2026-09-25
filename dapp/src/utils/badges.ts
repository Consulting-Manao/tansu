import { Badge } from "../../packages/tansu";

export type BadgeCode = number;

/** A badge's name, from the contract's own enum; its number when unknown. */
export function badgeName(code: BadgeCode): string {
  return Badge[code] ?? code.toString();
}
