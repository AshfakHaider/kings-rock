"use client";

import { useId } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type ChartBar = { key: string; color: string; name: string };
type ChartLayout = "vertical" | "horizontal";

function compactNumber(value: number | string) {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number)) return "0";
  return new Intl.NumberFormat("en", {
    notation: Math.abs(number) >= 1000 ? "compact" : "standard",
    maximumFractionDigits: 1
  }).format(number);
}

function truncateLabel(value: unknown, limit = 18) {
  const text = String(value ?? "");
  return text.length > limit ? `${text.slice(0, limit - 1)}...` : text;
}

function hasChartData(data: Record<string, unknown>[], bars: ChartBar[]) {
  return data.some((row) => bars.some((bar) => Number(row[bar.key] ?? 0) > 0));
}

function CustomTooltip({
  active,
  payload,
  label
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg border border-border/70 bg-card/95 p-3 text-sm shadow-2xl backdrop-blur">
      <p className="mb-2 font-semibold text-foreground">{label}</p>
      <div className="space-y-1">
        {payload.map((item) => (
          <div key={item.name} className="flex items-center justify-between gap-6">
            <span className="flex items-center gap-2 text-muted-foreground">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: item.color }} />
              {item.name}
            </span>
            <strong>{Number(item.value).toLocaleString()}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

export function BarMetricChart({
  title,
  data,
  xKey,
  bars,
  layout = "vertical",
  className
}: {
  title: string;
  data: Record<string, unknown>[];
  xKey: string;
  bars: ChartBar[];
  layout?: ChartLayout;
  className?: string;
}) {
  const rawChartId = useId();
  const chartId = rawChartId.replace(/:/g, "");
  const hasData = hasChartData(data, bars);
  const isHorizontal = layout === "horizontal";
  const chartHeight = isHorizontal ? Math.max(276, Math.min(480, data.length * 46 + 92)) : 288;
  const singleSeries = bars.length === 1;

  return (
    <Card
      className={cn(
        "chart-panel group relative overflow-hidden border-border/70 bg-card/90 shadow-[0_18px_60px_rgba(0,0,0,0.18)]",
        className
      )}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/70 to-transparent" />
      <CardHeader className="relative flex-row flex-wrap items-start justify-between gap-3 pb-3">
        <CardTitle className="text-base leading-tight sm:text-lg">{title}</CardTitle>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {bars.map((bar) => (
            <span
              key={bar.key}
              className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background/55 px-2.5 py-1 text-xs font-medium text-muted-foreground"
            >
              <span className="h-2.5 w-2.5 rounded-full shadow-sm" style={{ background: bar.color }} />
              {bar.name}
            </span>
          ))}
        </div>
      </CardHeader>
      <CardContent className="relative" style={{ height: chartHeight }}>
        {!hasData ? (
          <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-border/80 bg-background/35 text-sm text-muted-foreground">
            No chart data yet
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              layout={isHorizontal ? "vertical" : "horizontal"}
              margin={isHorizontal ? { top: 8, right: 34, left: 12, bottom: 6 } : { top: 8, right: 10, left: -8, bottom: 0 }}
              barCategoryGap={isHorizontal ? "24%" : "20%"}
              barGap={6}
            >
              <defs>
                {bars.map((bar) => (
                  <linearGradient key={bar.key} id={`gradient-${chartId}-${bar.key}`} x1="0" x2={isHorizontal ? "1" : "0"} y1="0" y2="1">
                    <stop offset="0%" stopColor={bar.color} stopOpacity={0.98} />
                    <stop offset="55%" stopColor={bar.color} stopOpacity={0.82} />
                    <stop offset="100%" stopColor={bar.color} stopOpacity={0.45} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid
                strokeDasharray="3 8"
                horizontal={!isHorizontal}
                vertical={isHorizontal}
                stroke="hsl(var(--border))"
                strokeOpacity={0.72}
              />
              {isHorizontal ? (
                <>
                  <XAxis
                    type="number"
                    tickLine={false}
                    axisLine={false}
                    fontSize={12}
                    tickFormatter={compactNumber}
                    stroke="hsl(var(--muted-foreground))"
                  />
                  <YAxis
                    dataKey={xKey}
                    type="category"
                    tickLine={false}
                    axisLine={false}
                    width={112}
                    fontSize={12}
                    tickFormatter={(value) => truncateLabel(value, 16)}
                    stroke="hsl(var(--muted-foreground))"
                  />
                </>
              ) : (
                <>
                  <XAxis
                    dataKey={xKey}
                    tickLine={false}
                    axisLine={false}
                    interval={0}
                    minTickGap={6}
                    fontSize={12}
                    tickFormatter={(value) => truncateLabel(value, 12)}
                    stroke="hsl(var(--muted-foreground))"
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    fontSize={12}
                    tickFormatter={compactNumber}
                    stroke="hsl(var(--muted-foreground))"
                  />
                </>
              )}
              <Tooltip content={<CustomTooltip />} cursor={{ fill: "hsl(var(--muted))", opacity: 0.28 }} />
              {bars.map((bar, index) => (
                <Bar
                  key={bar.key}
                  dataKey={bar.key}
                  name={bar.name}
                  fill={`url(#gradient-${chartId}-${bar.key})`}
                  radius={isHorizontal ? [0, 10, 10, 0] : [10, 10, 3, 3]}
                  maxBarSize={isHorizontal ? 24 : 38}
                  opacity={index === 0 ? 1 : 0.9}
                >
                  {isHorizontal && singleSeries ? (
                    <LabelList
                      dataKey={bar.key}
                      position="right"
                      formatter={compactNumber}
                      className="fill-muted-foreground text-[11px] font-semibold"
                    />
                  ) : null}
                </Bar>
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
