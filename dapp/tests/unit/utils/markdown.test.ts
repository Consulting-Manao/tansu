import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Markdown, { resolvePath } from "../../../src/components/utils/Markdown";

const render = (markdown: string) =>
  renderToStaticMarkup(createElement(Markdown, { children: markdown }));

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

describe("raw HTML in Markdown", () => {
  it("keeps formatting, without styles, classes, ids or pings", () => {
    const html = render(
      '<p align="center" style="position:fixed" class="fixed inset-0" id="support-button">Hi</p>\n\n' +
        '<a href="https://tansu.dev" ping="https://track.example">site</a>',
    );
    expect(html).toContain('<p align="center">Hi</p>');
    expect(html).not.toMatch(/style=|class="fixed|id=|ping=/);
    expect(html).toContain('href="https://tansu.dev"');
  });

  it("drops what is not formatting", () => {
    const html = render(
      '<form action="https://evil.example"><input name="seed"></form>',
    );
    expect(html).not.toMatch(/<form|<input/);
  });
});
