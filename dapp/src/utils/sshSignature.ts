export function extractSignatureBytes(input: string): Uint8Array | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  try {
    const bytes = Uint8Array.from(atob(trimmed), (c) => c.charCodeAt(0));
    if (bytes.length === 64) return bytes;
  } catch {
    return null;
  }

  return null;
}
