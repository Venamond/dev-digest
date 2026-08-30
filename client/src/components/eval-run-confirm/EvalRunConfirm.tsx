/* EvalRunConfirm — the one spend confirmation every eval-starting control
   routes through, so the model-call count is stated before the spend, not after.

   It lives in `src/components/` rather than in a feature folder because two
   routes use it: the agent editor's Evals tab (`Run all evals`, `Play`,
   `Run on save`) and the Eval Dashboard (`Run eval`, `Run all agents`). */
"use client";

import { Modal } from "@devdigest/ui";
import { Button } from "@devdigest/ui";
import { useTranslations } from "next-intl";
import { s } from "./styles";

export interface EvalRunConfirmProps {
  /** How many model calls the action will make — one per case that will run. */
  calls: number;
  /** What is about to run, e.g. the agent's name or the case's name. */
  label: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function EvalRunConfirm({ calls, label, onConfirm, onCancel }: EvalRunConfirmProps) {
  const t = useTranslations("eval.runConfirm");
  return (
    <Modal
      width={460}
      title={t("title")}
      onClose={onCancel}
      footer={
        <div style={s.footer}>
          <Button kind="tertiary" onClick={onCancel}>
            {t("cancel")}
          </Button>
          <Button kind="primary" onClick={onConfirm}>
            {t("confirm")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <div style={s.calls}>{t("calls", { count: calls, label })}</div>
        <div style={s.note}>{t("note")}</div>
      </div>
    </Modal>
  );
}
