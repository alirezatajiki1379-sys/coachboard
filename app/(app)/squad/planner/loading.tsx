import { PageContainer, PageHeader } from "@/components/layout/page";
import { SquadNav } from "@/components/squad/squad-nav";
import { cn } from "@/lib/utils";

const skeletonRows = [
  ["LW", "ST", "RW"],
  ["CM", "CM", "CAM"],
  ["LB", "CB", "CB", "RB"],
  ["GK"]
];

export default function SquadPlannerLoading() {
  return (
    <PageContainer width="full">
      <PageHeader
        eyebrow="Squad"
        title="Formation and Depth Planner"
        description="Build tactical plans for the active team, assign starters and manage depth without changing training attendance or session plans."
        metadata="Loading tactical planner..."
      />
      <SquadNav />
      <div className="space-y-5">
        <section className="rounded-lg border border-board-line bg-white p-4 shadow-soft">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-2">
              <div className="h-3 w-40 animate-pulse rounded bg-slate-100" />
              <div className="h-10 w-72 max-w-full animate-pulse rounded-md bg-slate-100" />
              <div className="h-4 w-56 animate-pulse rounded bg-slate-100" />
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="h-10 w-28 animate-pulse rounded-md bg-slate-100" />
              <div className="h-10 w-24 animate-pulse rounded-md bg-slate-100" />
              <div className="h-10 w-24 animate-pulse rounded-md bg-slate-100" />
            </div>
          </div>
        </section>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_410px]">
          <section className="rounded-lg border border-board-line bg-white p-4 shadow-soft">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="h-5 w-36 animate-pulse rounded bg-slate-100" />
                <div className="mt-2 h-4 w-80 max-w-full animate-pulse rounded bg-slate-100" />
              </div>
              <div className="flex gap-2">
                <div className="h-10 w-28 animate-pulse rounded-md bg-slate-100" />
                <div className="h-10 w-24 animate-pulse rounded-md bg-slate-100" />
              </div>
            </div>

            <div
              className={cn(
                "relative mt-4 min-h-[620px] overflow-hidden rounded-xl border border-emerald-950/20 bg-emerald-800 p-4 shadow-inner",
                "bg-[linear-gradient(90deg,rgba(255,255,255,0.045)_50%,transparent_50%)] bg-[length:44px_44px]"
              )}
            >
              <PitchLines />
              <div className="relative z-10 flex min-h-[590px] min-w-[900px] flex-col justify-between gap-4 py-8">
                {skeletonRows.map((row, rowIndex) => (
                  <div
                    key={row.join("-")}
                    className="grid justify-center gap-3"
                    style={{ gridTemplateColumns: `repeat(${row.length}, minmax(11.25rem, 13.75rem))` }}
                  >
                    {row.map((code, index) => (
                      <div key={`${code}-${rowIndex}-${index}`} className="min-h-[5.25rem] rounded-lg border border-white/50 bg-white/75 p-2 shadow-lg">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-black uppercase text-board-green">{code}</span>
                          <span className="h-5 w-5 animate-pulse rounded-full bg-slate-200" />
                        </div>
                        <div className="mt-3 h-4 w-28 animate-pulse rounded bg-slate-200" />
                        <div className="mt-2 h-3 w-20 animate-pulse rounded bg-slate-200/80" />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </section>

          <aside className="space-y-4">
            <section className="rounded-lg border border-board-line bg-white p-4 shadow-soft">
              <div className="h-5 w-32 animate-pulse rounded bg-slate-100" />
              <div className="mt-3 h-10 w-full animate-pulse rounded-md bg-slate-100" />
              <div className="mt-4 space-y-2">
                <div className="h-14 animate-pulse rounded-lg bg-slate-100" />
                <div className="h-14 animate-pulse rounded-lg bg-slate-100" />
                <div className="h-14 animate-pulse rounded-lg bg-slate-100" />
              </div>
            </section>
          </aside>
        </div>
      </div>
    </PageContainer>
  );
}

function PitchLines() {
  return (
    <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full text-white/65" viewBox="0 0 68 105" preserveAspectRatio="none">
      <rect x="2" y="2" width="64" height="101" rx="0.5" fill="none" stroke="currentColor" strokeWidth="0.55" />
      <line x1="2" y1="52.5" x2="66" y2="52.5" stroke="currentColor" strokeWidth="0.45" />
      <circle cx="34" cy="52.5" r="9.15" fill="none" stroke="currentColor" strokeWidth="0.45" />
      <rect x="13.84" y="2" width="40.32" height="16.5" fill="none" stroke="currentColor" strokeWidth="0.45" />
      <rect x="13.84" y="86.5" width="40.32" height="16.5" fill="none" stroke="currentColor" strokeWidth="0.45" />
    </svg>
  );
}
