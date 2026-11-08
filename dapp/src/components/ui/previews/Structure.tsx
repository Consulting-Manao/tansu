import { useState } from "react";
import {
  Card,
  CardHeader,
  Notice,
  ProofChip,
  SegmentedControl,
  Tabs,
  Timeline,
} from "..";
import { Row, Section } from "./Section";

export function Structure() {
  const [filter, setFilter] = useState<"active" | "ended" | "all">("all");
  const [tab, setTab] = useState("overview");
  return (
    <>
      <Section title="Segmented control">
        <SegmentedControl
          label="Show proposals"
          value={filter}
          onChange={setFilter}
          segments={[
            { value: "active", label: "Active", count: 1 },
            { value: "ended", label: "Ended", count: 2 },
            { value: "all", label: "All", count: 3 },
          ]}
        />
      </Section>
      <Section title="Tabs">
        <Tabs
          label="Project"
          value={tab}
          onChange={setTab}
          items={[
            {
              id: "overview",
              label: "Overview",
              panel: (
                <p>The latest commit, open proposals and the maintainers.</p>
              ),
            },
            {
              id: "code",
              label: "Code",
              panel: <p>Commit history and attestations.</p>,
            },
            {
              id: "proposals",
              label: "Proposals",
              count: 1,
              panel: <p>The project's proposals.</p>,
            },
            {
              id: "people",
              label: "People",
              count: 7,
              panel: <p>Maintainers and members.</p>,
            },
          ]}
        />
      </Section>
      <Section title="Timeline">
        <Timeline
          label="Proposal"
          steps={[
            { label: "Submitted", detail: "5 Nov 2026", state: "done" },
            { label: "Voting", detail: "Ends 9 Nov, 23:59", state: "now" },
            { label: "Execute", detail: "From 10 Nov, 23:59", state: "todo" },
            { label: "Executed", state: "todo" },
          ]}
        />
      </Section>
      <Section title="Proof">
        <Row>
          <ProofChip hash="8610365f9a1c">
            In git history
            <>4 of 6 maintainers</>
          </ProofChip>
          <ProofChip hash="8610365f9a1c" tone="pending">
            Checking the repository
          </ProofChip>
          <ProofChip hash="8610365f9a1c" tone="failed">
            Not in git history
          </ProofChip>
        </Row>
      </Section>
      <Section title="Cards and notices">
        <div className="grid gap-6 sm:grid-cols-2">
          <Card>
            <CardHeader
              title="Latest commit"
              action={
                <a className="text-small text-link underline" href="#kit">
                  History
                </a>
              }
            />
            <p className="font-prose text-prose">
              Let donors pick the maintainer who receives a donation.
            </p>
          </Card>
          <Card tone="sunken">
            <CardHeader title="Sunken" />
            <p className="text-ink-muted">A quieter panel inside a page.</p>
          </Card>
        </div>
        <Row>
          <Notice title="Public vote">
            Everyone can see who voted and how.
          </Notice>
          <Notice tone="success">The proposal was executed.</Notice>
          <Notice tone="warning">
            The contract moved since this proposal was written.
          </Notice>
          <Notice tone="danger">
            This call would fail: the method takes two arguments.
          </Notice>
        </Row>
      </Section>
    </>
  );
}
