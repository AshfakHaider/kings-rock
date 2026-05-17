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
  className
}: {
  rows: T[];
  columns: Column<T>[];
  searchQuery?: string;
  searchPlaceholder?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  className?: string;
}) {
  const q = searchQuery.trim().toLowerCase();
  const visibleRows = q
    ? rows.filter((row) =>
        columns.some((column) =>
          (column.searchValue?.(row) ?? "")
            .toLowerCase()
            .includes(q)
        )
      )
    : rows;

  return (
    <div className={cn("min-w-0 space-y-4", className)}>
      <form className="flex min-w-0 flex-col gap-2 sm:flex-row">
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

      {visibleRows.length === 0 ? (
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
                {visibleRows.map((row, index) => (
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
            {visibleRows.map((row, index) => (
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
        </>
      )}
    </div>
  );
}
