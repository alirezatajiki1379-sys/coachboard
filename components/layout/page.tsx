import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type PageContainerProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  width?: "standard" | "wide" | "full";
};

const widthClasses = {
  standard: "max-w-6xl",
  wide: "max-w-7xl",
  full: "max-w-none"
};

export function PageContainer({ children, width = "wide", className, ...props }: PageContainerProps) {
  return <div className={cn("mx-auto w-full space-y-6", widthClasses[width], className)} {...props}>{children}</div>;
}

type PageHeaderProps = {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  metadata?: ReactNode;
  actions?: ReactNode;
  breadcrumb?: ReactNode;
  className?: string;
};

export function PageHeader({ eyebrow, title, description, metadata, actions, breadcrumb, className }: PageHeaderProps) {
  return (
    <section className={cn("flex flex-col gap-4 md:flex-row md:items-end md:justify-between", className)}>
      <div className="min-w-0">
        {breadcrumb ? <div className="mb-3">{breadcrumb}</div> : null}
        {eyebrow ? <p className="text-sm font-semibold uppercase text-board-green">{eyebrow}</p> : null}
        <h1 className="mt-2 text-3xl font-bold tracking-normal text-board-navy sm:text-4xl">{title}</h1>
        {description ? <p className="mt-2 max-w-3xl text-slate-600">{description}</p> : null}
        {metadata ? <div className="mt-3 text-sm font-semibold text-slate-700">{metadata}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2 md:justify-end">{actions}</div> : null}
    </section>
  );
}

export function PageTabs({ children, label = "Page sections", className }: { children: ReactNode; label?: string; className?: string }) {
  return (
    <nav className={cn("page-tabs flex gap-2 overflow-x-auto rounded-lg border border-board-line bg-white p-2 shadow-soft", className)} aria-label={label}>
      {children}
    </nav>
  );
}

export function PageHeaderSkeleton({ width = "wide" }: { width?: PageContainerProps["width"] }) {
  return (
    <PageContainer width={width} className="animate-pulse" aria-busy="true">
      <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <div className="h-4 w-24 rounded bg-slate-200" />
          <div className="mt-3 h-9 w-72 max-w-full rounded bg-slate-200" />
          <div className="mt-3 h-4 w-full max-w-2xl rounded bg-slate-200" />
        </div>
        <div className="h-10 w-36 rounded bg-slate-200" />
      </section>
      <div className="h-14 rounded-lg bg-slate-200" />
      <div className="grid gap-4 md:grid-cols-3">
        <div className="h-32 rounded-lg bg-slate-200" />
        <div className="h-32 rounded-lg bg-slate-200" />
        <div className="h-32 rounded-lg bg-slate-200" />
      </div>
    </PageContainer>
  );
}
