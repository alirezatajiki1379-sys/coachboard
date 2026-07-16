import { LogOut } from "lucide-react";
import { logout } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";

export function LogoutButton() {
  return (
    <form action={logout}>
      <Button variant="ghost" className="w-full justify-start px-3">
        <LogOut className="h-4 w-4" />
        Logout
      </Button>
    </form>
  );
}
