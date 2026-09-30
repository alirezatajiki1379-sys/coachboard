export default function ScoutingLoading() {
  return <div className="space-y-5" aria-busy="true">
    <div className="h-8 w-48 animate-pulse rounded bg-slate-200" />
    <div className="h-12 animate-pulse rounded bg-slate-100" />
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }, (_, index) => <div key={index} className="h-28 animate-pulse rounded-md border border-board-line bg-white" />)}
    </div>
  </div>;
}
