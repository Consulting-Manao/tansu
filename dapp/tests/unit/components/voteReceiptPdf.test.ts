import { renderDocumentWithLayout } from "@formepdf/core";
import type { ElementInfo, PageInfo } from "@formepdf/core";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import {
  VoteReceiptDocument,
  voteReceiptFileName,
} from "components/page/proposal/VoteReceiptPdf";
import type { VoteReceipt } from "types/proposal";

const hex = (length: number, seed: number) =>
  Array.from({ length }, (_, i) => ((i * 7 + seed) % 16).toString(16)).join("");

const anonymous: VoteReceipt = {
  projectName: "tansu",
  proposalId: 42,
  voteType: "approve",
  weight: 3,
  isPublicVoting: false,
  transactionHash: hex(64, 1),
  publicKey: `-----BEGIN PUBLIC KEY-----${hex(360, 2)}-----END PUBLIC KEY-----`,
  votes: [hex(344, 3), hex(344, 4), hex(344, 5)],
  seeds: ["123456789012345678901234567", "98765432109876543210", "555"],
  commitments: [hex(192, 6), hex(192, 7), hex(192, 8)],
};

const render = (receipt: VoteReceipt) =>
  renderDocumentWithLayout(
    createElement(VoteReceiptDocument, {
      receipt,
      issuedAt: new Date("2026-09-30T12:00:00Z"),
    }),
  );

const flatten = (elements: ElementInfo[]): ElementInfo[] =>
  elements.flatMap((e) => [e, ...flatten(e.children)]);

const textOf = (pages: PageInfo[]) =>
  pages
    .flatMap((page) => flatten(page.elements))
    .map((e) => e.textContent ?? "")
    .join("");

describe("vote receipt PDF", () => {
  it("holds every value of an anonymous vote in full", async () => {
    const { pdf, layout } = await render(anonymous);
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe("%PDF-");

    const text = textOf(layout.pages);
    for (const value of [
      anonymous.transactionHash!,
      anonymous.publicKey!,
      ...anonymous.votes!,
      ...anonymous.seeds!,
      ...anonymous.commitments!,
    ]) {
      expect(text).toContain(value);
    }
    expect(text).toContain("Approve");
    expect(text).toContain("Anonymous");
  });

  it("leaves the anonymous values out of a public vote", async () => {
    const { layout } = await render({
      ...anonymous,
      isPublicVoting: true,
    });
    const text = textOf(layout.pages);
    expect(layout.pages).toHaveLength(1);
    expect(text).toContain(anonymous.transactionHash);
    expect(text).not.toContain("Commitments");
    expect(text).not.toContain(anonymous.commitments![0]);
  });

  it("names the file after the project and proposal", () => {
    expect(voteReceiptFileName(anonymous)).toBe(
      "tansu-vote-receipt-tansu-42.pdf",
    );
  });
});
