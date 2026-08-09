"use client";

import dynamic from "next/dynamic";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type BarMetricChartProps = {
  title: string;
  data: Record<string, unknown>[];
  xKey: string;
  bars: { key: string; color: string; name: string }[];
  layout?: "vertical" | "horizontal";
  className?: string;
};

const LazyBarMetricChart = dynamic(
  () => import("@/components/modules/charts").then((mod) => mod.BarMetricChart),
  {
    ssr: false,
    loading: () => (
      <Card className="glass-panel overflow-hidden">
        <CardHeader>
          <CardTitle className="h-5 w-40 rounded bg-muted" />
        </CardHeader>
        <CardContent className="h-72">
          <div className="h-full w-full animate-pulse rounded-md bg-muted" />
        </CardContent>
      </Card>
    )
  }
);

export function DeferredBarMetricChart(props: BarMetricChartProps) {
  return <LazyBarMetricChart {...props} />;
}
