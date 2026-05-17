"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
    <div className="rounded-lg border bg-card/95 p-3 text-sm shadow-xl backdrop-blur">
      <p className="mb-2 font-medium">{label}</p>
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
  bars
}: {
  title: string;
  data: Record<string, unknown>[];
  xKey: string;
  bars: { key: string; color: string; name: string }[];
}) {
  return (
    <Card className="glass-panel overflow-hidden">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base">{title}</CardTitle>
        <div className="flex items-center gap-2">
          {bars.map((bar) => (
            <span key={bar.key} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: bar.color }} />
              {bar.name}
            </span>
          ))}
        </div>
      </CardHeader>
      <CardContent className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
            <defs>
              {bars.map((bar) => (
                <linearGradient key={bar.key} id={`gradient-${bar.key}`} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor={bar.color} stopOpacity={0.95} />
                  <stop offset="100%" stopColor={bar.color} stopOpacity={0.45} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="4 6" vertical={false} stroke="hsl(var(--border))" />
            <XAxis
              dataKey={xKey}
              tickLine={false}
              axisLine={false}
              fontSize={12}
              stroke="hsl(var(--muted-foreground))"
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              fontSize={12}
              stroke="hsl(var(--muted-foreground))"
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: "hsl(var(--muted))", opacity: 0.45 }} />
            {bars.map((bar, index) => (
              <Bar
                key={bar.key}
                dataKey={bar.key}
                name={bar.name}
                fill={`url(#gradient-${bar.key})`}
                radius={[8, 8, 2, 2]}
                maxBarSize={42}
                opacity={index === 0 ? 1 : 0.86}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
