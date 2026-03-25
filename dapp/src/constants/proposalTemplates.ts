export interface ProposalTemplate {
  id: string;
  name: string;
  description: string;
  content: string;
}

export const PROPOSAL_TEMPLATES: ProposalTemplate[] = [
  {
    id: "code-change",
    name: "Code Implementation",
    description:
      "For proposing code changes, feature implementations, or technical upgrades with on-chain commit tracking",
    content: `# [Implementation Name]

## Commit Hash
[Paste your commit hash here]
**Repository:** [Link to GitHub/GitLab repository]
**Branch:** [Branch name]

## Technical Summary
Brief description of the code changes and their purpose.

## Implementation Details
### Changes Made:
- [ ] Function/Module 1 updates
- [ ] Function/Module 2 modifications
- [ ] New features added

### Testing Strategy:
- [ ] Unit tests updated/added
- [ ] Integration tests
- [ ] Security audit considerations

## On-Chain Verification
- **Commit Hash:** [Hash to be stored on-chain]
- **Verification Method:** [How commit will be verified]
- **Immutable Proof:** [Link to blockchain explorer when live]

## Voting Parameters
- **Voting Type:** [Public/Anonymous]
- **Duration:** [Number] days
- **Quorum:** [Percentage]% of maintainers`,
  },
  {
    id: "governance-update",
    name: "Governance Rules",
    description:
      "For updating project governance rules, voting parameters, or membership requirements",
    content: `# Governance Update: [Rule Name]

## Current Rule
Describe the current governance rule or parameter.

## Proposed Change
Detailed description of the proposed update.

## Rationale
Why this change is necessary for the project's governance.

## Impact Analysis
### Affected Parties:
- [ ] Project Maintainers
- [ ] Community Members
- [ ] Token Holders

### System Changes:
- [ ] Contract parameter updates
- [ ] Voting mechanism modifications
- [ ] Membership requirements

## Implementation Steps
1. Smart contract update
2. Community notification period
3. On-chain execution

## Voting Strategy
- **Voting Method:** Anonymous recommended for sensitive governance changes
- **Duration:** 5-7 days for community feedback
- **Threshold:** [Percentage]% majority required`,
  },
  {
    id: "pg-award-request",
    name: "Public Goods Award",
    description: "Stellar Community Fund Public Goods Award - Submission Form",
    content: `# SCF Public Goods Award: [Project Name]

#SCF Public Goods Award - Submission Form

Is this your first time submitting to the SCF Public Goods Award?

[Yes, it's my first time submitting for the Public Goods Award]
[Yes, it's my first time submitting to this Award, but I've received SDF Infrastructure Grants before.]
[No, I've submitted before to this award]

## Project Information
### Project Category

> Take a look at the SCF handbook to learn more.

SDKs
Data Support
Wallet Support
Developer Experience
Ecosystem Visibility
Infrastructure Monitoring
Governance Tools
Security & Auditing Tools
Compliance & Identity Tooling
Other

## Project Description
> Use max 300 characters

[...]

## Website

[...]

## Github

[...]

## Does your project have a revenue model?

[Yes/No]

## Why does your project qualify as a public good?
> What makes it critical to the ecosystem and non-commercial?

[...]

## Describe your team and your team’s experience with the Stellar ecosystem
> E.g., previous SCF participation, ecosystem contributions, projects built on Stellar.

[...]

## Previous Three Months Deliverables & Impact

### What’s your project’s retroactive impact over the last three months?
> For new and renewal proposals. Be specific, and include usage stats, ecosystem integrations, etc.

[...]

### Please list your deliverables of the last three months including proof of completion.
> If this is your first time applying for the SCF Public Goods Award and you haven’t received an Infrastructure Grant before, enter “N/A”.
N/A

[...]

## Upcoming Three Months Deliverables & Impact
### What’s are your project’s goals for impact for the upcoming three months?
> How will this benefit the Stellar ecosystem? Be specific, and include evidence of continued usage, relevance, and ecosystem demand, etc.

[...]

### Please list your deliverables you’re aiming to create in the next three months and explain their ecosystem value.
> Make your deliverables SMART (Specific, Measurable, Achievable, Relevant, and Time-bound) with reasonable and justifiable budget allocations that will bring significant ecosystem value.

[...]

## Budget Requested
> Max. $50,000 in XLM. Budget needs to be reasonable based on retroactive impact and planned deliverables for the next three months.
$[...] in XLM`,
  },
  {
    id: "membership-change",
    name: "Membership Update",
    description:
      "For adding/removing maintainers, assigning roles, or updating achievement badges",
    content: `# Membership Update

## Action Requested
- [ ] Add New Maintainer
- [ ] Remove Maintainer
- [ ] Update Role Permissions
- [ ] Award Achievement Badge

## Candidate Information
- **Address:** [Stellar public key]
- **Soroban Domain:** [If applicable]
- **GitHub/Portfolio:** [Link to work]

## Justification
Why this membership change benefits the project.

## Role Permissions
### If Adding Maintainer:
- [ ] Can create proposals
- [ ] Can merge code changes
- [ ] Can manage grants
- [ ] Voting weight: [Percentage]

### If Awarding Badge:
- **Badge Type:** [Contributor/Reviewer/Builder]
- **Achievement:** [Description of accomplishment]
- **On-chain Proof:** [Link to verified contributions]

## Voting Consideration
- **Privacy:** Anonymous voting recommended
- **Duration:** 3-5 days for maintainer consensus`,
  },
  {
    id: "emergency-response",
    name: "Emergency Fix",
    description:
      "For urgent security patches, bug fixes, or critical system updates requiring fast-track voting",
    content: `# ⚠️ EMERGENCY: [Issue Name]

## Severity Level
- [ ] Critical Security Vulnerability
- [ ] System Downtime
- [ ] Data Integrity Issue
- [ ] Other: [Specify]

## Issue Description
Detailed explanation of the emergency situation.

## Immediate Impact
What systems/users are affected and how.

## Proposed Fix
### Technical Solution:
[Describe the fix]

### Commit Hash:
[Hash of emergency fix]

### Testing Completed:
- [ ] Basic functionality test
- [ ] Security impact assessment
- [ ] Rollback plan verification

## Fast-Track Voting Request
**Reason for urgency:** [Why this cannot wait for normal cycle]
**Expected resolution time:** [Hours/days]

## Post-Resolution Review
Commitment to full review and documentation after resolution.`,
  },
  {
    id: "community-proposal",
    name: "Community Initiative",
    description:
      "For general community suggestions, ecosystem improvements, or non-technical changes",
    content: `# Community Proposal: [Initiative Name]

## Proposal Overview
What the community is suggesting and why.

## Background Context
Relevant history and current situation.

## Detailed Plan
Step-by-step implementation plan if applicable.

## Community Impact
How this benefits the broader ecosystem.

## Resource Requirements
If any resources are needed from the treasury.

## Success Measurement
How we'll know if this initiative is successful.

## Discussion Link
[Link to forum/discussion thread for community feedback]

## Voting Parameters
- **Voting Type:** Public (for community visibility)
- **Duration:** 7 days for maximum participation
- **Quorum:** Based on community engagement`,
  },
];

export const getTemplateById = (id: string): ProposalTemplate | undefined => {
  return PROPOSAL_TEMPLATES.find((template) => template.id === id);
};
