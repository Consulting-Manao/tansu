import React, { useState, useEffect } from "react";
import Markdown from "./Markdown";
import termsSummary from "../../constants/terms-summary.json";
import privacy from "../../../../legal/privacy-policy.md?raw";
import fullTerms from "../../../../legal/terms-of-service.md?raw";

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
  introduction: string;
  sections: TermsSections;
}

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
    localStorage.setItem(
      "tansu_tos_accepted",
      JSON.stringify({
        accepted: true,
        timestamp: new Date().toISOString(),
        version: "October 21, 2025",
      }),
    );
    onAccept();
  };

  const s: TermsSummary = termsSummary;
  const sections = s.sections;

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 bg-white/35 backdrop-blur-md flex justify-center items-center z-[9999] p-2 sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Terms of Service"
        className="modal relative bg-white shadow-modal rounded-lg max-w-[95vw] w-full sm:w-auto max-w-4xl flex flex-col max-h-[90vh]"
      >
        <div className="flex-shrink-0 p-3 sm:p-4 md:p-6 lg:p-8 pb-2">
          <div className="flex flex-col gap-3">
            <div className="leading-6 text-2xl font-medium text-primary">
              Terms of Service
            </div>
            <div className="text-base text-secondary">
              Please read and accept our Terms of Service to continue
            </div>
            <div className="text-sm text-zinc-600">
              Last Updated: October 21, 2025
            </div>
          </div>
          <div className="flex gap-2 mt-4 border-b border-gray-200">
            <button
              type="button"
              onClick={() => setView("summary")}
              className={`px-4 py-2 text-sm font-medium rounded-t transition-colors ${
                view === "summary"
                  ? "text-primary border-b-2 border-primary -mb-px"
                  : "text-zinc-600 hover:text-primary"
              }`}
            >
              Summary
            </button>
            <button
              type="button"
              onClick={() => setView("fullTerms")}
              className={`px-4 py-2 text-sm font-medium rounded-t transition-colors ${
                view === "fullTerms"
                  ? "text-primary border-b-2 border-primary -mb-px"
                  : "text-zinc-600 hover:text-primary"
              }`}
            >
              Terms of Service
            </button>
            <button
              type="button"
              onClick={() => setView("privacy")}
              className={`px-4 py-2 text-sm font-medium rounded-t transition-colors ${
                view === "privacy"
                  ? "text-primary border-b-2 border-primary -mb-px"
                  : "text-zinc-600 hover:text-primary"
              }`}
            >
              Privacy Policy
            </button>
          </div>
        </div>

        <div
          className="flex-1 min-h-0 overflow-auto p-3 sm:p-4 md:p-6 lg:p-8 pt-4"
          onScroll={handleScroll}
        >
          {view === "summary" && (
            <div className="flex flex-col gap-6">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0">
                    <svg
                      className="w-5 h-5 text-blue-600 mt-0.5"
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
                    <h4 className="text-sm font-semibold text-blue-800 mb-1">
                      Important Notice
                    </h4>
                    <p className="text-sm text-blue-700">
                      Our architecture is fully decentralized—we do not operate
                      backend servers or store user data. We recommend reading
                      our Privacy Policy alongside these Terms.
                    </p>
                  </div>
                </div>
              </div>
              <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-card">
                <p className="text-secondary leading-relaxed">
                  {s.introduction ||
                    "Tansu is a decentralized governance platform operated by Consulting Manao GmbH, located in Austria. By using our dApp, you agree to be bound by these Terms of Service."}
                </p>
              </div>
              {sections.keyPoints && (
                <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-card">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-lg">🔑</span>
                    <h2 className="text-xl font-semibold text-primary">
                      Key Points
                    </h2>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {sections.keyPoints.map((item, i) => (
                      <div key={i} className="bg-gray-50 rounded-lg p-3">
                        <h3 className="font-semibold text-primary mb-1">
                          {item.title}
                        </h3>
                        <p className="text-secondary text-sm">{item.content}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {sections.importantRisks && (
                <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-card">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-lg">⚠️</span>
                    <h2 className="text-xl font-semibold text-primary">
                      Important Risks
                    </h2>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {sections.importantRisks.map((item, i) => (
                      <div key={i} className="bg-red-50 rounded-lg p-3">
                        <h4 className="font-semibold text-red-800 mb-1">
                          {item.title}
                        </h4>
                        <p className="text-red-700 text-sm">{item.content}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {sections.yourResponsibilities && (
                <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-card">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-lg">📋</span>
                    <h2 className="text-xl font-semibold text-primary">
                      Your Responsibilities
                    </h2>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {sections.yourResponsibilities.map((item, i) => (
                      <div key={i} className="bg-blue-50 rounded-lg p-3">
                        <p className="text-blue-700 text-sm font-medium">
                          {item}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {sections.serviceModifications && (
                <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-card">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-lg">⚙️</span>
                    <h2 className="text-xl font-semibold text-primary">
                      Service Modifications
                    </h2>
                  </div>
                  <div className="space-y-3">
                    <p className="text-secondary text-sm mb-3">
                      {sections.serviceModifications.description}
                    </p>
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                      <h4 className="font-semibold text-yellow-800 mb-1">
                        Administrative Rights
                      </h4>
                      <p className="text-yellow-700 text-sm">
                        {sections.serviceModifications.administrativeRights}
                      </p>
                    </div>
                  </div>
                </div>
              )}
              {sections.limitationsOfLiability && (
                <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-card">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-lg">🛡️</span>
                    <h2 className="text-xl font-semibold text-primary">
                      Limitations of Liability
                    </h2>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {sections.limitationsOfLiability.map((item, i) => (
                      <div key={i} className="bg-yellow-50 rounded-lg p-3">
                        <p className="text-yellow-700 text-sm font-medium">
                          {item}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {sections.contactInformation && (
                <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-card">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-lg">📞</span>
                    <h2 className="text-xl font-semibold text-primary">
                      Contact Information
                    </h2>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <h4 className="font-semibold text-primary mb-1">
                        {sections.contactInformation.company}
                      </h4>
                      <p className="text-secondary text-sm whitespace-pre-line">
                        {sections.contactInformation.details}
                      </p>
                    </div>
                    <div>
                      <span className="font-semibold text-primary">
                        Address:
                      </span>
                      <p className="text-secondary text-sm">
                        {sections.contactInformation.address}
                      </p>
                    </div>
                    <div>
                      <span className="font-semibold text-primary">Email:</span>
                      <p className="text-secondary text-sm">
                        {sections.contactInformation.email}
                      </p>
                    </div>
                    <div>
                      <span className="font-semibold text-primary">
                        Website:
                      </span>
                      <p className="text-secondary text-sm">
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

        <div className="flex-shrink-0 flex flex-col gap-4 pt-4 pb-6 px-3 sm:px-4 md:px-6 lg:px-8 border-t border-zinc-200">
          <div className="text-center sm:text-left">
            <p className="text-sm text-secondary">
              By clicking "Accept", you agree to be bound by these Terms of
              Service.
            </p>
            {!hasScrolled && (
              <p className="text-primary text-xs mt-1">
                Please scroll down to read more before accepting
              </p>
            )}
          </div>
          <div className="flex gap-4 justify-center sm:justify-end">
            <button
              onClick={onDecline}
              className="px-6 py-3 bg-zinc-200 hover:bg-zinc-300 text-zinc-700 font-semibold rounded-lg transition-colors duration-200"
            >
              Decline
            </button>
            <button
              onClick={handleAccept}
              disabled={!hasScrolled}
              className={`px-6 py-3 font-semibold rounded-lg transition-colors duration-200 ${
                hasScrolled
                  ? "bg-primary hover:bg-secondary text-white"
                  : "bg-zinc-300 text-zinc-500 cursor-not-allowed"
              }`}
            >
              Accept Terms
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TermsAcceptanceModal;
