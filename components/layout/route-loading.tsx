import { PageContainer } from "@/components/layout/page";
import { cn } from "@/lib/utils";

function Skeleton({ className }: { className: string }) {
  return <div className={cn("animate-pulse rounded bg-slate-200", className)} />;
}

export function RouteHeaderSkeleton({ actions = 2 }: { actions?: number }) {
  return (
    <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        <Skeleton className="h-4 w-28 bg-green-100" />
        <Skeleton className="mt-3 h-10 w-80 max-w-full" />
        <Skeleton className="mt-3 h-4 w-full max-w-3xl" />
      </div>
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: actions }).map((_, index) => (
          <Skeleton key={index} className="h-10 w-36" />
        ))}
      </div>
    </section>
  );
}

export function MetricGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="rounded-lg border border-board-line bg-white p-4 shadow-soft">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-3 h-8 w-16" />
          <Skeleton className="mt-3 h-3 w-32" />
        </div>
      ))}
    </section>
  );
}

export function TabsSkeleton({ count = 6 }: { count?: number }) {
  return (
    <section className="flex gap-2 overflow-hidden rounded-lg border border-board-line bg-white p-2 shadow-soft">
      {Array.from({ length: count }).map((_, index) => (
        <Skeleton key={index} className="h-9 w-28 shrink-0" />
      ))}
    </section>
  );
}

export function CardListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <section className="space-y-3">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="rounded-lg border border-board-line bg-white p-4 shadow-soft">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0 flex-1">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="mt-3 h-6 w-72 max-w-full" />
              <Skeleton className="mt-3 h-4 w-full max-w-2xl" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-9 w-24" />
              <Skeleton className="h-9 w-24" />
            </div>
          </div>
        </div>
      ))}
    </section>
  );
}

export function TableSkeleton({ rows = 8, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <section className="overflow-hidden rounded-lg border border-board-line bg-white shadow-soft">
      <div className="border-b border-board-line bg-slate-50 p-4">
        <Skeleton className="h-4 w-48" />
      </div>
      <div className="divide-y divide-board-line">
        {Array.from({ length: rows }).map((_, row) => (
          <div key={row} className="grid gap-4 p-4" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
            {Array.from({ length: columns }).map((__, column) => (
              <Skeleton key={column} className="h-4" />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

export function DashboardSkeleton() {
  return (
    <PageContainer width="wide" className="space-y-8" aria-busy="true">
      <RouteHeaderSkeleton actions={5} />
      <div className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
        <Skeleton className="h-4 w-32 bg-green-100" />
        <Skeleton className="mt-3 h-8 w-80 max-w-full" />
        <Skeleton className="mt-3 h-4 w-full max-w-xl" />
      </div>
      <MetricGridSkeleton />
      <div className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
        <Skeleton className="h-6 w-52" />
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="rounded-md border border-board-line bg-slate-50 p-4">
              <Skeleton className="h-5 w-20" />
              <Skeleton className="mt-4 h-5 w-44" />
              <Skeleton className="mt-3 h-4 w-full" />
            </div>
          ))}
        </div>
      </div>
      <section className="grid gap-6 lg:grid-cols-2">
        <TableSkeleton rows={4} columns={3} />
        <TableSkeleton rows={4} columns={3} />
      </section>
    </PageContainer>
  );
}

export function TrainingsSkeleton() {
  return (
    <PageContainer width="wide" aria-busy="true">
      <RouteHeaderSkeleton actions={1} />
      <MetricGridSkeleton />
      <TabsSkeleton count={7} />
      <CardListSkeleton count={6} />
    </PageContainer>
  );
}

export function GenericRouteSkeleton({ cards = 4, actions = 2 }: { cards?: number; actions?: number }) {
  return (
    <PageContainer width="wide" aria-busy="true">
      <RouteHeaderSkeleton actions={actions} />
      <MetricGridSkeleton />
      <CardListSkeleton count={cards} />
    </PageContainer>
  );
}

export function DetailRouteSkeleton() {
  return (
    <PageContainer width="wide" aria-busy="true">
      <RouteHeaderSkeleton actions={3} />
      <TabsSkeleton count={5} />
      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <CardListSkeleton count={3} />
        <TableSkeleton rows={5} columns={2} />
      </section>
    </PageContainer>
  );
}
