export default function PaginationControls({ pagination, isFetching, onPrevious, onNext }) {
  return (
    <div
      className="row-actions"
      style={{ justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}
    >
      <span className="muted">
        {pagination.from && pagination.to
          ? `Showing ${pagination.from}-${pagination.to} of ${pagination.total}`
          : `Page ${pagination.current_page || 1} of ${pagination.last_page || 1}`}
      </span>

      <div className="row-actions compact">
        <button onClick={onPrevious} disabled={isFetching || !pagination.has_prev_page}>
          Previous
        </button>

        <button onClick={onNext} disabled={isFetching || !pagination.has_next_page}>
          Next
        </button>
      </div>
    </div>
  );
}

