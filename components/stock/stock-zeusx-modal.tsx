"use client";

import { useState, useTransition } from "react";
import { ExternalLink, Globe2, X } from "lucide-react";
import { saveStockZeusxSettings } from "@/app/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NoticeToast } from "@/components/ui/notice-toast";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  DEFAULT_ZEUSX_CATEGORY,
  DEFAULT_ZEUSX_DELIVERY_DAYS,
  DEFAULT_ZEUSX_DELIVERY_HOURS,
  DEFAULT_ZEUSX_DELIVERY_METHOD,
  defaultZeusxDescription,
  defaultZeusxServer,
  formatZeusxTags,
  ZEUSX_STATUS_VALUES
} from "@/lib/zeusx";
import type { StockAccount } from "@/lib/types";

function zeusxStatusLabel(status: string | null | undefined) {
  if (!status) return "Not queued";
  return status.replaceAll("_", " ");
}

export function ZeusxStatusBadge({ account }: { account: Pick<StockAccount, "zeusx_enabled" | "zeusx_status"> }) {
  if (!account.zeusx_enabled) {
    return <Badge variant="secondary">ZeusX off</Badge>;
  }

  const status = account.zeusx_status ?? "pending";
  const variant = status === "posted" ? "success" : status === "failed" ? "destructive" : status === "posting" ? "warning" : "default";
  return <Badge variant={variant}>ZeusX {zeusxStatusLabel(status)}</Badge>;
}

export function StockZeusxModal({ stock }: { stock: StockAccount }) {
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(Boolean(stock.zeusx_enabled));
  const [pending, startTransition] = useTransition();
  const defaultDescription = defaultZeusxDescription(stock);

  function submit(formData: FormData) {
    startTransition(async () => {
      try {
        const result = await saveStockZeusxSettings(formData);
        if (!result.ok) {
          setNotice(result.message ?? "ZeusX settings could not be saved.");
          return;
        }
        setOpen(false);
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "ZeusX settings could not be saved.");
      }
    });
  }

  return (
    <>
      <Button
        type="button"
        size="icon"
        variant="outline"
        onClick={() => setOpen(true)}
        aria-label="Manage ZeusX posting"
        title="Manage ZeusX posting"
      >
        <Globe2 className="h-4 w-4" />
      </Button>

      {open ? (
        <div className="fixed inset-0 z-[70] flex items-end bg-black/55 p-0 backdrop-blur-sm sm:items-center sm:justify-center sm:p-4">
          <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-lg border bg-card shadow-2xl sm:max-w-2xl sm:rounded-lg">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-card/95 px-4 py-3 backdrop-blur">
              <div>
                <h2 className="text-lg font-semibold">ZeusX posting</h2>
                <p className="text-sm text-muted-foreground">Queue this stock account for the external ZeusX worker.</p>
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Close">
                <X className="h-4 w-4" />
              </Button>
            </div>

            <form action={submit} className="grid gap-4 p-4 sm:grid-cols-2">
              <input type="hidden" name="id" value={stock.id} />

              <div className="flex items-center gap-3 rounded-md border bg-muted/20 p-3 sm:col-span-2">
                <input
                  id={`zeusx_enabled_${stock.id}`}
                  name="zeusx_enabled"
                  type="checkbox"
                  checked={enabled}
                  onChange={(event) => setEnabled(event.currentTarget.checked)}
                  className="h-4 w-4 accent-primary"
                />
                <Label htmlFor={`zeusx_enabled_${stock.id}`} className="cursor-pointer">
                  Enable ZeusX posting for this account
                </Label>
              </div>

              <div className="space-y-2">
                <Label htmlFor={`zeusx_status_${stock.id}`}>Posting status</Label>
                <Select id={`zeusx_status_${stock.id}`} name="zeusx_status" defaultValue={stock.zeusx_status ?? "pending"} disabled={!enabled}>
                  {ZEUSX_STATUS_VALUES.map((status) => (
                    <option key={status} value={status}>
                      {zeusxStatusLabel(status)}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor={`zeusx_category_${stock.id}`}>Category</Label>
                <Input id={`zeusx_category_${stock.id}`} name="zeusx_category" defaultValue={stock.zeusx_category ?? DEFAULT_ZEUSX_CATEGORY} disabled={!enabled} />
              </div>

              <div className="space-y-2">
                <Label htmlFor={`zeusx_game_${stock.id}`}>Game</Label>
                <Input id={`zeusx_game_${stock.id}`} name="zeusx_game" defaultValue={stock.zeusx_game ?? stock.game_name} disabled={!enabled} />
              </div>

              <div className="space-y-2">
                <Label htmlFor={`zeusx_server_${stock.id}`}>Server</Label>
                <Input id={`zeusx_server_${stock.id}`} name="zeusx_server" defaultValue={stock.zeusx_server ?? defaultZeusxServer(stock.game_name)} disabled={!enabled} />
              </div>

              <div className="space-y-2">
                <Label htmlFor={`zeusx_delivery_method_${stock.id}`}>Delivery method</Label>
                <Input id={`zeusx_delivery_method_${stock.id}`} name="zeusx_delivery_method" defaultValue={stock.zeusx_delivery_method ?? DEFAULT_ZEUSX_DELIVERY_METHOD} disabled={!enabled} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor={`zeusx_delivery_days_${stock.id}`}>Days</Label>
                  <Input id={`zeusx_delivery_days_${stock.id}`} name="zeusx_delivery_days" type="number" min="0" step="1" defaultValue={stock.zeusx_delivery_days ?? DEFAULT_ZEUSX_DELIVERY_DAYS} disabled={!enabled} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`zeusx_delivery_hours_${stock.id}`}>Hours</Label>
                  <Input id={`zeusx_delivery_hours_${stock.id}`} name="zeusx_delivery_hours" type="number" min="0" step="1" defaultValue={stock.zeusx_delivery_hours ?? DEFAULT_ZEUSX_DELIVERY_HOURS} disabled={!enabled} />
                </div>
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor={`zeusx_tags_${stock.id}`}>Tags</Label>
                <Input id={`zeusx_tags_${stock.id}`} name="zeusx_tags" placeholder="epic, max emblem, limited skins" defaultValue={formatZeusxTags(stock.zeusx_tags)} disabled={!enabled} />
                <p className="text-xs text-muted-foreground">Separate tags with commas.</p>
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor={`zeusx_description_${stock.id}`}>Description</Label>
                <Textarea id={`zeusx_description_${stock.id}`} name="zeusx_description" rows={8} defaultValue={stock.zeusx_description ?? defaultDescription} disabled={!enabled} />
              </div>

              {stock.zeusx_listing_url ? (
                <a
                  href={stock.zeusx_listing_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-primary hover:underline sm:col-span-2"
                >
                  <ExternalLink className="h-4 w-4" />
                  View ZeusX listing
                </a>
              ) : null}

              {stock.zeusx_error ? (
                <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200 sm:col-span-2">
                  {stock.zeusx_error}
                </div>
              ) : null}

              <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:col-span-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button disabled={pending}>{pending ? "Saving..." : enabled ? "Save ZeusX queue" : "Save disabled"}</Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <NoticeToast message={notice} onClose={() => setNotice(null)} />
    </>
  );
}
