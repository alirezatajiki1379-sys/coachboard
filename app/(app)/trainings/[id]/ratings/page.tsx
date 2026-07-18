import { redirect } from "next/navigation";

type TrainingRatingsPageProps = {
  params: Promise<{ id: string }>;
};

export default async function TrainingRatingsPage({ params }: TrainingRatingsPageProps) {
  const { id } = await params;
  redirect(`/squad/attendance/${id}/ratings`);
}
