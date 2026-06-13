import { PageHeader } from "@/components/modules/page-header";

export default function DashboardLoading() {
  return (
    <>
      <PageHeader title="Loading..." description="Preparing your business overview." />
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="h-36 animate-pulse rounded-lg border bg-card shadow-soft">
            <div className="m-6 h-4 w-32 rounded bg-muted" />
            <div className="mx-6 mt-8 h-8 w-24 rounded bg-muted" />
          </div>
        ))}
      </section>
      <section className="grid gap-4 xl:grid-cols-2">
        <div className="h-80 animate-pulse rounded-lg border bg-card shadow-soft" />
        <div className="h-80 animate-pulse rounded-lg border bg-card shadow-soft" />
      </section>
    </>
  );
}
