import { PageContainer } from "@/components/layout/page";

export default function SquadLoading() {
  return (
    <PageContainer width="wide" aria-busy="true" aria-label="Loading Coach Workspace">
      <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="h-4 w-20 animate-pulse rounded bg-green-100" />
          <div className="mt-3 h-9 w-72 animate-pulse rounded bg-slate-200" />
          <div className="mt-3 h-4 max-w-2xl animate-pulse rounded bg-slate-200" />
        </div>
        <div className="flex gap-2">
          <div className="h-10 w-36 animate-pulse rounded bg-slate-200" />
          <div className="h-10 w-28 animate-pulse rounded bg-slate-200" />
        </div>
      </section>
      <section className="rounded-lg border border-board-line bg-white p-3 shadow-soft">
        <div className="flex gap-2 overflow-hidden">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-9 w-28 shrink-0 animate-pulse rounded bg-slate-100" />
          ))}
        </div>
      </section>
      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="rounded-lg border border-board-line bg-white shadow-soft">
          <div className="border-b border-board-line bg-slate-50 p-4">
            <div className="h-4 w-48 animate-pulse rounded bg-slate-200" />
          </div>
          <div className="divide-y divide-board-line">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="grid grid-cols-5 gap-4 p-4">
                {Array.from({ length: 5 }).map((__, cell) => (
                  <div key={cell} className="h-4 animate-pulse rounded bg-slate-100" />
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="hidden rounded-lg border border-board-line bg-white p-5 shadow-soft xl:block">
          <div className="h-6 w-40 animate-pulse rounded bg-slate-200" />
          <div className="mt-5 space-y-3">
            <div className="h-20 animate-pulse rounded bg-slate-100" />
            <div className="h-20 animate-pulse rounded bg-slate-100" />
            <div className="h-20 animate-pulse rounded bg-slate-100" />
          </div>
        </div>
      </section>
    </PageContainer>
  );
}
