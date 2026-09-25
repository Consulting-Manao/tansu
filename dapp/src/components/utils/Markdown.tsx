import MarkdownToJsx, { RuleType, type MarkdownToJSX } from "markdown-to-jsx";
import { useMemo, type ComponentProps } from "react";

/**
 * The raw HTML users may write: formatting. markdown-to-jsx already drops
 * scripts, event handlers and `javascript:` URLs, but renders forms, embeds
 * and `<meta>`, which React hoists into the page's head.
 */
const ALLOWED_HTML = new Set([
  "a",
  "abbr",
  "b",
  "blockquote",
  "br",
  "code",
  "dd",
  "del",
  "details",
  "div",
  "dl",
  "dt",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "i",
  "img",
  "kbd",
  "li",
  "ol",
  "p",
  "picture",
  "pre",
  "s",
  "source",
  "span",
  "strong",
  "sub",
  "summary",
  "sup",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "u",
  "ul",
]);

/**
 * The attributes that raw HTML keeps: what formatting needs. Styles, classes
 * and ids could dress content up as the app's own controls, or cover them.
 */
const ALLOWED_ATTRIBUTES = new Set([
  "align",
  "alt",
  "cite",
  "colspan",
  "dir",
  "height",
  "href",
  "lang",
  "media",
  "open",
  "rowspan",
  "src",
  "srcset",
  "start",
  "title",
  "type",
  "width",
]);

/** A path relative to `base`, made absolute; URLs and anchors stay. */
export function resolvePath(
  path: string | undefined,
  base: string | undefined,
): string | undefined {
  if (!path || !base || /^([a-z][a-z0-9+.-]*:|#|\/\/)/i.test(path)) {
    return path;
  }
  return `${base.replace(/\/$/, "")}/${path.replace(/^\.?\//, "")}`;
}

/**
 * Markdown that users wrote: proposals, discussions, profiles, READMEs.
 * Links open in a new tab, images fit, and relative paths resolve against
 * `baseUrl`, e.g. the IPFS directory the file comes from.
 */
export default function Markdown({
  children,
  baseUrl,
  className = "",
}: {
  children: string;
  baseUrl?: string | undefined;
  className?: string;
}) {
  const options = useMemo<MarkdownToJSX.Options>(
    () => ({
      overrides: {
        a: {
          component: ({ href, ...props }: ComponentProps<"a">) => (
            <a
              {...props}
              href={resolvePath(href, baseUrl)}
              {...(!href?.startsWith("#") && {
                target: "_blank",
                rel: "noopener noreferrer",
              })}
            />
          ),
        },
        img: {
          component: ({ src, ...props }: ComponentProps<"img">) => (
            <img
              {...props}
              src={resolvePath(src as string | undefined, baseUrl)}
              className="max-w-full h-auto"
            />
          ),
        },
        table: {
          props: { className: "table-auto border-collapse max-w-full" },
        },
        th: { props: { className: "border border-gray-300 px-4 py-2" } },
        td: { props: { className: "border border-gray-300 px-4 py-2" } },
      },
      renderRule(next, node) {
        const isHtml =
          node.type === RuleType.htmlBlock ||
          node.type === RuleType.htmlSelfClosing;
        if (!isHtml) return next();
        if (!ALLOWED_HTML.has(node.tag.toLowerCase())) return null;
        node.attrs = Object.fromEntries(
          Object.entries(node.attrs ?? {}).filter(([name]) =>
            ALLOWED_ATTRIBUTES.has(name.toLowerCase()),
          ),
        );
        return next();
      },
    }),
    [baseUrl],
  );

  return (
    <div className={`markdown-body ${className}`}>
      <MarkdownToJsx options={options}>{children}</MarkdownToJsx>
    </div>
  );
}
