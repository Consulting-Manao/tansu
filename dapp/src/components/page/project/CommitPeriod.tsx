import { Button } from "components/ui";
import { formatDate } from "utils/formatTimeFunctions";

/** The period a page of the commit history covers, and the way to others. */
const CommitPeriod = ({
  startDate,
  endDate,
  currentPage,
  onPageChange,
}: {
  startDate: string | undefined;
  endDate: string | undefined;
  currentPage: number;
  onPageChange: (page: number) => void;
}) => (
  <nav
    aria-label="Commit history pages"
    className="flex items-center justify-center gap-3"
  >
    <Button
      tone="ghost"
      disabled={currentPage <= 1}
      onClick={() => onPageChange(currentPage - 1)}
    >
      Newer
    </Button>
    {startDate && endDate && (
      <span className="figures-tabular text-ui text-ink-muted">
        {formatDate(startDate)} – {formatDate(endDate)}
      </span>
    )}
    <Button tone="ghost" onClick={() => onPageChange(currentPage + 1)}>
      Older
    </Button>
  </nav>
);

export default CommitPeriod;
