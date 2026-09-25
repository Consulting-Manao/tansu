import { useQuery } from "@tanstack/react-query";
import Button from "components/utils/Button";
import Input from "components/utils/Input";
import {
  getContractFunctions,
  isValidContractAddress,
  type ContractFunctionInput,
} from "@service/ContractIntrospectionService";
import { queryClient } from "@service/queryClient";
import type { OutcomeCall } from "utils/proposalOutcomes";

const INTEGER_TYPES = new Set([
  "u32",
  "i32",
  "u64",
  "i64",
  "u128",
  "i128",
  "u256",
  "i256",
  "timepoint",
  "duration",
]);

/**
 * The function an outcome calls on `call.address`, and its arguments, from
 * the contract's spec. Arguments stay as typed: they are encoded with the
 * spec when the proposal is created.
 */
const EnhancedContractFunctionSelector = ({
  call,
  onChange,
}: {
  call: OutcomeCall;
  onChange: (call: OutcomeCall) => void;
}) => {
  const valid = isValidContractAddress(call.address);
  const functions = useQuery(
    {
      queryKey: ["contractFunctions", call.address],
      queryFn: () => getContractFunctions(call.address),
      enabled: valid,
      staleTime: Infinity,
      retry: 1,
    },
    queryClient,
  );
  const selected = functions.data?.find((fn) => fn.name === call.execute_fn);

  if (!valid) {
    return (
      <p className="text-sm text-red-500">
        Enter a contract address (C...) to choose its function.
      </p>
    );
  }
  if (functions.isPending) {
    return <p className="text-sm text-secondary">Loading functions...</p>;
  }
  if (functions.isError) {
    return (
      <div className="flex flex-col gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
        <p className="text-sm text-red-800">
          Could not read this contract's functions: {functions.error.message}
        </p>
        <Button type="secondary" size="sm" onClick={() => functions.refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-primary">
        Function Name
        <select
          value={call.execute_fn}
          onChange={(e) => {
            const fn = functions.data.find((f) => f.name === e.target.value);
            onChange({
              ...call,
              execute_fn: e.target.value,
              args: fn ? fn.inputs.map(() => "") : [],
            });
          }}
          className="mt-2 w-full p-3 border border-gray-300 rounded-md font-normal"
        >
          <option value="">Select a function</option>
          {functions.data.map((fn) => (
            <option key={fn.name} value={fn.name}>
              {fn.name}({fn.inputs.map((input) => input.type).join(", ")})
            </option>
          ))}
        </select>
      </label>

      {selected?.inputs.map((input, index) => (
        <ArgInput
          key={`${selected.name}-${input.name}`}
          input={input}
          value={call.args[index] ?? ""}
          onChange={(value) => {
            const args = [...call.args];
            args[index] = value;
            onChange({ ...call, args });
          }}
        />
      ))}
    </div>
  );
};

/** One argument, as text; `true`/`false` for booleans. */
const ArgInput = ({
  input,
  value,
  onChange,
}: {
  input: ContractFunctionInput;
  value: string;
  onChange: (value: string) => void;
}) => {
  const label = `${input.name} (${input.type})`;
  if (input.type === "bool") {
    return (
      <label className="block text-xs font-medium text-secondary">
        {label}
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="mt-1 w-full p-3 border border-gray-300 rounded-md"
        >
          <option value="">Select true/false</option>
          <option value="false">false</option>
          <option value="true">true</option>
        </select>
      </label>
    );
  }
  return (
    <Input
      label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      inputMode={INTEGER_TYPES.has(input.type) ? "numeric" : undefined}
      placeholder={
        input.type === "address"
          ? "G... or C..."
          : INTEGER_TYPES.has(input.type)
            ? "0"
            : input.type.startsWith("bytes")
              ? "Hex bytes"
              : "Value"
      }
      className="font-mono text-sm"
    />
  );
};

export default EnhancedContractFunctionSelector;
