import React from "react";
import type { LockConfirmation } from "./useFrameReviewActions.js";

export function LockConfirmationDialog({ confirmation, pending, onConfirm, onCancel }: { confirmation: LockConfirmation | null; pending: boolean; onConfirm(): void; onCancel(): void }) {
  const box = React.useRef<HTMLDivElement>(null);
  const cancel = React.useRef(onCancel); cancel.current = onCancel;
  React.useEffect(() => {
    if (!confirmation || typeof document === "undefined") return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    box.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, [confirmation]);
  React.useEffect(() => { if (confirmation && pending) box.current?.focus(); }, [confirmation, pending]);
  if (!confirmation) return null;
  return <div className="lockDialogBackdrop"><div ref={box} tabIndex={-1} className="lockConfirmationDialog" role="dialog" aria-modal="true" aria-labelledby="lock-confirmation-title" onKeyDown={event => {
    if (event.key === "Escape") { event.preventDefault(); if (!pending) cancel.current(); }
    if (event.key === "Tab") { const buttons = box.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"); if (!buttons?.length) { event.preventDefault(); return; } const first = buttons[0]!; const last = buttons[buttons.length - 1]!; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); } }
  }}><h2 id="lock-confirmation-title">Закрепить кадр?</h2><p><strong>{confirmation.frameNumber ? "Кадр " + confirmation.frameNumber : confirmation.frameCode}</strong> · выбранный результат {confirmation.ready.selectedGenerationId.slice(-8)}</p><p>Это действие нельзя отменить в существующем процессе. Постановка, целевое состояние и выбор результата станут доступны только для просмотра.</p><p>Продолжение истории сможет использовать закреплённый исторический источник. Канонические референсы сохраняют приоритет.</p><p className="muted">Закрепление не создаёт новый снимок и не подтверждает визуальное качество изображения.</p><details><summary>Технические сведения</summary><dl><dt>Код кадра</dt><dd>{confirmation.frameCode}</dd><dt>Generation ID</dt><dd><code>{confirmation.ready.selectedGenerationId}</code></dd><dt>Статус результата</dt><dd>{confirmation.generationStatus}</dd><dt>Target revision</dt><dd>{confirmation.ready.targetRevision}</dd></dl></details><div className="compareActions"><button type="button" disabled={pending} onClick={onCancel}>Отмена</button><button type="button" disabled={pending} onClick={onConfirm}>{pending ? "Проверка и закрепление…" : "Закрепить кадр"}</button></div></div></div>;
}
