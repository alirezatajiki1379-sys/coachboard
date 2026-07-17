import Link from "next/link";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export default function ForgotPasswordPage() {
  return (
    <div className="rounded-lg border border-board-line bg-white p-6 shadow-soft sm:p-8">
      <p className="text-sm font-semibold uppercase text-board-green">Password reset</p>
      <h1 className="mt-2 text-3xl font-bold tracking-normal text-board-navy">
        Reset your password
      </h1>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        Enter your account email and we will send a secure link to set a new password.
      </p>
      <div className="mt-6">
        <ForgotPasswordForm />
      </div>
      <p className="mt-6 text-center text-sm text-slate-600">
        Remembered it?{" "}
        <Link href="/login" className="font-semibold text-board-green hover:underline">
          Back to login
        </Link>
      </p>
    </div>
  );
}
