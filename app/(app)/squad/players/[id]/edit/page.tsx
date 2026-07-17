import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PlayerForm } from "@/components/squad/player-form";
import { updateSquadPlayer } from "@/lib/squad/actions";
import { getSquadPlayer } from "@/lib/squad/queries";
import { createClient } from "@/lib/supabase/server";

type EditPlayerPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditPlayerPage({ params }: EditPlayerPageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const player = await getSquadPlayer(supabase, user.id, id);
  if (!player) notFound();

  return (
    <div className="space-y-6">
      <Link href={`/squad/players/${player.id}`} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-board-navy">
        <ArrowLeft className="h-4 w-4" />
        Back to player
      </Link>
      <div>
        <p className="text-sm font-semibold uppercase text-board-green">Squad</p>
        <h1 className="mt-2 text-3xl font-bold tracking-normal text-board-navy">Edit {player.firstName}</h1>
        <p className="mt-2 text-slate-600">Keep player details and development notes current.</p>
      </div>
      <PlayerForm action={updateSquadPlayer} mode="edit" player={player} />
    </div>
  );
}
