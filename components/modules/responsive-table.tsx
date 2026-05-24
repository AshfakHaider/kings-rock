import type React from "react";
import { Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type Column<T> = {
  key: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  searchValue?: (row: T) => string;
};

export function ResponsiveTable<T>({
  rows,
  columns,
  searchQuery = "",
  searchPlaceholder = "Search records...",
  emptyTitle = "No records",
  emptyDescription = "Create a new record to get started.",
  page = 1,
  pageSize = 50,
  pageParam = "page",
  additionalQuery = {},
  paginate = true,
  serverSide = false,
  totalRows,
  className
}: {
  rows: T[];
  columns: Column<T>[];
  searchQuery?: string;
  searchPlaceholder?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  page?: number;
  pageSize?: number;
  pageParam?: string;
  additionalQuery?: Record<string, string | number | undefined | null>;
  paginate?: boolean;
  serverSide?: boolean;
  totalRows?: number;
  className?: string;
}) {
  const q = searchQuery.trim().toLowerCase();
  const visibleRows = serverSide
    ? rows
    : q
    ? rows.filter((row) =>
        columns.some((column) =>
          (column.searchValue?.(row) ?? "")
            .toLowerCase()
            .includes(q)
        )
      )
    : rows;
  const resultCount = serverSide ? (totalRows ?? rows.length) : visibleRows.length;
  const totalPages = paginate ? Math.max(1, Math.ceil(resultCount / pageSize)) : 1;
  const currentPage = paginate ? Math.min(Math.max(1, Number.isFinite(page) ? Math.trunc(page) : 1), totalPages) : 1;
  const start = paginate ? (currentPage - 1) * pageSize : 0;
  const pagedRows = serverSide ? visibleRows : paginate ? visibleRows.slice(start, start + pageSize) : visibleRows;

  function pageHref(nextPage: number) {
    const params = new URLSearchParams();

    for (const [key, value] of Object.entries(additionalQuery)) {
      if (key === pageParam || key === "q") continue;
      if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
    }

    if (searchQuery) params.set("q", searchQuery);
    if (nextPage > 1) params.set(pageParam, String(nextPage));

    const query = params.toString();
    return query ? `?${query}` : "?";
  }

  return (
    <div className={cn("min-w-0 space-y-4", className)}>
      <form className="flex min-w-0 flex-col gap-2 sm:flex-row">
        {Object.entries(additionalQuery).map(([key, value]) =>
          key !== pageParam && key !== "q" && value !== undefined && value !== null && value !== "" ? (
            <input key={key} type="hidden" name={key} value={String(value)} />
          ) : null
        )}
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="q"
            defaultValue={searchQuery}
            placeholder={searchPlaceholder}
            className="pl-9"
          />
        </div>
        <Button type="submit" variant="outline" className="shrink-0">
          Search
        </Button>
      </form>

      {pagedRows.length === 0 ? (
        <EmptyState title={emptyTitle} description={emptyDescription} />
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-lg border bg-card md:block">
            <table className="w-full min-w-max text-sm">
              <thead className="bg-muted/70 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  {columns.map((column) => (
                    <th key={column.key} className="whitespace-nowrap px-4 py-3 font-semibold">
                      {column.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {pagedRows.map((row, index) => (
                  <tr key={index} className="hover:bg-muted/40">
                    {columns.map((column) => (
                      <td key={column.key} className="max-w-[20rem] px-4 py-3 align-top">
                        {column.cell(row)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid min-w-0 gap-3 md:hidden">
            {pagedRows.map((row, index) => (
              <Card key={index}>
                <CardContent className="min-w-0 space-y-3 p-4">
                  {columns.map((column) => (
                    <div key={column.key} className="grid min-w-0 grid-cols-[6.5rem_minmax(0,1fr)] items-start gap-3">
                      <span className="text-xs font-medium uppercase text-muted-foreground">
                        {column.header}
                      </span>
                      <span className="min-w-0 overflow-hidden text-right text-sm [overflow-wrap:anywhere]">{column.cell(row)}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>

          {paginate && totalPages > 1 ? (
            <div className="flex flex-col gap-3 rounded-lg border bg-card p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
              <p className="text-muted-foreground">
                Showing {start + 1}-{Math.min(start + pageSize, resultCount)} of {resultCount}
              </p>
              <div className="flex items-center justify-end gap-2">
                <Button asChild variant="outline" size="sm" className={currentPage <= 1 ? "pointer-events-none opacity-50" : ""}>
                  <a href={pageHref(currentPage - 1)}>Previous</a>
                </Button>
                <span className="min-w-20 text-center text-xs font-medium uppercase text-muted-foreground">
                  Page {currentPage} / {totalPages}
                </span>
                <Button asChild variant="outline" size="sm" className={currentPage >= totalPages ? "pointer-events-none opacity-50" : ""}>
                  <a href={pageHref(currentPage + 1)}>Next</a>
                </Button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
