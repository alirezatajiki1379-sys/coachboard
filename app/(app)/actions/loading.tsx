export default function ActionsLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading Action Center">
      <section>
        <div className="h-4 w-36 animate-pulse rounded bg-green-100" />
        <div className="mt-3 h-9 w-64 animate-pulse rounded bg-slate-200" />
        <div className="mt-3 h-4 max-w-2xl animate-pulse rounded bg-slate-200" />
      </section>
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="rounded-lg border border-board-line bg-white p-4 shadow-soft">
            <div className="h-3 w-24 animate-pulse rounded bg-slate-200" />
            <div className="mt-3 h-8 w-12 animate-pulse rounded bg-slate-200" />
          </div>
        ))}
      </section>
      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="rounded-lg border border-board-line bg-white p-4 shadow-soft">
              <div className="h-4 w-48 animate-pulse rounded bg-slate-200" />
              <div className="mt-3 h-5 w-72 animate-pulse rounded bg-slate-200" />
              <div className="mt-2 h-4 max-w-xl animate-pulse rounded bg-slate-200" />
            </div>
          ))}
        </div>
        <div className="hidden rounded-lg border border-board-line bg-white p-5 shadow-soft xl:block">
          <div className="h-4 w-28 animate-pulse rounded bg-slate-200" />
          <div className="mt-3 h-6 w-56 animate-pulse rounded bg-slate-200" />
          <div className="mt-5 space-y-2">
            <div className="h-16 animate-pulse rounded bg-slate-100" />
            <div className="h-16 animate-pulse rounded bg-slate-100" />
          </div>
        </div>
      </section>
    </div>
  );
}
