import Link from "next/link";
import { AuthForm } from "@/components/auth/auth-form";
import { login } from "@/lib/auth/actions";

export default function LoginPage() {
  return (
    <div className="rounded-lg border border-board-line bg-white p-6 shadow-soft sm:p-8">
      <p className="text-sm font-semibold uppercase text-board-green">Welcome back</p>
      <h1 className="mt-2 text-3xl font-bold tracking-normal text-board-navy">Log in to CoachBoard</h1>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        Continue building your private drill library and training sessions.
      </p>
      <div className="mt-6">
        <AuthForm mode="login" action={login} />
      </div>
      <p className="mt-6 text-center text-sm text-slate-600">
        New here?{" "}
        <Link href="/signup" className="font-semibold text-board-green hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}
