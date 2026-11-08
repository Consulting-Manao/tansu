import React, { useState, useEffect } from "react";
import { Button, Dialog, SegmentedControl } from "components/ui";
import Markdown from "./Markdown";
import termsSummary from "../../constants/terms-summary.json";
import privacy from "../../../../legal/privacy-policy.md?raw";
import fullTerms from "../../../../legal/terms-of-service.md?raw";
import { acceptTerms } from "../../utils/terms";

type LegalView = "summary" | "fullTerms" | "privacy";

interface TermsAcceptanceModalProps {
  onAccept: () => void;
  onDecline: () => void;
}

interface ServiceModifications {
  description: string;
  administrativeRights: string;
}

interface ContactInformation {
  company: string;
  details: string;
  address: string;
  email: string;
  website: string;
}

interface TermsSections {
  keyPoints?: { title: string; content: string }[];
  importantRisks?: { title: string; content: string }[];
  yourResponsibilities?: string[];
  serviceModifications?: ServiceModifications;
  limitationsOfLiability?: string[];
  contactInformation?: ContactInformation;
}

interface TermsSummary {
  /** The date the Terms state at their top: their version. */
  lastUpdated: string;
  introduction: string;
  importantNotice: string;
  sections: TermsSections;
}

const s: TermsSummary = termsSummary;
const sections = s.sections;

