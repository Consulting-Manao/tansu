import { useState } from "react";
import Markdown from "./Markdown";

interface SimpleMarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  /** Where the preview resolves relative paths from. */
  baseUrl?: string | undefined;
}

const SimpleMarkdownEditor: React.FC<SimpleMarkdownEditorProps> = ({
  value,
  onChange,
  placeholder = "Type your markdown here...",
  className = "",
  baseUrl,
}) => {
  const [activeTab, setActiveTab] = useState<"edit" | "preview">("edit");

  return (
    <div
      className={`border border-line-strong rounded-control overflow-hidden ${className}`}
    >
      {/* Tab Headers */}
      <div className="flex border-b border-line-strong bg-sunken">
        <button
          type="button"
          onClick={() => setActiveTab("edit")}
          className={`px-4 py-2 text-sm font-medium ${
            activeTab === "edit"
              ? "bg-surface border-b-2 border-action text-ink"
              : "text-ink-muted hover:text-ink"
          }`}
        >
          Edit
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("preview")}
          className={`px-4 py-2 text-sm font-medium ${
            activeTab === "preview"
              ? "bg-surface border-b-2 border-action text-ink"
              : "text-ink-muted hover:text-ink"
          }`}
        >
          Preview
        </button>
      </div>

      {/* Content */}
      <div className="min-h-[200px]">
        {activeTab === "edit" ? (
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="w-full min-h-[200px] p-4 border-none outline-none resize-y font-mono text-sm"
            style={{
              fontFamily:
                'ui-monospace, SFMono-Regular, "SF Mono", Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
            }}
          />
        ) : value.trim() ? (
          <Markdown className="p-4 min-h-[200px]" baseUrl={baseUrl}>
            {value}
          </Markdown>
        ) : (
          <p className="p-4 min-h-[200px] text-ink-muted italic">
            Nothing to preview...
          </p>
        )}
      </div>

      {/* Help Text */}
      {activeTab === "edit" && (
        <div className="px-4 py-2 bg-sunken border-t border-line-strong text-xs text-ink-muted">
          <p>
            <strong>Supported:</strong> **bold** *italic* # headings - lists |
            tables | ![images](url) [links](url) &gt; quotes `code` ```code
            blocks```
          </p>
        </div>
      )}
    </div>
  );
};

export default SimpleMarkdownEditor;
