import { LogOut } from "lucide-react";
import { logout } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";

export function LogoutButton({ compact = false }: { compact?: boolean }) {
  return (
    <form action={logout}>
      <Button
        variant="ghost"
        className={compact ? "h-10 w-10 px-0" : "w-full justify-start px-3"}
        aria-label={compact ? "Logout" : undefined}
        title={compact ? "Logout" : undefined}
      >
        <LogOut className="h-4 w-4" />
        <span className={compact ? "sr-only" : ""}>Logout</span>
      </Button>
    </form>
  );
}
