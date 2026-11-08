import cx from "classnames";
import { focusRing } from "./style";

interface PaginationProps {
  totalPage: number;
  currentPage: number;
  onPageChange: (page: number) => void;
}

const Arrow = ({ flip }: { flip?: boolean }) => (
  <svg
    viewBox="0 0 24 24"
    width="18"
    height="18"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className={flip ? "rotate-180" : undefined}
  >
    <path d="M19 12H5M12 19l-7-7 7-7" />
  </svg>
);

const cell =
  "figures-tabular inline-flex size-10 items-center justify-center rounded-control text-ui font-medium text-ink transition-colors hover:bg-sunken disabled:cursor-not-allowed disabled:opacity-40";

/** Pages of a list: the arrows and a window of 15 page numbers. */
export const Pagination = ({
  totalPage,
  currentPage,
  onPageChange,
}: PaginationProps) => {
  const pageWindowSize = 15;
  const halfWindow = Math.floor(pageWindowSize / 2);
  const startPage = Math.max(
    1,
    Math.min(currentPage - halfWindow, totalPage - pageWindowSize + 1),
  );
  const endPage = Math.min(totalPage, startPage + pageWindowSize - 1);
  const pages = Array.from(
    { length: Math.max(0, endPage - startPage + 1) },
    (_, index) => startPage + index,
  );

  return (
    <nav aria-label="Pages" className="flex flex-wrap items-center gap-1">
      <button
        type="button"
        aria-label="Previous page"
        onClick={() => onPageChange(Math.max(1, currentPage - 1))}
        disabled={currentPage === 1}
        className={cx(cell, focusRing)}
      >
        <Arrow />
      </button>
      {pages.map((page) => (
        <button
          key={page}
          type="button"
          aria-current={page === currentPage ? "page" : undefined}
          className={cx(
            cell,
            focusRing,
            page === currentPage &&
              "bg-action text-on-action hover:bg-action-hover",
          )}
          onClick={() => onPageChange(page)}
        >
          {page}
        </button>
      ))}
      <button
        type="button"
        aria-label="Next page"
        onClick={() => onPageChange(Math.min(totalPage, currentPage + 1))}
        disabled={currentPage === totalPage}
        className={cx(cell, focusRing)}
      >
        <Arrow flip />
      </button>
    </nav>
  );
};
