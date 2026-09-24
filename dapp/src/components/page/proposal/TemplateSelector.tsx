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
          <p className="text-sm font-medium text-primary">
            Start with a template
          </p>
          <p className="text-xs text-secondary">
            Choose a structured format for {purpose}
          </p>
        </div>
        <Button type="tertiary" size="sm" onClick={() => setIsOpen(!isOpen)}>
          {isOpen ? "Hide Templates" : "Browse Templates"}
        </Button>
      </div>

      {isOpen && !previewTemplate && (
        <div className="mt-3 p-4 border border-primary rounded-lg bg-[#F5F1F9] shadow-lg">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-60 overflow-y-auto pr-2">
            {templates.map((template) => (
              <div
                key={template.id}
                onClick={() => select(template)}
                className="cursor-pointer p-3 border border-primary rounded-lg hover:bg-white transition-all hover:shadow-md"
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="flex-1">
                    <h4 className="font-medium text-primary">
                      {template.name}
                    </h4>
                  </div>
                  <Button
                    type="secondary"
                    size="xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPreviewTemplate(template);
                    }}
                    className="hover:bg-gray-200 bg-white border border-primary/20 shadow-sm"
                  >
                    Preview
                  </Button>
                </div>
                <p className="text-xs text-secondary line-clamp-2">
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
              <h3 className="text-xl font-semibold text-primary mb-2">
                {previewTemplate.name}
              </h3>
              <p className="text-sm text-secondary">
                {previewTemplate.description}
              </p>
            </div>

            <div className="border border-primary rounded-lg p-4 bg-[#F5F1F9] overflow-auto max-h-[50vh]">
              <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed">
                {previewTemplate.content}
              </pre>
            </div>

            {renderPreview?.(previewTemplate)}

            <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4 border-t border-primary">
              <Button
                type="tertiary"
                onClick={() => setPreviewTemplate(null)}
                className="hover:border-gray-400"
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
