"use client";

import { RouteError } from "@/components/layout/route-error";

export default function TrainingsError({ reset }: { reset: () => void }) {
  return <RouteError reset={reset} />;
}
