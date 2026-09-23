import * as StellarSdk from "@stellar/stellar-sdk";

export interface ContractFunction {
  name: string;
  inputs: ContractFunctionInput[];
  outputs?: ContractFunctionOutput[];
}

export interface ContractFunctionInput {
  name: string;
  type: string;
}

export interface ContractFunctionOutput {
  type: string;
}

/**
 * List a contract's functions, with argument names and types, from the spec
 * the SDK loads with the contract.
 */
export async function getContractFunctions(
  contractAddress: string,
): Promise<ContractFunction[]> {
  try {
    const client = await StellarSdk.contract.Client.from({
      contractId: contractAddress,
      rpcUrl: import.meta.env.PUBLIC_SOROBAN_RPC_URL,
      networkPassphrase: import.meta.env.PUBLIC_SOROBAN_NETWORK_PASSPHRASE,
    });
    return client.spec
      .funcs()
      .map((fn) => ({
        name: fn.name.toString(),
        inputs: fn.inputs.map((input) => ({
          name: input.name.toString(),
          type: specTypeName(input.type),
        })),
        outputs: fn.outputs.map((output) => ({ type: specTypeName(output) })),
      }))
      .filter((fn) => fn.name !== "__constructor");
  } catch {
    // Return empty array when introspection fails - user will need manual input
    return [];
  }
}

/** "scSpecTypeU64" → "u64", the names the argument inputs switch on. */
function specTypeName(type: StellarSdk.xdr.ScSpecTypeDef): string {
  return type.type.replace(/^scSpecType/, "").toLowerCase();
}

/**
 * Validate if a contract address is valid
 */
export function isValidContractAddress(address: string): boolean {
  try {
    new StellarSdk.Address(address);
    return address.startsWith("C") && address.length === 56;
  } catch {
    return false;
  }
}
