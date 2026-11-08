import { useState, useCallback } from "react";
import { focusRing } from "./style";

interface CopyButtonProps {
  textToCopy: string;
  className?: string;
  size?: "sm" | "md" | "lg";
  showText?: boolean;
  text?: string;
}

/**
 * A reusable copy button component that shows a green check mark when clicked
 */
export const CopyButton = ({
  textToCopy,
  className = "",
  size = "md",
  showText = false,
  text = "Copy",
}: CopyButtonProps) => {
  const [isCopied, setIsCopied] = useState(false);

  // Size classes mapping
  const sizeClasses = {
    sm: "w-4 h-4",
    md: "w-5 h-5",
    lg: "w-6 h-6",
  };

  const handleCopy = useCallback(async () => {
    if (!textToCopy) return;

    try {
      // Use the Clipboard API
      await navigator.clipboard.writeText(textToCopy);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (error) {
      // Most modern browsers support the Clipboard API,
      // so we'll just log the error if it doesn't work
      // instead of using the deprecated execCommand
      if (error instanceof Error) {
        console.error("Failed to copy text:", error.message);
      } else {
        console.error("Failed to copy text:", error);
      }
    }
  }, [textToCopy]);

  const icon = sizeClasses[size];
  return (
    <button
      type="button"
      className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-control p-1 text-ink-muted transition-colors hover:bg-sunken hover:text-ink ${focusRing} ${className}`}
      onClick={handleCopy}
      aria-label={isCopied ? "Copied" : "Copy to clipboard"}
      title={isCopied ? "Copied" : "Copy to clipboard"}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className={`${icon} ${isCopied ? "text-success" : ""}`}
      >
        {isCopied ? (
          <path d="m5 12.5 4.5 4.5L19 7.5" />
        ) : (
          <>
            <rect x="9" y="9" width="11" height="11" rx="2" />
            <path d="M5 15V5a2 2 0 0 1 2-2h10" />
          </>
        )}
      </svg>
      {showText && <span>{isCopied ? "Copied!" : text}</span>}
    </button>
  );
};
