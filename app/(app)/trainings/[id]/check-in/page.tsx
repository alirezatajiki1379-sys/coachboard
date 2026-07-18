import { redirect } from "next/navigation";

type TrainingCheckInPageProps = {
  params: Promise<{ id: string }>;
};

export default async function TrainingCheckInPage({ params }: TrainingCheckInPageProps) {
  const { id } = await params;
  redirect(`/squad/attendance/${id}/check-in`);
}
