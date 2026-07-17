import { SquadNav } from "@/components/squad/squad-nav";

export default function RatingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase text-board-green">Squad</p>
        <h1 className="mt-2 text-3xl font-bold tracking-normal text-board-navy">Ratings</h1>
        <p className="mt-2 text-slate-600">Add training ratings and development notes after the roster foundation is in place.</p>
      </div>
      <SquadNav />
      <section className="rounded-lg border border-dashed border-board-line bg-white p-8 text-center shadow-soft">
        <h2 className="text-lg font-bold text-board-navy">Coming next</h2>
        <p className="mt-2 text-sm text-slate-600">Ratings will help compare effort, focus and progress over time.</p>
      </section>
    </div>
  );
}
