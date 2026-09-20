"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useOptionalI18n } from "@/components/i18n/i18n-provider";
import { GermanLocalizationBoundary } from "@/components/i18n/german-localization-boundary";

// Dialogs are opened by client interactions/effects, never during the server render.
export function DialogPortal({ children }: { children: ReactNode }) {
  const locale = useOptionalI18n()?.locale ?? "en";
  const [viewport, setViewport] = useState<{ height: number; top: number }>();
  useEffect(() => {
    const visible = window.visualViewport;
    if (!visible) return;
    // Safari's keyboard can shrink the visual viewport without changing 100dvh.
    const update = () => setViewport({ height: visible.height, top: visible.offsetTop });
    update();
    visible.addEventListener("resize", update);
    visible.addEventListener("scroll", update);
    return () => {
      visible.removeEventListener("resize", update);
      visible.removeEventListener("scroll", update);
    };
  }, []);
  if (typeof document === "undefined") return null;
  const style = viewport ? { "--dialog-viewport-height": `${viewport.height}px`, "--dialog-viewport-top": `${viewport.top}px` } as CSSProperties : undefined;
  return createPortal(
    <GermanLocalizationBoundary locale={locale}>
      <div className="app-dialog-host" style={style}>{children}</div>
    </GermanLocalizationBoundary>, document.body
  );
}
