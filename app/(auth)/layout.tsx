import Link from "next/link";
import { BarChart3 } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen bg-board-paper">
      <section className="hidden flex-1 items-center justify-center bg-board-navy p-10 text-white lg:flex">
        <div className="max-w-xl">
          <div className="mb-8 flex h-14 w-14 items-center justify-center rounded-md bg-board-green">
            <BarChart3 className="h-8 w-8" />
          </div>
          <h1 className="text-5xl font-bold tracking-normal">CoachBoard</h1>
          <p className="mt-5 text-xl leading-8 text-slate-200">
            Design football drills, build sessions, calculate materials, and print plans coaches can
            actually use on the pitch.
          </p>
          <div className="pitch-grid mt-10 aspect-[16/9] rounded-lg border border-white/20 p-6">
            <div className="h-full rounded-lg border-2 border-white/70">
              <div className="mx-auto h-full w-px bg-white/70" />
            </div>
          </div>
        </div>
      </section>
      <section className="flex min-h-screen flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <Link href="/login" className="mb-8 flex items-center gap-3 text-board-navy lg:hidden">
            <span className="flex h-11 w-11 items-center justify-center rounded-md bg-board-green text-white">
              <BarChart3 className="h-6 w-6" />
            </span>
            <span className="text-xl font-bold">CoachBoard</span>
          </Link>
          {children}
        </div>
      </section>
    </main>
  );
}
