import Button from "components/utils/Button";
import Modal, { type ModalProps } from "components/utils/Modal";
import Title from "components/utils/Title";
import { buildDecodedVotesCsv } from "utils/anonymousVotingCsv";
import type { DecodedVote } from "utils/anonymousVoting";

interface Props extends ModalProps {
  decodedVotes: DecodedVote[];
  fileNameBase: string;
}

const ExportDecodedVotesModal: React.FC<Props> = ({
  decodedVotes,
  fileNameBase,
  onClose,
}) => {
  const handleExport = () => {
    const csv = buildDecodedVotesCsv(decodedVotes);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${fileNameBase || "decoded-votes"}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    onClose();
  };

  return (
    <Modal onClose={onClose}>
      <div className="flex flex-col gap-6 sm:gap-[30px] max-w-2xl">
        <Title
          title="Export decoded votes"
          description="This exports the decrypted ballot rows as a CSV file."
        />

        <div className="rounded-lg border border-red-200 bg-red-50 p-4 sm:p-5 text-sm sm:text-base text-primary">
          <p className="font-medium text-red-700">Privacy warning</p>
          <p className="mt-2 leading-6">
            Decoded votes reveal who voted for what. If this file is shared
            online, forwarded, or leaked, the voter privacy assumption is lost.
          </p>
          <p className="mt-2 leading-6">
            Only export this file if you can assume the responsibility of
            keeping voters' information private.
          </p>
        </div>

        <div className="flex flex-col gap-2 text-sm text-secondary">
          <p>Rows to export: {decodedVotes.length}</p>
        </div>

        <div className="flex flex-col sm:flex-row justify-end gap-3 sm:gap-[18px]">
          <Button type="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleExport}>Export CSV</Button>
        </div>
      </div>
    </Modal>
  );
};

export default ExportDecodedVotesModal;
