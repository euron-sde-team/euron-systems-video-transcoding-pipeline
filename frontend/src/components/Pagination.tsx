import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationProps {
  page: number;
  limit: number;
  total: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, limit, total, onPageChange }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  if (totalPages <= 1) return null;

  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(total, page * limit);

  const btn =
    "flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm text-gray-300 hover:bg-bg-raised disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div className="flex items-center justify-between pt-2">
      <span className="text-sm text-gray-500">
        {from}-{to} of {total}
      </span>
      <div className="flex items-center gap-2">
        <button className={btn} disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          <ChevronLeft className="h-4 w-4" /> Prev
        </button>
        <span className="text-sm text-gray-400 tabular-nums">
          {page} / {totalPages}
        </span>
        <button
          className={btn}
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
