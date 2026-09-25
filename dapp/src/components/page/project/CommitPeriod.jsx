const CommitPeriod = ({ startDate, endDate, currentPage, onPageChange }) => {
  return (
    <>
      <div className="flex justify-between">
        <div className="px-[18px] flex items-center gap-[18px]">
          <button
            type="button"
            aria-label="Newer commits"
            disabled={currentPage <= 1}
            onClick={() => onPageChange(currentPage - 1)}
          >
            <img alt="" src="/icons/arrow-left.svg" />
          </button>
          <p className="leading-5 text-base lg:text-lg text-primary">
            {startDate} - {endDate}
          </p>
          <button
            type="button"
            aria-label="Older commits"
            onClick={() => onPageChange(currentPage + 1)}
          >
            <img alt="" src="/icons/arrow-right.svg" />
          </button>
        </div>
      </div>
    </>
  );
};

export default CommitPeriod;
