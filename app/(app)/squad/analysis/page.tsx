import { SquadNav } from "@/components/squad/squad-nav";

export default function AnalysisPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase text-board-green">Squad</p>
        <h1 className="mt-2 text-3xl font-bold tracking-normal text-board-navy">Analysis</h1>
        <p className="mt-2 text-slate-600">Use attendance, ratings and development goals for player analysis in a later milestone.</p>
      </div>
      <SquadNav />
      <section className="rounded-lg border border-dashed border-board-line bg-white p-8 text-center shadow-soft">
        <h2 className="text-lg font-bold text-board-navy">Coming next</h2>
        <p className="mt-2 text-sm text-slate-600">Analysis will summarize development trends once attendance and ratings are available.</p>
      </section>
    </div>
  );
}
