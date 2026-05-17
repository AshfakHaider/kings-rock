"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CsvExport({
  rows,
  filename
}: {
  rows: Record<string, unknown>[];
  filename: string;
}) {
  function download() {
    const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
    const csv = [
      headers.join(","),
      ...rows.map((row) =>
        headers
          .map((header) => `"${String(row[header] ?? "").replaceAll('"', '""')}"`)
          .join(",")
      )
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Button type="button" variant="outline" onClick={download} disabled={rows.length === 0}>
      <Download className="h-4 w-4" />
      CSV
    </Button>
  );
}
