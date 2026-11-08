import { useState } from "react";
import Markdown from "./Markdown";
import { SegmentedControl } from "components/ui";

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
      <div className="border-b border-line-strong bg-sunken p-1.5">
        <SegmentedControl
          label="Editor"
          value={activeTab}
          onChange={setActiveTab}
          segments={[
            { value: "edit", label: "Edit" },
            { value: "preview", label: "Preview" },
          ]}
        />
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
