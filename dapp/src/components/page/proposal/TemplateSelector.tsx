import { useState, type ReactNode } from "react";
import Modal from "../../../components/utils/Modal";
import Button from "../../../components/utils/Button";

interface Template {
  id: string;
  name: string;
  description: string;
  content: string;
}

/**
 * Browse templates, preview one, and apply it. A kind of template adds its own
 * details with `renderTags` (on its card) and `renderPreview`.
 */
export default function TemplateSelector<T extends Template>({
  templates,
  purpose,
  onTemplateSelect,
  renderTags,
  renderPreview,
}: {
  templates: T[];
  /** What the templates structure, e.g. "your proposal". */
  purpose: string;
  onTemplateSelect: (template: T) => void;
  renderTags?: (template: T) => ReactNode;
  renderPreview?: (template: T) => ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<T | null>(null);

  const select = (template: T) => {
    onTemplateSelect(template);
    setPreviewTemplate(null);
    setIsOpen(false);
  };

  if (templates.length === 0) return null;

  return (
    <div className="template-selector mb-4">
      <div className="flex items-center justify-between mb-2">
        <div>
          <p className="text-sm font-medium text-ink">Start with a template</p>
          <p className="text-xs text-ink-muted">
            Choose a structured format for {purpose}
          </p>
        </div>
        <Button type="tertiary" size="sm" onClick={() => setIsOpen(!isOpen)}>
          {isOpen ? "Hide Templates" : "Browse Templates"}
        </Button>
      </div>

      {isOpen && !previewTemplate && (
        <div className="mt-3 p-4 border border-action rounded-control bg-sunken shadow-lg">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-60 overflow-y-auto pr-2">
            {templates.map((template) => (
              <div
                key={template.id}
                onClick={() => select(template)}
                className="cursor-pointer p-3 border border-action rounded-control hover:bg-surface transition-all hover:shadow-md"
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="flex-1">
                    <h4 className="font-medium text-ink">{template.name}</h4>
                  </div>
                  <Button
                    type="secondary"
                    size="xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPreviewTemplate(template);
                    }}
                    className="hover:bg-line bg-surface border border-action/20 shadow-sm"
                  >
                    Preview
                  </Button>
                </div>
                <p className="text-xs text-ink-muted line-clamp-2">
                  {template.description}
                </p>
                {renderTags?.(template)}
              </div>
            ))}
          </div>
        </div>
      )}

      {previewTemplate && (
        <Modal onClose={() => setPreviewTemplate(null)} fullWidth>
          <div className="flex flex-col gap-6">
            <div className="text-center">
              <h3 className="text-xl font-semibold text-ink mb-2">
                {previewTemplate.name}
              </h3>
              <p className="text-sm text-ink-muted">
                {previewTemplate.description}
              </p>
            </div>

            <div className="border border-action rounded-control p-4 bg-sunken overflow-auto max-h-[50vh]">
              <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed">
                {previewTemplate.content}
              </pre>
            </div>

            {renderPreview?.(previewTemplate)}

            <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4 border-t border-action">
              <Button
                type="tertiary"
                onClick={() => setPreviewTemplate(null)}
                className="hover:border-line-strong"
              >
                Close
              </Button>
              <Button onClick={() => select(previewTemplate)}>
                Use This Template
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
