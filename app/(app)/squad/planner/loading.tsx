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
                "relative mx-auto mt-4 aspect-[68/105] w-full max-w-[820px] overflow-hidden rounded-xl border border-emerald-950/20 bg-emerald-800 shadow-inner",
                "bg-[linear-gradient(90deg,rgba(255,255,255,0.035)_50%,transparent_50%)] bg-[length:44px_44px]"
              )}
            >
              <PitchLines />
              <div className="relative z-10 flex h-full min-h-0 flex-col justify-between gap-4 px-[7%] py-[8%]">
                {skeletonRows.map((row, rowIndex) => (
                  <div
                    key={row.join("-")}
                    className="mx-auto grid w-full justify-center gap-2 sm:gap-3"
                    style={{ gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))`, maxWidth: skeletonRowWidth(row.length) }}
                  >
                    {row.map((code, index) => (
                      <div key={`${code}-${rowIndex}-${index}`} className="min-h-12 rounded-lg border border-white/80 bg-white p-1.5 shadow-lg sm:min-h-[5.9rem] sm:p-2">
                        <div className="flex items-center justify-between gap-1 sm:gap-2">
                          <span className="text-xs font-black uppercase text-board-green">{code}</span>
                          <span className="h-4 w-4 animate-pulse rounded-full bg-slate-200 sm:h-5 sm:w-5" />
                        </div>
                        <div className="mt-3 hidden h-4 w-28 animate-pulse rounded bg-slate-200 sm:block" />
                        <div className="mt-2 hidden h-3 w-20 animate-pulse rounded bg-slate-200/80 sm:block" />
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
    <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full text-white/70" viewBox="0 0 680 1050" preserveAspectRatio="xMidYMid meet">
      <rect x="40" y="45" width="600" height="960" rx="5" fill="none" stroke="currentColor" strokeWidth="5.5" />
      <line x1="40" y1="525" x2="640" y2="525" stroke="currentColor" strokeWidth="4.5" />
      <circle cx="340" cy="525" r="91.5" fill="none" stroke="currentColor" strokeWidth="4.5" />
      <rect x="151.6" y="45" width="376.8" height="165" fill="none" stroke="currentColor" strokeWidth="4.5" />
      <rect x="249.2" y="45" width="181.6" height="55" fill="none" stroke="currentColor" strokeWidth="4.5" />
      <rect x="151.6" y="840" width="376.8" height="165" fill="none" stroke="currentColor" strokeWidth="4.5" />
      <rect x="249.2" y="950" width="181.6" height="55" fill="none" stroke="currentColor" strokeWidth="4.5" />
    </svg>
  );
}

function skeletonRowWidth(slotCount: number) {
  if (slotCount <= 1) return "34%";
  if (slotCount === 2) return "52%";
  if (slotCount === 3) return "76%";
  if (slotCount === 4) return "91%";
  return "94%";
}
