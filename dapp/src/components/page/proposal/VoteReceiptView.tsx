import { useState } from "react";
import type { LandedUploadError } from "@service/TxService";
import { VOTE_COMMENT_FILE } from "@service/ProposalService";
import type { VoteReceipt } from "types/proposal";
import { getIpfsUrl } from "utils/ipfsFunctions";
import { toast } from "../../../utils/utils";
import { Button, Dialog, LinkButton, Notice } from "components/ui";

/**
 * The receipt of a vote that landed, to keep: an anonymous voter proves
 * their vote with it. A comment whose upload failed is uploaded again here.
 */
const VoteReceiptView = ({
  receipt,
  unuploaded,
  onClose,
}: {
  receipt: VoteReceipt;
  unuploaded: LandedUploadError | undefined;
  onClose: () => void;
}) => {
  const [isDownloading, setIsDownloading] = useState(false);
  const [pending, setPending] = useState(unuploaded);
  const [retrying, setRetrying] = useState(false);

  const retry = async () => {
    if (!pending) return;
    setRetrying(true);
    try {
      await pending.retry();
      setPending(undefined);
      toast.success("Comment uploaded", "Your comment is on IPFS.");
    } catch {
      toast.error("Comment upload", "The upload failed again.");
    } finally {
      setRetrying(false);
    }
  };

  const downloadReceipt = async () => {
    setIsDownloading(true);
    try {
      const { renderVoteReceipt, voteReceiptFileName } =
        await import("./VoteReceiptPdf");
      const pdf = await renderVoteReceipt(receipt);
      const url = URL.createObjectURL(
        new Blob([pdf as BlobPart], { type: "application/pdf" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = voteReceiptFileName(receipt);
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      toast.error(
        "Vote receipt",
        `Could not create the PDF: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <Dialog size="auto" onClose={onClose}>
      <div className="flex flex-col gap-6 w-full max-w-2xl mx-auto">
        <div className="flex flex-col gap-2 border-b pb-4">
          <h2 className="text-section font-bold text-ink">Vote Receipt</h2>
          <p className="text-ui text-ink-muted">
            {receipt.isPublicVoting
              ? "Your vote was public. You can check the transaction hash on a Stellar explorer to verify it is on-chain."
              : "Your vote was anonymous. Keep this receipt safe. You can verify your commitment on-chain using the transaction hash. At the end of the vote, the tally can be checked by verifying all commitments against the encrypted votes."}
          </p>
        </div>

        <div className="flex flex-col gap-4 bg-sunken p-4 rounded-control overflow-x-auto text-ui">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <span className="font-semibold">Project:</span>{" "}
              {receipt.projectName}
            </div>
            <div>
              <span className="font-semibold">Proposal ID:</span>{" "}
              {receipt.proposalId}
            </div>
            <div>
              <span className="font-semibold">Vote Type:</span>{" "}
              <span className="capitalize">{receipt.voteType}</span>
            </div>
            <div>
              <span className="font-semibold">Weight:</span>{" "}
              {receipt.weight.toLocaleString()}
            </div>
            <div>
              <span className="font-semibold">Voting Type:</span>{" "}
              {receipt.isPublicVoting ? "Public" : "Anonymous"}
            </div>
          </div>

          {receipt.comment && (
            <div className="mt-2">
              <span className="font-semibold block mb-1">Comment:</span>
              <a
                href={getIpfsUrl(receipt.comment, `/${VOTE_COMMENT_FILE}`)}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-label text-link underline break-all"
              >
                {receipt.comment}
              </a>
            </div>
          )}

          {receipt.transactionHash && (
            <div className="mt-2">
              <span className="font-semibold block mb-1">
                Transaction Hash:
              </span>
              <code className="bg-surface px-2 py-1 rounded border break-all text-label">
                {receipt.transactionHash}
              </code>
            </div>
          )}

          {!receipt.isPublicVoting && (
            <>
              <div className="mt-2">
                <span className="font-semibold block mb-1">Public Key:</span>
                <code className="bg-surface px-2 py-1 rounded border break-all text-label">
                  {receipt.publicKey}
                </code>
              </div>

              <div className="mt-2">
                <span className="font-semibold block mb-1">
                  Votes (Approve, Reject, Abstain):
                </span>
                <div className="flex flex-col gap-1">
                  {receipt.votes?.map((v, i) => (
                    <code
                      key={i}
                      className="bg-surface px-2 py-1 rounded border break-all text-label"
                    >
                      {v}
                    </code>
                  ))}
                </div>
              </div>

              <div className="mt-2">
                <span className="font-semibold block mb-1">
                  Seeds (Approve, Reject, Abstain):
                </span>
                <div className="flex flex-col gap-1">
                  {receipt.seeds?.map((s, i) => (
                    <code
                      key={i}
                      className="bg-surface px-2 py-1 rounded border break-all text-label"
                    >
                      {s}
                    </code>
                  ))}
                </div>
              </div>

              <div className="mt-2">
                <span className="font-semibold block mb-1">Commitments:</span>
                <div className="flex flex-col gap-1">
                  {receipt.commitments?.map((c, i) => (
                    <code
                      key={i}
                      className="bg-surface px-2 py-1 rounded border break-all text-label"
                    >
                      {c}
                    </code>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {pending && (
          <Notice tone="warning" live>
            Your vote is in, but its comment is not on IPFS yet: the upload
            failed.{" "}
            <LinkButton disabled={retrying} onClick={retry}>
              Try the upload again
            </LinkButton>
          </Notice>
        )}

        <div className="flex justify-end gap-3 mt-4">
          <Button tone="secondary" onClick={onClose}>
            Close
          </Button>
          <Button
            onClick={downloadReceipt}
            loading={isDownloading}
            disabled={isDownloading}
          >
            Download PDF
          </Button>
        </div>
      </div>
    </Dialog>
  );
};

export default VoteReceiptView;
