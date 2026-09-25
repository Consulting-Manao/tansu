import { useId } from "react";
import Button from "components/utils/Button";
import Textarea from "components/utils/Textarea";
import Input from "components/utils/Input";
import OutcomeModeSelector from "./OutcomeModeSelector";
import TemplateSelector from "./TemplateSelector";
import EnhancedContractFunctionSelector from "components/EnhancedContractFunctionSelector";
import ContractNameSearch from "components/ContractNameSearch";
import { capitalizeFirstLetter } from "utils/utils";
import type { OutcomeDraft } from "utils/proposalOutcomes";
import {
  getOutcomeTemplateFills,
  getOutcomeTemplatesByType,
  type OutcomeTemplate,
  type OutcomeType,
} from "constants/outcomeTemplates";

interface OutcomeInputProps {
  type: OutcomeType;
  draft: OutcomeDraft;
  onChange: (draft: OutcomeDraft) => void;
  onRemove: () => void;
  descriptionError?: string | null;
  xdrError?: string | null;
  contractError?: string | null;
}

/** What an outcome template fills in, on its card. */
const outcomeTemplateTags = (template: OutcomeTemplate) => (
  <div className="mt-2 flex flex-wrap gap-1">
    {getOutcomeTemplateFills(template).map((fill) => (
      <span
        key={fill}
        className="px-1.5 py-0.5 rounded bg-primary/10 text-[10px] font-medium text-primary"
      >
        {fill}
      </span>
    ))}
  </div>
);

/** The contract call or transaction an outcome template fills in. */
const outcomeTemplatePreview = ({ contract, xdr }: OutcomeTemplate) => (
  <>
    {contract && (
      <div className="border border-primary rounded-lg p-4 bg-[#F5F1F9]">
        <p className="text-sm font-semibold text-primary mb-2">
          Contract call pre-filled
        </p>
        <div className="space-y-1 font-mono text-sm text-secondary">
          <p>
            <span className="text-primary">function:</span>{" "}
            {contract.execute_fn}
          </p>
          <p>
            <span className="text-primary">address:</span>{" "}
            {contract.address || "(fill after applying)"}
          </p>
          {contract.args.length > 0 && (
            <p>
              <span className="text-primary">args:</span>{" "}
              {JSON.stringify(contract.args)}
            </p>
          )}
        </div>
      </div>
    )}
    {xdr && (
      <div className="border border-primary rounded-lg p-4 bg-[#F5F1F9]">
        <p className="text-sm font-semibold text-primary mb-2">
          XDR transaction pre-filled
        </p>
        <pre className="whitespace-pre-wrap font-mono text-sm text-secondary break-all">
          {xdr}
        </pre>
      </div>
    )}
  </>
);

/** One outcome of a proposal: its description and what it executes. */
const OutcomeInput = ({
  type,
  draft,
  onChange,
  onRemove,
  descriptionError,
  xdrError,
  contractError,
}: OutcomeInputProps) => {
  const { description, mode, xdr, call } = draft;
  const update = (change: Partial<OutcomeDraft>) =>
    onChange({ ...draft, ...change });

  // Another contract has other functions: the chosen one and its arguments go.
  const setAddress = (address: string) =>
    update({
      call:
        address === call.address ? call : { address, execute_fn: "", args: [] },
    });

  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className="w-full flex flex-col items-start gap-[18px]"
    >
      <h3 id={headingId} className={`text-xl font-medium text-${type}`}>
        {capitalizeFirstLetter(type)} Outcome
      </h3>

      <div className="w-full flex flex-col gap-[18px]">
        <div className="flex items-center justify-between">
          <OutcomeModeSelector
            mode={mode}
            onModeChange={(next) => update({ mode: next })}
          />
          <Button type="secondary" size="sm" onClick={onRemove}>
            Remove
          </Button>
        </div>

        <TemplateSelector
          templates={getOutcomeTemplatesByType(type)}
          purpose="this outcome"
          renderTags={outcomeTemplateTags}
          renderPreview={outcomeTemplatePreview}
          onTemplateSelect={(template) =>
            // A template sets everything an author could: the description and
            // the call or transaction it executes, or neither.
            onChange({
              description: template.content,
              mode: template.contract
                ? "contract"
                : template.xdr
                  ? "xdr"
                  : "none",
              xdr: template.xdr ?? "",
              call: template.contract
                ? {
                    address: template.contract.address,
                    execute_fn: template.contract.execute_fn,
                    args: template.contract.args.map(String),
                  }
                : { address: "", execute_fn: "", args: [] },
            })
          }
        />

        <div className="flex flex-col gap-[18px]">
          <p className="leading-[16px] text-base font-[600] text-primary">
            Description
          </p>
          <div>
            <Textarea
              placeholder="Write the description"
              value={description}
              onChange={(e) => update({ description: e.target.value })}
              className={descriptionError ? "border-red-500" : ""}
            />
            {descriptionError && (
              <p className="mt-1 text-sm text-red-500">{descriptionError}</p>
            )}
          </div>
        </div>

        {mode === "xdr" && (
          <div className="flex flex-col gap-[18px]">
            <p className="leading-[16px] text-base font-[600] text-primary">
              XDR Transaction
            </p>
            <div>
              <Textarea
                className={`min-h-[120px] font-mono text-sm ${xdrError ? "border-red-500" : ""}`}
                placeholder="Paste your XDR transaction here..."
                value={xdr}
                onChange={(e) => update({ xdr: e.target.value })}
              />
              {xdrError && (
                <p className="mt-1 text-sm text-red-500">{xdrError}</p>
              )}
            </div>
          </div>
        )}

        {mode === "contract" && (
          <div className="flex flex-col gap-[18px]">
            <p className="leading-[16px] text-base font-[600] text-primary">
              Contract Function
            </p>

            {/* Resolve a contract by its registered name via the Stellar
                Registry (exact match, on-chain). Fills the address below. */}
            <div className="w-full flex flex-col gap-2">
              <label className="text-sm font-medium text-primary">
                Contract Name (Stellar Registry)
              </label>
              <ContractNameSearch
                onSelect={(contract) => setAddress(contract.contractId)}
              />
            </div>

            <Input
              label="Contract Address"
              placeholder="Enter contract address (e.g., CA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ)"
              value={call.address}
              onChange={(e) => setAddress(e.target.value.trim())}
              className={contractError ? "border-red-500" : ""}
            />

            {call.address && (
              <EnhancedContractFunctionSelector
                call={call}
                onChange={(next) => update({ call: next })}
              />
            )}

            {contractError && (
              <p className="mt-1 text-sm text-red-500">{contractError}</p>
            )}
          </div>
        )}
      </div>
    </section>
  );
};

export default OutcomeInput;
