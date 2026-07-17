import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PlayerForm } from "@/components/squad/player-form";
import { createSquadPlayer } from "@/lib/squad/actions";

export default function NewSquadPlayerPage() {
  return (
    <div className="space-y-6">
      <Link href="/squad" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-board-navy">
        <ArrowLeft className="h-4 w-4" />
        Back to squad
      </Link>
      <div>
        <p className="text-sm font-semibold uppercase text-board-green">Squad</p>
        <h1 className="mt-2 text-3xl font-bold tracking-normal text-board-navy">Add player</h1>
        <p className="mt-2 text-slate-600">Create a roster profile for attendance and development tracking.</p>
      </div>
      <PlayerForm action={createSquadPlayer} mode="create" />
    </div>
  );
}
