import React from "react";
import { SegmentedControl } from "components/ui";

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
    <SegmentedControl
      label="Outcome"
      block
      disabled={disabled}
      value={mode}
      onChange={onModeChange}
      segments={[
        { value: "none", label: "None" },
        { value: "contract", label: "Contract" },
        { value: "xdr", label: "XDR" },
      ]}
    />
  );
};

export default OutcomeModeSelector;
