import { describe, expect, it } from "vitest";
import { resolvePath } from "../../../src/components/utils/Markdown";

const BASE = "https://ipfs.filebase.io/ipfs/bafyabc123";

describe("resolvePath", () => {
  it("resolves a relative path against the document's directory", () => {
    expect(resolvePath("images/logo.png", BASE)).toBe(
      `${BASE}/images/logo.png`,
    );
    expect(resolvePath("./shots/1.png", `${BASE}/`)).toBe(
      `${BASE}/shots/1.png`,
    );
  });

  it("leaves URLs, anchors and paths without a base alone", () => {
    for (const path of [
      "https://example.com/a.png",
      "blob:https://app/1",
      "#install",
      "//cdn.example/a.png",
    ]) {
      expect(resolvePath(path, BASE)).toBe(path);
    }
    expect(resolvePath("images/logo.png", undefined)).toBe("images/logo.png");
  });
});
