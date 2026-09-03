import Link from "next/link";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { getMessages } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n/server";

export default async function ResetPasswordPage() {
  const locale = await getRequestLocale();
  const messages = getMessages(locale);
  return (
    <div className="rounded-lg border border-board-line bg-white p-6 shadow-soft sm:p-8">
      <p className="text-sm font-semibold uppercase text-board-green">{messages.auth.resetPassword.eyebrow}</p>
      <h1 className="mt-2 text-3xl font-bold tracking-normal text-board-navy">
        {messages.auth.resetPassword.title}
      </h1>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        {messages.auth.resetPassword.description}
      </p>
      <div className="mt-6">
        <ResetPasswordForm locale={locale} />
      </div>
      <p className="mt-6 text-center text-sm text-slate-600">
        {messages.auth.resetPassword.needNewLink}{" "}
        <Link href="/forgot-password" className="font-semibold text-board-green hover:underline">
          {messages.auth.resetPassword.requestAnother}
        </Link>
      </p>
    </div>
  );
}
