import Link from "next/link";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export default function ResetPasswordPage() {
  return (
    <div className="rounded-lg border border-board-line bg-white p-6 shadow-soft sm:p-8">
      <p className="text-sm font-semibold uppercase text-board-green">New password</p>
      <h1 className="mt-2 text-3xl font-bold tracking-normal text-board-navy">
        Choose a new password
      </h1>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        Use the password reset link from your email, then set a new password for your account.
      </p>
      <div className="mt-6">
        <ResetPasswordForm />
      </div>
      <p className="mt-6 text-center text-sm text-slate-600">
        Need a new link?{" "}
        <Link href="/forgot-password" className="font-semibold text-board-green hover:underline">
          Request another reset email
        </Link>
      </p>
    </div>
  );
}
