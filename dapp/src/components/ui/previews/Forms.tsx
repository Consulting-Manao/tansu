import { useState } from "react";
import { Checkbox, Input, RadioGroup, Select, Textarea } from "..";
import { Section } from "./Section";

export function Forms() {
  const [visibility, setVisibility] = useState<"public" | "anonymous">(
    "public",
  );
  return (
    <Section title="Fields">
      <div className="grid gap-6 sm:grid-cols-2">
        <Input
          label="Project name"
          placeholder="tansu"
          hint="Lowercase letters, up to 15."
        />
        <Input
          label="Repository"
          defaultValue="github.com/tansu"
          error="This repository has no tansu.toml."
        />
        <Textarea
          label="Description"
          placeholder="What this proposal changes, and why."
        />
        <Select label="Badge" defaultValue="developer">
          <option value="developer">Developer</option>
          <option value="triage">Triage</option>
          <option value="community">Community</option>
        </Select>
        <Checkbox
          label="I accept the Terms of Service"
          description="You can read them at any time."
        />
        <RadioGroup
          legend="Vote"
          value={visibility}
          onChange={setVisibility}
          options={[
            {
              value: "public",
              label: "Public vote",
              description: "Everyone sees every ballot.",
            },
            {
              value: "anonymous",
              label: "Anonymous vote",
              description: "The tally shows once executed.",
            },
          ]}
        />
        <Input label="Disabled" disabled defaultValue="GCIL…NBCN" />
      </div>
    </Section>
  );
}
