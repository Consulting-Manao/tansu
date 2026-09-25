import { anonymousConfigQuery } from "@service/ProjectService";
import { queryClient } from "@service/queryClient";
import Button from "components/utils/Button";
import { useRef, useState } from "react";
import { generateRSAKeyPair } from "utils/crypto";
import { toast } from "utils/utils";

type Keys = { publicKey: string; privateKey: string };

/**
 * Anonymous voting for a new proposal. Turned on, it reads the project's
 * key fresh: a project without one gets a new key pair, whose file the
 * author must save and select back before the key is set up. An existing key
 * is replaced only when the author confirms it.
 */
export function useAnonymousKeySetup(projectName: string | undefined) {
  const [enabled, setEnabled] = useState(false);
  // The project has a key already.
  const [existing, setExisting] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [keys, setKeys] = useState<Keys | null>(null);
  // The author selected the saved key file and it matches.
  const [saved, setSaved] = useState(false);
  const run = useRef(0);

  const reset = () => {
    run.current++;
    setEnabled(false);
    setExisting(false);
    setReplacing(false);
    setConfirmReplace(false);
    setKeys(null);
    setSaved(false);
  };

  const toggle = async (checked: boolean) => {
    reset();
    const current = run.current;
    setEnabled(checked);
    if (!checked || !projectName) return;
    try {
      // Read fresh: a key another maintainer set up must not be replaced.
      const config = await queryClient.query({
        ...anonymousConfigQuery(projectName),
        staleTime: 0,
      });
      if (current !== run.current) return;
      if (config) setExisting(true);
      else setKeys(await generateRSAKeyPair());
    } catch (error: any) {
      if (current !== run.current) return;
      setEnabled(false);
      toast.error(
        "Anonymous voting",
        `Could not read this project's anonymous voting setup: ${error.message}`,
      );
    }
  };

  const download = () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(keys)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `tansu-${projectName}-anonymous-key.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // The browser may still be reading the file after click() returns.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  /** The saved key file, read back: it must hold the key set up. */
  const confirmFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const content = JSON.parse(await file.text());
      if (content.publicKey !== keys?.publicKey) {
        throw new Error("This is not the key file just generated.");
      }
      setSaved(true);
    } catch (error: any) {
      setSaved(false);
      toast.error("Anonymous voting", error.message);
    }
  };

  const replace = async () => {
    setKeys(await generateRSAKeyPair());
    setSaved(false);
    setReplacing(true);
  };

  return {
    enabled,
    existing,
    replacing,
    confirmReplace,
    setConfirmReplace,
    keys,
    saved,
    /** A new key must be set up before the proposal is made. */
    needsSetup: enabled && (!existing || replacing),
    toggle,
    download,
    confirmFile,
    replace,
    reset,
    /** The key was set up on chain. */
    setUp: () => {
      setExisting(true);
      setReplacing(false);
    },
  };
}

export type AnonymousKeySetupState = ReturnType<typeof useAnonymousKeySetup>;

/** The switch and, when on, the key file or the key in place. */
export const AnonymousKeySetup = ({
  setup,
}: {
  setup: AnonymousKeySetupState;
}) => (
  <div className="space-y-3">
    <label className="flex items-center gap-3 text-sm font-medium text-secondary">
      <input
        type="checkbox"
        checked={setup.enabled}
        onChange={(e) => setup.toggle(e.target.checked)}
        className="w-4 h-4"
      />
      Enable anonymous voting
    </label>

    {setup.enabled && setup.keys && (
      <div className="flex flex-col gap-3 p-3 bg-green-50 border border-green-200 rounded-md">
        <p className="text-sm text-green-800">
          Only this key file can reveal the anonymous votes when the proposal is
          executed. Download it, keep it safe, then select it to confirm you
          saved it.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="secondary" size="sm" onClick={setup.download}>
            Download key file
          </Button>
          <label className="text-sm text-green-800">
            Select the saved key file
            <input
              type="file"
              accept="application/json,.json"
              className="ml-2"
              onChange={(e) => setup.confirmFile(e.target.files?.[0])}
            />
          </label>
        </div>
        {setup.saved && (
          <p className="text-sm font-medium text-green-800">Key file saved.</p>
        )}
      </div>
    )}

    {setup.enabled && setup.existing && !setup.replacing && (
      <div className="flex flex-col gap-2 p-3 bg-green-50 border border-green-200 rounded-md">
        <div className="flex items-center justify-between">
          <span className="text-sm text-green-800">Already configured.</span>
          <button
            type="button"
            className="text-blue-500 hover:text-blue-700 underline text-sm"
            onClick={() => setup.setConfirmReplace(true)}
          >
            Reset Keys
          </button>
        </div>
        {setup.confirmReplace && (
          <div className="flex flex-col gap-2 text-sm text-red-800">
            <p>
              Votes already cast on open anonymous proposals can only be
              revealed with the current key file: keep it until they are
              executed.
            </p>
            <Button type="secondary" size="sm" onClick={setup.replace}>
              Replace the key
            </Button>
          </div>
        )}
      </div>
    )}
  </div>
);
