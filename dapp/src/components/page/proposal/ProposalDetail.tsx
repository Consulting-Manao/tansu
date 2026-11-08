import { StrKey } from "@stellar/stellar-sdk";
import { Badge, Button, ButtonLink, Card, CardHeader } from "components/ui";
import Modal from "components/utils/Modal";
import Markdown from "components/utils/Markdown";
import React, { useEffect, useState, useMemo } from "react";
import JsonView from "react18-json-view";
import type {
  ProposalOutcome,
  OutcomeContract,
  VoteStatus,
} from "types/proposal";
import { parseToLosslessJson } from "utils/passToLosslessJson";
import * as StellarXdr from "utils/stellarXdr";
import { getIpfsBasicLink } from "utils/ipfsFunctions";
import { getStellarExpertUrl } from "utils/urls";
import { winningOutcome } from "utils/proposalOutcomes";
import { getContractFunctions } from "@service/ContractIntrospectionService";
import "react18-json-view/src/style.css";

const OUTCOME_TYPES = ["approved", "rejected", "cancelled"] as const;
const OUTCOME_FALLBACK_MESSAGE =
  "No outcome data available or IPFS content could not be loaded.";

function hasUsableOutcomeContent(
  detail: ProposalOutcome[keyof ProposalOutcome] | undefined,
): detail is NonNullable<ProposalOutcome[keyof ProposalOutcome]> {
  if (!detail) return false;
  return !!(
    (detail.description && detail.description.trim()) ||
    detail.contract ||
    (detail.xdr && detail.xdr.trim())
  );
}

interface ProposalDetailProps {
  ipfsLink: string | null;
  description: string;
  outcome: ProposalOutcome | null;
  voteStatus?: VoteStatus | undefined;
  status?: string;
}

