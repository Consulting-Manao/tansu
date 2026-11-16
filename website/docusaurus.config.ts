import { mkdir, writeFile } from "node:fs/promises";
import { themes as prismThemes } from "prism-react-renderer";
import type { Config } from "@docusaurus/types";
import type * as Preset from "@docusaurus/preset-classic";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

const config: Config = {
  title: "Tansu",
  tagline:
    "Bringing open source software development to the Stellar blockchain",
  favicon: "img/logo.svg",

  future: {
    v4: true, // Improve compatibility with the upcoming Docusaurus v4
  },

  // Set the production url of your site here
  url: "https://tansu.dev",
  // Set the /<baseUrl>/ pathname under which your site is served
  // For GitHub pages deployment, it is often '/<projectName>/'
  baseUrl: "/",

  // GitHub pages deployment config.
  // If you aren't using GitHub pages, you don't need these.
  // organizationName: 'tansu', // Usually your GitHub org/user name.
  // projectName: 'tansu', // Usually your repo name.

  onBrokenLinks: "throw",

  // Even if you don't use internationalization, you can use this field to set
  // useful metadata like html lang. For example, if your site is Chinese, you
  // may want to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: "en",
    locales: ["en"],
  },

  markdown: {
    mermaid: true,
  },

  presets: [
    [
      "classic",
      {
        docs: {
          sidebarPath: "./sidebars.ts",
          remarkPlugins: [remarkMath],
          rehypePlugins: [rehypeKatex],
        },
        blog: {
          showReadingTime: true,
          remarkPlugins: [remarkMath],
          rehypePlugins: [rehypeKatex],
        },
        theme: {
          customCss: "./src/css/custom.css",
        },
      } satisfies Preset.Options,
    ],
  ],

  themes: ["@docusaurus/theme-mermaid"],

  plugins: [
    // RFC 9116; the dApp writes the same (dapp/astro.config.mjs).
    // Expires must stay under a year away: each deploy renews it.
    () => ({
      name: "security-txt",
      async postBuild({ outDir }) {
        await mkdir(`${outDir}/.well-known`, { recursive: true });
        await writeFile(
          `${outDir}/.well-known/security.txt`,
          [
            "Contact: mailto:legal@consulting-manao.com?subject=SECURITY",
            `Expires: ${new Date(Date.now() + 360 * 86_400_000).toISOString()}`,
            "Preferred-Languages: en, de",
            "Canonical: https://tansu.dev/.well-known/security.txt",
            "Policy: https://radicle.network/nodes/radicle.consulting-manao.com/rad%3AzssaAF91kxuquZmZCV2SiK2FNX6s/tree/SECURITY.md",
            "",
          ].join("\n"),
        );
      },
    }),
  ],

  themeConfig: {
    image: "img/social-card.png",
    metadata: [
      { name: "x:creator", content: "@PamphileRoy" },
      { name: "x:card", content: "summary_large_image" },
      {
        name: "x:image",
        content: "https://tansu.dev/img/social-card.png",
      },
      { name: "x:title", content: "Tansu" },
      {
        name: "x:description",
        content:
          "Bringing open source software development onto the Stellar blockchain",
      },
    ],
    navbar: {
      title: "Tansu",
      logo: {
        alt: "Tansu Logo",
        src: "img/logo.svg",
      },
      items: [
        {
          type: "docSidebar",
          sidebarId: "tutorialSidebar",
          position: "left",
          label: "Documentation",
        },
        { to: "/blog", label: "Blog", position: "left" },
        {
          href: "https://app.tansu.dev",
          label: "Launch App",
          position: "right",
        },
      ],
    },
    footer: {
      style: "dark",
      copyright: `<p>Copyright © ${new Date().getFullYear()} Tansu. Made by <a href="https://consulting-manao.com">Consulting Manao GmbH</a> | <a href="/docs/terms-of-service">Terms of Service</a> | <a href="/docs/privacy-policy">Privacy Policy</a> | <a href="/docs/impressum">Impressum</a></p>`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
