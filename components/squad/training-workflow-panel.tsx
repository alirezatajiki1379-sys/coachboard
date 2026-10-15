"use client";

import { ButtonLink } from "@/components/ui/button";
import { useSystemText } from "@/components/i18n/use-system-text";
import type { TrainingWorkflowState } from "@/lib/trainings/workflow";

export function TrainingWorkflowPanel({ workflow, compact = false, openHref }: { workflow: TrainingWorkflowState; compact?: boolean; openHref?: string }) {
  const ui = useSystemText();
  if (!workflow.phase) return null;

  if (compact) {
    return (
      <div data-training-workflow className="mt-3 min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">{ui(workflow.phaseLabel ?? "")}</span>
          <span className="min-w-0 break-words font-semibold text-slate-600 [overflow-wrap:anywhere]">{workflow.facts.slice(0, 2).map((fact) => `${ui(fact.label)}: ${ui(fact.value, fact.values)}`).join(" · ")}</span>
        </div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {workflow.primaryAction ? <ButtonLink data-workflow-primary href={workflow.primaryAction.href} className="w-full justify-center sm:w-auto">{ui(workflow.primaryAction.label)}</ButtonLink> : null}
          {openHref ? <ButtonLink href={openHref} variant="secondary" className="w-full justify-center sm:w-auto">{ui("Open Training")}</ButtonLink> : null}
        </div>
      </div>
    );
  }

  return (
    <section data-training-workflow className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
      <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-black uppercase text-board-green">{ui("Next up")}</p>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">{ui(workflow.phaseLabel ?? "")}</span>
          </div>
          <h2 className="mt-2 break-words text-xl font-bold text-board-navy [overflow-wrap:anywhere]">{ui(workflow.headline ?? "")}</h2>
          {workflow.reason ? <p className="mt-1 max-w-2xl break-words text-sm leading-6 text-slate-600 [overflow-wrap:anywhere]">{ui(workflow.reason, workflow.reasonValues)}</p> : null}
        </div>
        {workflow.primaryAction ? <ButtonLink data-workflow-primary href={workflow.primaryAction.href} className="w-full shrink-0 justify-center lg:w-auto">{ui(workflow.primaryAction.label)}</ButtonLink> : null}
      </div>
      {workflow.facts.length ? (
        <dl className="mt-4 grid gap-2 sm:grid-cols-2 lg:max-w-2xl">
          {workflow.facts.map((fact) => (
            <div key={`${fact.label}-${fact.value}`} className="min-w-0 rounded-md bg-slate-50 px-3 py-2">
              <dt className="text-xs font-bold uppercase text-slate-500">{ui(fact.label)}</dt>
              <dd className="mt-1 break-words text-sm font-bold text-board-navy [overflow-wrap:anywhere]">{ui(fact.value, fact.values)}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </section>
  );
}

export function TrainingWorkflowSecondaryActions({ workflow }: { workflow: TrainingWorkflowState }) {
  const ui = useSystemText();
  if (!workflow.secondaryActions.length) return null;
  return (
    <section className="rounded-lg border border-board-line bg-white p-4">
      <h2 className="text-sm font-black uppercase text-slate-500">{ui("More actions")}</h2>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {workflow.secondaryActions.map((action) => (
          <ButtonLink key={action.kind} href={action.href} variant="secondary" className="w-full justify-center sm:w-auto">{ui(action.label)}</ButtonLink>
        ))}
      </div>
    </section>
  );
}