const TermsAcceptanceModal: React.FC<TermsAcceptanceModalProps> = ({
  onAccept,
  onDecline,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [hasScrolled, setHasScrolled] = useState(false);
  const [view, setView] = useState<LegalView>("summary");

  useEffect(() => {
    const t = setTimeout(() => setIsVisible(true), 100);
    return () => clearTimeout(t);
  }, []);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.target as HTMLDivElement;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight * 0.8)
      setHasScrolled(true);
  };

  const handleAccept = () => {
    acceptTerms();
    onAccept();
  };

  if (!isVisible) return null;

  return (
    <Dialog onClose={onDecline} closable={false} hideClose bare size="lg">
      <div className="flex-shrink-0 p-5 pb-2 sm:p-8 sm:pb-2">
        <div className="flex flex-col gap-3">
          <h2 className="text-section font-bold text-ink">Terms of Service</h2>
          <div className="text-body text-ink-muted">
            Please read and accept our Terms of Service to continue
          </div>
          <div className="text-ui text-ink-muted">
            Last Updated: {s.lastUpdated}
          </div>
        </div>
        <div className="mt-4">
          <SegmentedControl
            label="Terms"
            value={view}
            onChange={setView}
            segments={[
              { value: "summary", label: "Summary" },
              { value: "fullTerms", label: "Terms of Service" },
              { value: "privacy", label: "Privacy Policy" },
            ]}
          />
        </div>
      </div>

      <div
        className="flex-1 min-h-0 overflow-auto px-5 pt-4 pb-5 sm:px-8"
        onScroll={handleScroll}
      >
        {view === "summary" && (
          <div className="flex flex-col gap-6">
            <div className="bg-info-soft border border-info/40 rounded-control p-4">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0">
                  <svg
                    className="w-5 h-5 text-link mt-0.5"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div>
                  <h4 className="text-ui font-semibold text-link mb-1">
                    Important Notice
                  </h4>
                  <p className="text-ui text-link">{s.importantNotice}</p>
                </div>
              </div>
            </div>
            <div className="bg-surface p-6 rounded-control border border-line shadow-raise">
              <p className="text-ink-muted leading-relaxed">{s.introduction}</p>
            </div>
            {sections.keyPoints && (
              <div className="bg-surface p-6 rounded-control border border-line shadow-raise">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-card">🔑</span>
                  <h2 className="text-lead font-semibold text-ink">
                    Key Points
                  </h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {sections.keyPoints.map((item, i) => (
                    <div key={i} className="bg-sunken rounded-control p-3">
                      <h3 className="font-semibold text-ink mb-1">
                        {item.title}
                      </h3>
                      <p className="text-ink-muted text-ui">{item.content}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {sections.importantRisks && (
              <div className="bg-surface p-6 rounded-control border border-line shadow-raise">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-card">⚠️</span>
                  <h2 className="text-lead font-semibold text-ink">
                    Important Risks
                  </h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {sections.importantRisks.map((item, i) => (
                    <div key={i} className="bg-danger-soft rounded-control p-3">
                      <h4 className="font-semibold text-danger mb-1">
                        {item.title}
                      </h4>
                      <p className="text-danger text-ui">{item.content}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {sections.yourResponsibilities && (
              <div className="bg-surface p-6 rounded-control border border-line shadow-raise">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-card">📋</span>
                  <h2 className="text-lead font-semibold text-ink">
                    Your Responsibilities
                  </h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {sections.yourResponsibilities.map((item, i) => (
                    <div key={i} className="bg-info-soft rounded-control p-3">
                      <p className="text-link text-ui font-medium">{item}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {sections.serviceModifications && (
              <div className="bg-surface p-6 rounded-control border border-line shadow-raise">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-card">⚙️</span>
                  <h2 className="text-lead font-semibold text-ink">
                    Service Modifications
                  </h2>
                </div>
                <div className="space-y-3">
                  <p className="text-ink-muted text-ui mb-3">
                    {sections.serviceModifications.description}
                  </p>
                  <div className="bg-warning-soft border border-warning/40 rounded-control p-3">
                    <h4 className="font-semibold text-warning mb-1">
                      Administrative Rights
                    </h4>
                    <p className="text-warning text-ui">
                      {sections.serviceModifications.administrativeRights}
                    </p>
                  </div>
                </div>
              </div>
            )}
            {sections.limitationsOfLiability && (
              <div className="bg-surface p-6 rounded-control border border-line shadow-raise">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-card">🛡️</span>
                  <h2 className="text-lead font-semibold text-ink">
                    Limitations of Liability
                  </h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {sections.limitationsOfLiability.map((item, i) => (
                    <div
                      key={i}
                      className="bg-warning-soft rounded-control p-3"
                    >
                      <p className="text-warning text-ui font-medium">{item}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {sections.contactInformation && (
              <div className="bg-surface p-6 rounded-control border border-line shadow-raise">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-card">📞</span>
                  <h2 className="text-lead font-semibold text-ink">
                    Contact Information
                  </h2>
                </div>
                <div className="space-y-3">
                  <div>
                    <h4 className="font-semibold text-ink mb-1">
                      {sections.contactInformation.company}
                    </h4>
                    <p className="text-ink-muted text-ui whitespace-pre-line">
                      {sections.contactInformation.details}
                    </p>
                  </div>
                  <div>
                    <span className="font-semibold text-ink">Address:</span>
                    <p className="text-ink-muted text-ui">
                      {sections.contactInformation.address}
                    </p>
                  </div>
                  <div>
                    <span className="font-semibold text-ink">Email:</span>
                    <p className="text-ink-muted text-ui">
                      {sections.contactInformation.email}
                    </p>
                  </div>
                  <div>
                    <span className="font-semibold text-ink">Website:</span>
                    <p className="text-ink-muted text-ui">
                      {sections.contactInformation.website}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {view !== "summary" && (
          <Markdown>{view === "fullTerms" ? fullTerms : privacy}</Markdown>
        )}
      </div>

      <div className="flex-shrink-0 flex flex-col gap-4 border-t border-line px-5 pt-4 pb-6 sm:px-8">
        <div className="text-center sm:text-left">
          <p className="text-ui text-ink-muted">
            By clicking "Accept", you agree to be bound by these Terms of
            Service.
          </p>
          {!hasScrolled && (
            <p className="text-ink text-label mt-1">
              Please scroll down to read more before accepting
            </p>
          )}
          <a
            href="/impressum/"
            className="text-label text-ink-muted underline mt-1 inline-block"
          >
            Impressum
          </a>
        </div>
        <div className="flex gap-3 justify-center sm:justify-end">
          <Button tone="secondary" onClick={onDecline}>
            Decline
          </Button>
          <Button onClick={handleAccept} disabled={!hasScrolled}>
            Accept Terms
          </Button>
        </div>
      </div>
    </Dialog>
  );
};

export default TermsAcceptanceModal;
