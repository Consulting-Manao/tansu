import { Badge, Button, ButtonLink, IconButton, Spinner } from "..";
import { CloseIcon } from "../icons";
import { Row, Section } from "./Section";

const tones = [
  "primary",
  "secondary",
  "ghost",
  "danger",
  "danger-ghost",
] as const;

export function Actions() {
  return (
    <>
      <Section title="Buttons">
        {(["sm", "md", "lg"] as const).map((size) => (
          <Row key={size}>
            {tones.map((tone) => (
              <Button key={tone} tone={tone} size={size}>
                {tone === "primary"
                  ? "Vote"
                  : tone === "secondary"
                    ? "Support the project"
                    : tone === "ghost"
                      ? "Remove a vote"
                      : tone === "danger"
                        ? "Revoke proposal"
                        : "Revoke"}
              </Button>
            ))}
          </Row>
        ))}
        <Row>
          <Button loading>Sending…</Button>
          <Button disabled>Vote</Button>
          <ButtonLink href="#kit" tone="secondary">
            View on IPFS
          </ButtonLink>
          <IconButton label="Close">
            <CloseIcon />
          </IconButton>
          <Spinner label="Loading…" />
        </Row>
        <Button block>New proposal</Button>
      </Section>
      <Section title="Badges">
        <Row>
          <Badge tone="success" dot>
            Voting · 2 days left
          </Badge>
          <Badge tone="success">Approved</Badge>
          <Badge tone="danger">Rejected</Badge>
          <Badge tone="warning">Cancelled</Badge>
          <Badge tone="info">Public vote</Badge>
          <Badge tone="accent">Maintainer</Badge>
          <Badge>Community</Badge>
        </Row>
      </Section>
    </>
  );
}
