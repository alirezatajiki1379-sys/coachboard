export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase text-board-green">Settings</p>
        <h1 className="mt-2 text-3xl font-bold tracking-normal text-board-navy">Coach profile</h1>
        <p className="mt-2 text-slate-600">
          Profile, club defaults, preferred language, pitch defaults, and PDF branding will live here.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {["Profile name", "Club/team name", "Preferred language", "Default age group"].map((label) => (
          <label key={label} className="block rounded-lg border border-board-line bg-white p-4 shadow-soft">
            <span className="text-sm font-medium text-slate-700">{label}</span>
            <input
              disabled
              className="mt-2 h-10 w-full rounded-md border border-board-line bg-slate-50 px-3 text-sm"
              placeholder="Coming in a later milestone"
            />
          </label>
        ))}
      </div>
    </div>
  );
}
