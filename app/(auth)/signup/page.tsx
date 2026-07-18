import Link from "next/link";
import { AuthForm } from "@/components/auth/auth-form";
import { signup } from "@/lib/auth/actions";

export default function SignupPage() {
  return (
    <div className="rounded-lg border border-board-line bg-white p-6 shadow-soft sm:p-8">
      <p className="text-sm font-semibold uppercase text-board-green">Start planning</p>
      <h1 className="mt-2 text-3xl font-bold tracking-normal text-board-navy">Create your coach account</h1>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        Your drills, trainings, and training plans are private to your Supabase user.
      </p>
      <div className="mt-6">
        <AuthForm mode="signup" action={signup} />
      </div>
      <p className="mt-6 text-center text-sm text-slate-600">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-board-green hover:underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
