"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

type ConfirmSubmitButtonProps = {
  children: ReactNode;
  message: string;
  className?: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
};

export function ConfirmSubmitButton({ children, message, className, variant = "danger" }: ConfirmSubmitButtonProps) {
  return (
    <Button
      type="submit"
      variant={variant}
      className={className}
      onClick={(event) => {
        if (!window.confirm(message)) event.preventDefault();
      }}
    >
      {children}
    </Button>
  );
}
