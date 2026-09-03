import { redirect } from "next/navigation";

type SquadAttendanceReviewPageProps = {
  params: Promise<{ id: string }>;
};

export default async function SquadAttendanceReviewPage({ params }: SquadAttendanceReviewPageProps) {
  const { id } = await params;
  redirect(`/trainings/${id}/review`);
}
