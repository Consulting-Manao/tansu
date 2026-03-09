export const featuredProjectsConfigData = [
  {
    projectName: "tansu",
    projectFullName: "Tansu - Git on Stellar",
    logoImageLink:
      "https://github.com/Consulting-Manao/tansu/blob/main/website/static/img/logo.svg",
    description: "Decentralized project governance on Stellar",
    organizationName: "Consulting Manao GmbH",
    officials: {
      websiteLink: "https://tansu.dev",
      githubLink: "https://github.com/Consulting-Manao/tansu",
    },
    socialLinks: {},
    authorGithubNames: ["tupui"],
    maintainersAddresses: [
      "GD4FXNCYPQWNDWZYZZD4WFYYFTP466IKAKCZOYE5TPFTSSOZDA4QF3ER",
    ],
  },
];

export function getFeaturedProjectsConfigData() {
  return featuredProjectsConfigData;
}
