"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { login, signup } from "@/lib/auth/actions";

type AuthFormProps = {
  mode: "login" | "signup";
  action: typeof login | typeof signup;
};

export function AuthForm({ mode, action }: AuthFormProps) {
  const [state, formAction, isPending] = useActionState(action, {});
  const isSignup = mode === "signup";

  return (
    <form action={formAction} className="space-y-4">
      {isSignup ? (
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Profile name</span>
          <input
            name="displayName"
            autoComplete="name"
            className="mt-1 h-11 w-full rounded-md border border-board-line bg-white px-3 text-board-navy outline-none transition focus:border-board-green focus:ring-4 focus:ring-green-100"
            placeholder="Coach name"
          />
        </label>
      ) : null}

      <label className="block">
        <span className="text-sm font-medium text-slate-700">Email</span>
        <input
          required
          name="email"
          type="email"
          autoComplete="email"
          className="mt-1 h-11 w-full rounded-md border border-board-line bg-white px-3 text-board-navy outline-none transition focus:border-board-green focus:ring-4 focus:ring-green-100"
          placeholder="coach@example.com"
        />
      </label>

      <label className="block">
        <span className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium text-slate-700">Password</span>
          {!isSignup ? (
            <Link href="/forgot-password" className="text-sm font-semibold text-board-green hover:underline">
              Forgot your password?
            </Link>
          ) : null}
        </span>
        <input
          required
          name="password"
          type="password"
          autoComplete={isSignup ? "new-password" : "current-password"}
          minLength={6}
          className="mt-1 h-11 w-full rounded-md border border-board-line bg-white px-3 text-board-navy outline-none transition focus:border-board-green focus:ring-4 focus:ring-green-100"
          placeholder="Minimum 6 characters"
        />
      </label>

      {state?.error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {isSignup ? "Create account" : "Log in"}
      </Button>
    </form>
  );
}
