import { LogOut } from "lucide-react";
import { logout } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { getMessages, type Locale } from "@/lib/i18n";

export function LogoutButton({ compact = false, locale = "en" }: { compact?: boolean; locale?: Locale }) {
  const messages = getMessages(locale);
  return (
    <form action={logout}>
      <Button
        variant="ghost"
        className={compact ? "h-10 w-10 px-0" : "w-full justify-start px-3"}
        aria-label={compact ? messages.account.logout : undefined}
        title={compact ? messages.account.logout : undefined}
      >
        <LogOut className="h-4 w-4" />
        <span className={compact ? "sr-only" : ""}>{messages.account.logout}</span>
      </Button>
    </form>
  );
}