const ProposalDetail: React.FC<ProposalDetailProps> = ({
  ipfsLink,
  description,
  outcome,
  voteStatus,
  status,
}) => {
  const [isReady, setIsReady] = useState(false);

  const executedType = useMemo(() => {
    if (
      status === "approved" ||
      status === "rejected" ||
      status === "cancelled"
    ) {
      return status;
    }

    return voteStatus ? winningOutcome(voteStatus) : null;
  }, [voteStatus, status]);

  useEffect(() => {
    const init = async () => {
      await StellarXdr.initialize();
      setIsReady(true);
    };

    init();
  }, []);
  const canHighlightOutcome =
    status === "approved" || status === "rejected" || status === "cancelled";

  return (
    <>
      <Card>
        <CardHeader
          title="Description"
          action={
            ipfsLink && (
              <a
                href={getIpfsBasicLink(ipfsLink)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-small font-semibold text-link underline-offset-2 hover:underline"
              >
                View on IPFS
              </a>
            )
          }
        />
        {description ? (
          <Markdown baseUrl={ipfsLink ? getIpfsBasicLink(ipfsLink) : undefined}>
            {description}
          </Markdown>
        ) : (
          <p className="text-ink-muted">
            No description available or IPFS content could not be loaded.
          </p>
        )}
      </Card>
      <Card>
        <CardHeader
          title="Outcomes"
          action={
            <span className="text-small text-ink-muted">
              What execution does
            </span>
          }
        />
        <div className="flex flex-col gap-3">
          {!outcome ||
          !OUTCOME_TYPES.some((type) =>
            hasUsableOutcomeContent(outcome[type]),
          ) ? (
            <p className="text-ink-muted">{OUTCOME_FALLBACK_MESSAGE}</p>
          ) : (
            OUTCOME_TYPES.map((type) => {
              const detail = outcome[type];
              return hasUsableOutcomeContent(detail) ? (
                <OutcomeDetail
                  key={type}
                  type={type}
                  detail={detail}
                  isXdrInit={isReady}
                  isExecuted={canHighlightOutcome && executedType === type}
                />
              ) : null;
            })
          )}
        </div>
      </Card>
    </>
  );
};

export default ProposalDetail;

const OutcomeDetail: React.FC<{
  type: string;
  detail: { description: string; xdr?: string; contract?: OutcomeContract };
  isXdrInit: boolean;
  isExecuted?: boolean;
}> = ({ type, detail, isXdrInit, isExecuted }) => {
  const [content, setContent] = useState<any>(null);
  const [showModal, setShowModal] = useState(false);
  const [paramNames, setParamNames] = useState<string[] | null>(null);

  const formatContractValue = (arg: unknown): string => {
    if (typeof arg === "string") {
      return arg;
    }

    try {
      return JSON.stringify(arg);
    } catch {
      return String(arg);
    }
  };

  const getDisplayArgValue = (arg: unknown): unknown => {
    if (arg && typeof arg === "object" && "value" in arg) {
      return (arg as { value: unknown }).value;
    }

    return arg;
  };

  const getArgLabel = (index: number): string => {
    if (paramNames && paramNames[index]) {
      return paramNames[index];
    }

    return `Arg ${index + 1}`;
  };

  const getContentFromXdr = async (_xdr: string) => {
    try {
      if (!isXdrInit) {
        return;
      }

      if (_xdr) {
        const decoded = StellarXdr.decode("TransactionEnvelope", _xdr);
        setContent(parseToLosslessJson(decoded));
      }
    } catch (error) {
      console.error("Error decoding XDR:", error);
    }
  };

  useEffect(() => {
    if (detail.xdr) {
      getContentFromXdr(detail.xdr);
    }
  }, [detail, isXdrInit]);

  useEffect(() => {
    const loadParamNames = async () => {
      if (
        !detail.contract?.address ||
        !detail.contract.execute_fn ||
        !StrKey.isValidContract(detail.contract.address)
      ) {
        setParamNames(null);
        return;
      }

      try {
        const functions = await getContractFunctions(detail.contract.address);
        const match = functions.find(
          (func) => func.name === detail.contract?.execute_fn,
        );
        if (!match) {
          setParamNames(null);
          return;
        }

        setParamNames(
          match.inputs.map((input, index) =>
            input.name ? input.name : `Arg ${index + 1}`,
          ),
        );
      } catch {
        setParamNames(null);
      }
    };

    loadParamNames();
  }, [detail.contract?.address, detail.contract?.execute_fn]);

  const renderActionButton = () => {
    if (detail.contract) {
      return (
        <ButtonLink
          tone="secondary"
          size="sm"
          href={getStellarExpertUrl(detail.contract.address, "contract")}
          target="_blank"
          rel="noopener noreferrer"
        >
          View contract
        </ButtonLink>
      );
    }

    if (content) {
      return (
        <Button tone="secondary" size="sm" onClick={() => setShowModal(true)}>
          View XDR
        </Button>
      );
    }

    return null;
  };

  const renderModalContent = () => {
    if (detail.contract) {
      return (
        <div className="space-y-4">
          <h3 className="text-card font-semibold">
            Contract Execution Details
          </h3>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-small text-ink-muted">
                Contract Address
              </label>
              <p className="rounded-control bg-sunken p-2 font-mono text-small break-all">
                {detail.contract.address}
              </p>
            </div>
            <div>
              <label className="mb-1 block text-small text-ink-muted">
                Function Name
              </label>
              <p className="rounded-control bg-sunken p-2 font-mono text-small">
                {detail.contract.execute_fn}
              </p>
            </div>
            {detail.contract.args && detail.contract.args.length > 0 && (
              <div>
                <label className="mb-1 block text-small text-ink-muted">
                  Arguments
                </label>
                <div className="space-y-1 rounded-control bg-sunken p-2 text-small">
                  {detail.contract.args.map((arg, index) => (
                    <div key={index} className="flex items-start gap-3">
                      <span className="font-semibold">
                        {getArgLabel(index)}:
                      </span>
                      <span className="font-mono break-all text-ink-muted">
                        {formatContractValue(getDisplayArgValue(arg))}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      );
    }

    if (content) {
      return (
        <div className="max-h-[75vh] overflow-y-auto">
          <JsonView src={content} theme="vscode" />
        </div>
      );
    }

    return null;
  };
  const dot =
    type === "approved"
      ? "bg-vote-approve"
      : type === "rejected"
        ? "bg-vote-reject"
        : "bg-vote-abstain";

  return (
    <div
      className={`flex flex-col gap-3 rounded-control border p-4 ${
        isExecuted ? "border-accent bg-accent-soft" : "border-line"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span aria-hidden="true" className={`size-2 rounded-full ${dot}`} />
        <p className="font-semibold">If {type}</p>
        {isExecuted && <Badge tone="accent">Executed outcome</Badge>}
      </div>
      <p>{detail.description}</p>
      {detail.contract?.address?.trim() && (
        <div className="space-y-2">
          <div>
            <p className="text-small text-ink-muted">Contract Address</p>
            <p className="font-mono text-small break-all">
              {detail.contract.address}
            </p>
          </div>
          {detail.contract.execute_fn?.trim() ? (
            <div>
              <p className="text-small text-ink-muted">Function Call</p>
              <p className="font-mono text-small">
                {detail.contract.execute_fn}()
              </p>
              {detail.contract.args && detail.contract.args.length > 0 && (
                <div className="mt-2 space-y-1">
                  <p className="text-small text-ink-muted">Parameters</p>
                  <div className="space-y-1 rounded-control bg-sunken p-2 text-small">
                    {detail.contract.args.map((arg, index) => (
                      <div
                        key={index}
                        className="flex justify-between items-start gap-3"
                      >
                        <span className="font-semibold">
                          {getArgLabel(index)}
                        </span>
                        <span className="font-mono break-all text-right text-ink-muted">
                          {formatContractValue(getDisplayArgValue(arg))}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-small text-ink-muted">(Function not selected)</p>
          )}
        </div>
      )}
      {detail.xdr && (
        <p className="text-small text-ink-muted">XDR-based execution</p>
      )}
      {renderActionButton() && (
        <div className="flex">{renderActionButton()}</div>
      )}
      {showModal && (
        <Modal onClose={() => setShowModal(false)}>
          {renderModalContent()}
        </Modal>
      )}
    </div>
  );
};
