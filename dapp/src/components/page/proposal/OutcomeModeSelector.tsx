import React from "react";

interface OutcomeModeSelectorProps {
  mode: "xdr" | "contract" | "none";
  onModeChange: (mode: "xdr" | "contract" | "none") => void;
  disabled?: boolean;
}

const OutcomeModeSelector: React.FC<OutcomeModeSelectorProps> = ({
  mode,
  onModeChange,
  disabled = false,
}) => {
  return (
    <div className="flex gap-2 p-1 bg-sunken rounded-control">
      <button
        type="button"
        onClick={() => !disabled && onModeChange("none")}
        disabled={disabled}
        className={`flex-1 px-3 py-2 text-sm font-medium rounded-control transition-colors ${
          mode === "none"
            ? "bg-action text-on-action shadow-sm"
            : "text-ink-muted hover:text-ink hover:bg-surface"
        } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
      >
        <div className="flex flex-col items-center">
          <span>None</span>
        </div>
      </button>

      <button
        type="button"
        onClick={() => !disabled && onModeChange("contract")}
        disabled={disabled}
        className={`flex-1 px-3 py-2 text-sm font-medium rounded-control transition-colors ${
          mode === "contract"
            ? "bg-action text-on-action shadow-sm"
            : "text-ink-muted hover:text-ink hover:bg-surface"
        } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
      >
        <div className="flex flex-col items-center">
          <span>Contract</span>
        </div>
      </button>

      <button
        type="button"
        onClick={() => !disabled && onModeChange("xdr")}
        disabled={disabled}
        className={`flex-1 px-3 py-2 text-sm font-medium rounded-control transition-colors ${
          mode === "xdr"
            ? "bg-action text-on-action shadow-sm"
            : "text-ink-muted hover:text-ink hover:bg-surface"
        } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
      >
        <div className="flex flex-col items-center">
          <span>XDR</span>
        </div>
      </button>
    </div>
  );
};

export default OutcomeModeSelector;
