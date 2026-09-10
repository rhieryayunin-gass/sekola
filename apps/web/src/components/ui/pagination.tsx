import { Button } from "./button";

export function Pagination({ page, count, pageSize = 50, pending, onPage }: { page: number; count: number; pageSize?: number; pending?: boolean; onPage: (page: number) => void }) {
  return <nav aria-label="Pagination" className="mt-4 flex items-center justify-between gap-3">
    <Button size="sm" variant="ghost" disabled={page <= 1 || pending} onClick={() => onPage(page - 1)}>Previous</Button>
    <span className="text-sm text-muted">Page {page}</span>
    <Button size="sm" variant="ghost" disabled={count < pageSize || pending} onClick={() => onPage(page + 1)}>Next</Button>
  </nav>;
}
