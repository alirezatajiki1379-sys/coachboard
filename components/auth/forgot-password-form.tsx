"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requestPasswordReset } from "@/lib/auth/actions";
import { getMessages, type Locale } from "@/lib/i18n";

export function ForgotPasswordForm({ locale = "en" }: { locale?: Locale }) {
  const [state, formAction, isPending] = useActionState(requestPasswordReset, {});
  const messages = getMessages(locale);

  return (
    <form action={formAction} className="space-y-4">
      <label className="block">
        <span className="text-sm font-medium text-slate-700">{messages.auth.fields.email}</span>
        <input
          required
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={state?.email ?? ""}
          className="mt-1 h-11 w-full rounded-md border border-board-line bg-white px-3 text-board-navy outline-none transition focus:border-board-green focus:ring-4 focus:ring-green-100"
          placeholder={messages.auth.fields.emailPlaceholder}
          aria-invalid={Boolean(state?.fieldErrors?.email)}
        />
        {state?.fieldErrors?.email ? (
          <span className="mt-1 block text-sm text-red-600">{state.fieldErrors.email}</span>
        ) : null}
      </label>

      {state?.success ? (
        <p className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-board-green">
          {state.success}
        </p>
      ) : null}

      {state?.error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {messages.auth.forgotPassword.submit}
      </Button>
    </form>
  );
}
