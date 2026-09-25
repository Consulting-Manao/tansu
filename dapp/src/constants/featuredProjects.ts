import type { CardConfig } from "components/page/dashboard/ProjectCard";

/** The projects the home page shows first. */
export const FEATURED_PROJECTS: CardConfig[] = [
  {
    projectName: "tansu",
    projectFullName: "Tansu - Git on Stellar",
    logoImageLink:
      "https://radicle.consulting-manao.com/raw/rad:zssaAF91kxuquZmZCV2SiK2FNX6s/536993606237ef6890d202691dbfb3fbacf15c52/website/static/img/logo.svg",
    description: "Decentralized project governance on Stellar",
    organizationName: "Consulting Manao GmbH",
    officials: {
      websiteLink: "https://tansu.dev",
      githubLink:
        "https://radicle.network/nodes/radicle.consulting-manao.com/rad:zssaAF91kxuquZmZCV2SiK2FNX6s",
    },
    socialLinks: {},
  },
  {
    projectName: "stellarpg",
    projectFullName: "Stellar Community Fund - Public Goods Award",
    logoImageLink:
      "https://communityfund.stellar.org/_next/image?url=%2Fsvg%2FSCFLogo.svg&w=96&q=75",
    description:
      "Stellar Community Fund Voting Platform for Public Goods Award",
    organizationName: "Stellar Community Fund",
    officials: {
      websiteLink:
        "https://stellar.gitbook.io/scf-handbook/supporting-programs/public-goods-award",
    },
    socialLinks: {},
  },
];
