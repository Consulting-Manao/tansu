export const featuredProjectsConfigData = [
  {
    projectName: "tansu",
    projectFullName: "Tansu - Git on Stellar",
    projectType: "SOFTWARE",
    logoImageLink:
      "https://github.com/Consulting-Manao/tansu/blob/main/website/static/img/logo.svg",
    description: "Decentralized project governance on Stellar",
    organizationName: "Consulting Manao GmbH",
    officials: {
      websiteLink: "https://tansu.dev",
      githubLink: "https://github.com/Consulting-Manao/tansu",
    },
    socialLinks: {},
    authorHandles: ["tupui"],
    maintainersAddresses: [
      "GD4FXNCYPQWNDWZYZZD4WFYYFTP466IKAKCZOYE5TPFTSSOZDA4QF3ER",
    ],
  },
  {
    projectName: "stellarpg",
    projectFullName: "Stellar Community Fund - Public Goods Award",
    projectType: "GENERIC",
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
    authorHandles: ["tupui"],
    maintainersAddresses: [
      "GBMOFLBLOINEUB6BTAF6U3PY6YYYMPZ5LT7R7VQCR6RXALBJZOJ4IYTW",
    ],
  },
];

export function getFeaturedProjectsConfigData() {
  return featuredProjectsConfigData;
}
