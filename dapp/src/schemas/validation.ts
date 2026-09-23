import { z } from "zod";
import { isSupportedRepositoryUrl } from "../utils/editLinkFunctions";

/**
 * Centralized validation schemas using Zod.
 * Type-safe, composable validation for all form inputs and data.
 */

// Stellar account address (G...).
export const stellarAddressSchema = z
  .string()
  .min(1, "Stellar address is required")
  .length(56, "Stellar address must be 56 characters long")
  .regex(/^G[A-Z0-9]{55}$/, "Enter a valid Stellar account address (G...)");

// Stellar principal: account (G...) or Soroban contract (C...).
// Used where the on-chain contract treats both as equivalent authorizers via
// require_auth() — notably project maintainers, where a contract address can
// be a DAO, multisig, or other contract acting on the project's behalf.
export const stellarPrincipalSchema = z
  .string()
  .min(1, "Stellar address is required")
  .length(56, "Stellar address must be 56 characters long")
  .regex(
    /^[GC][A-Z0-9]{55}$/,
    "Enter a valid Stellar account (G...) or contract (C...) address",
  );

const projectNameSchema = z
  .string()
  .min(4, "Project name must be at least 4 characters")
  .max(30, "Project name must be at most 30 characters")
  .regex(
    /^[a-zA-Z0-9]+$/,
    "Project name can only contain letters (a-z, A-Z) and digits (0-9)",
  )
  .refine((name) => name.trim().length > 0, "Project name cannot be empty");

const githubUrlSchema = z
  .string()
  .min(1, "Repository URL is required")
  .refine(
    (value) => isSupportedRepositoryUrl(value),
    "Repository reference must be a supported Git provider URL or a public Radicle RID/URL",
  );

const httpsUrlSchema = z
  .string()
  .refine((url) => url.startsWith("https://"), "URL must start with https://");

const optionalHttpsUrlSchema = z
  .string()
  .optional()
  .refine(
    (url) => !url || url.startsWith("https://"),
    "URL must start with https://",
  );

const proposalNameSchema = z
  .string()
  .min(10, "Proposal name must be at least 10 characters")
  .max(256, "Proposal name must be at most 256 characters")
  .refine((name) => name.trim().length > 0, "Proposal name is required");

const textContentSchema = (minWords = 3, fieldName = "Text") =>
  z
    .string()
    .min(1, `${fieldName} is required`)
    .refine((text) => {
      const words = text.trim().split(/\s+/).length;
      return words >= minWords;
    }, `${fieldName} must contain at least ${minWords} words`);

// Validation helper functions that work with existing patterns
function validateField<T>(
  schema: z.ZodSchema<T>,
  value: unknown,
): string | null {
  try {
    schema.parse(value);
    return null;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return error.issues[0]?.message || "Validation failed";
    }
    return "Validation failed";
  }
}

// Utility functions for direct use
export const validateProjectName = (name: string): string | null =>
  validateField(projectNameSchema, name);

// Members and voters can be accounts or smart accounts (Nido).
export const validateStellarPrincipal = (address: string): string | null =>
  validateField(stellarPrincipalSchema, address);

export const validateGithubUrl = (url: string): string | null =>
  validateField(githubUrlSchema, url);

export const validateMaintainerAddress = (address: string): string | null =>
  validateField(stellarPrincipalSchema, address);

export const validateUrl = (url: string, required = false): string | null =>
  validateField(required ? httpsUrlSchema : optionalHttpsUrlSchema, url);

export const validateProposalName = (name: string): string | null =>
  validateField(proposalNameSchema, name);

export const validateTextContent = (
  text: string,
  minWords = 3,
  fieldName = "Text",
): string | null => validateField(textContentSchema(minWords, fieldName), text);
