import { useState } from "react";
import { SegmentedControl, ToastHost } from "..";
import { Actions } from "./Actions";
import { Forms } from "./Forms";
import { Overlays } from "./Overlays";
import { Structure } from "./Structure";

type Theme = "system" | "light" | "dark";

/**
 * Every piece of the kit in its states, on the /kit/ page: the target of
 * tests/kit.spec.ts and, later, of the design system's previews.
 */
export default function Previews() {
  const [theme, setTheme] = useState<Theme>("system");
  const pick = (next: Theme) => {
    setTheme(next);
    if (next === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = next;
  };
  return (
    <main className="mx-auto flex w-full max-w-280 flex-col gap-12 px-4 py-10 sm:px-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-label font-mono text-accent-ink uppercase">
            Design system
          </p>
          <h1 className="text-title font-bold text-ink">The Tansu kit</h1>
        </div>
        <SegmentedControl
          label="Theme"
          value={theme}
          onChange={pick}
          segments={[
            { value: "system", label: "System" },
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
          ]}
        />
      </header>
      <Actions />
      <Forms />
      <Structure />
      <Overlays />
      <ToastHost />
    </main>
  );
}
