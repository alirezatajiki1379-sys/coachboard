import { redirect } from "next/navigation";

type EventPageProps = {
  params: Promise<{ id: string }>;
};

export default async function TrainingEventPage({ params }: EventPageProps) {
  const { id } = await params;
  redirect(`/trainings/${id}`);
}
