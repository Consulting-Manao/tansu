import { useState, useCallback } from "react";
import {
  getOutcomeTemplatesByType,
  getOutcomeTemplateFills,
  type OutcomeTemplate,
  type OutcomeType,
} from "../../../constants/outcomeTemplates";
import Modal from "../../../components/utils/Modal";
import Button from "../../../components/utils/Button";

interface OutcomeTemplateSelectorProps {
  outcomeType: OutcomeType;
  onTemplateSelect: (template: OutcomeTemplate) => void;
}

export default function OutcomeTemplateSelector({
  outcomeType,
  onTemplateSelect,
}: OutcomeTemplateSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [previewTemplate, setPreviewTemplate] =
    useState<OutcomeTemplate | null>(null);

  const templates = getOutcomeTemplatesByType(outcomeType);

  const handleTemplateClick = useCallback(
    (template: OutcomeTemplate) => {
      onTemplateSelect(template);
      setIsOpen(false);
    },
    [onTemplateSelect],
  );

  const handlePreviewClick = useCallback(
    (template: OutcomeTemplate, e: React.MouseEvent) => {
      e.stopPropagation();
      setPreviewTemplate(template);
    },
    [],
  );

  const handleUseTemplate = useCallback(() => {
    if (previewTemplate) {
      onTemplateSelect(previewTemplate);
      setPreviewTemplate(null);
      setIsOpen(false);
    }
  }, [previewTemplate, onTemplateSelect]);

  return (
    <div className="template-selector mb-4">
      <div className="flex items-center justify-between mb-2">
        <div>
          <p className="text-sm font-medium text-primary">
            Start with a template
          </p>
          <p className="text-xs text-secondary">
            Choose a structured format for this outcome
          </p>
        </div>
        <Button type="tertiary" size="sm" onClick={() => setIsOpen(!isOpen)}>
          {isOpen ? "Hide Templates" : "Browse Templates"}
        </Button>
      </div>

      {isOpen && !previewTemplate && (
        <div className="mt-3 p-4 border border-primary rounded-lg bg-[#F5F1F9] shadow-lg">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 overflow-y-auto pr-2">
            {templates.map((template) => (
              <div
                key={template.id}
                onClick={() => handleTemplateClick(template)}
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
                    onClick={(e) => handlePreviewClick(template, e)}
                    className="hover:bg-gray-200 bg-white border border-primary/20 shadow-sm"
                  >
                    Preview
                  </Button>
                </div>
                <p className="text-xs text-secondary line-clamp-2">
                  {template.description}
                </p>
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
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Preview Modal */}
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

            {previewTemplate.contract && (
              <div className="border border-primary rounded-lg p-4 bg-[#F5F1F9]">
                <p className="text-sm font-semibold text-primary mb-2">
                  Contract call pre-filled
                </p>
                <div className="space-y-1 font-mono text-sm text-secondary">
                  <p>
                    <span className="text-primary">function:</span>{" "}
                    {previewTemplate.contract.execute_fn}
                  </p>
                  <p>
                    <span className="text-primary">address:</span>{" "}
                    {previewTemplate.contract.address ||
                      "(fill after applying)"}
                  </p>
                  {previewTemplate.contract.args.length > 0 && (
                    <p>
                      <span className="text-primary">args:</span>{" "}
                      {JSON.stringify(previewTemplate.contract.args)}
                    </p>
                  )}
                </div>
              </div>
            )}

            {previewTemplate.xdr && (
              <div className="border border-primary rounded-lg p-4 bg-[#F5F1F9]">
                <p className="text-sm font-semibold text-primary mb-2">
                  XDR transaction pre-filled
                </p>
                <pre className="whitespace-pre-wrap font-mono text-sm text-secondary break-all">
                  {previewTemplate.xdr}
                </pre>
              </div>
            )}

            <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4 border-t border-primary">
              <Button
                type="tertiary"
                onClick={() => setPreviewTemplate(null)}
                className="hover:border-gray-400"
              >
                Close
              </Button>
              <Button onClick={handleUseTemplate}>Use This Template</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
