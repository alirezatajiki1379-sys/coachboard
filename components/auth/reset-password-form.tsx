"use client";

import Link from "next/link";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { updatePassword } from "@/lib/auth/actions";
import { getMessages, type Locale } from "@/lib/i18n";

export function ResetPasswordForm({ locale = "en" }: { locale?: Locale }) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(updatePassword, {});
  const messages = getMessages(locale);

  useEffect(() => {
    if (!state?.success) return;

    const timeout = window.setTimeout(() => {
      router.replace("/login");
    }, 1500);

    return () => window.clearTimeout(timeout);
  }, [router, state?.success]);

  return (
    <form action={formAction} className="space-y-4">
      <label className="block">
        <span className="text-sm font-medium text-slate-700">{messages.auth.fields.newPassword}</span>
        <input
          required
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          className="mt-1 h-11 w-full rounded-md border border-board-line bg-white px-3 text-board-navy outline-none transition focus:border-board-green focus:ring-4 focus:ring-green-100"
          placeholder={messages.auth.fields.passwordMinimum8}
          aria-invalid={Boolean(state?.fieldErrors?.password)}
        />
        {state?.fieldErrors?.password ? (
          <span className="mt-1 block text-sm text-red-600">{state.fieldErrors.password}</span>
        ) : null}
      </label>

      <label className="block">
        <span className="text-sm font-medium text-slate-700">{messages.auth.fields.confirmNewPassword}</span>
        <input
          required
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          minLength={8}
          className="mt-1 h-11 w-full rounded-md border border-board-line bg-white px-3 text-board-navy outline-none transition focus:border-board-green focus:ring-4 focus:ring-green-100"
          placeholder={messages.auth.fields.repeatNewPassword}
          aria-invalid={Boolean(state?.fieldErrors?.confirmPassword)}
        />
        {state?.fieldErrors?.confirmPassword ? (
          <span className="mt-1 block text-sm text-red-600">
            {state.fieldErrors.confirmPassword}
          </span>
        ) : null}
      </label>

      {state?.success ? (
        <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-board-green">
          <p>{state.success}</p>
          <p className="mt-1 text-xs text-green-700">{messages.auth.resetPassword.redirecting}</p>
          <Link href="/login" className="mt-2 inline-block font-semibold hover:underline">
            {messages.auth.resetPassword.goToLogin}
          </Link>
        </div>
      ) : null}

      {state?.error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" className="w-full" disabled={isPending || Boolean(state?.success)}>
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {messages.auth.resetPassword.submit}
      </Button>
    </form>
  );
}
