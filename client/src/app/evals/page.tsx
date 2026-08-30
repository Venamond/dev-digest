/* Route: /evals — Eval Dashboard. Thin RSC entry; the selected agent lives in
   `?agent=`, read by the client view (design ScreenEval). */
import { EvalDashboardView } from "./_components/EvalDashboardView/EvalDashboardView";

export default function EvalsPage() {
  return <EvalDashboardView />;
}
