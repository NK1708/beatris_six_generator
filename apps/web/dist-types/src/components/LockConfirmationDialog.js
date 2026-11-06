import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React from "react";
export function LockConfirmationDialog({ confirmation, pending, onConfirm, onCancel }) {
    const box = React.useRef(null);
    const cancel = React.useRef(onCancel);
    cancel.current = onCancel;
    React.useEffect(() => {
        if (!confirmation || typeof document === "undefined")
            return;
        const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        box.current?.querySelector("button")?.focus();
        return () => { if (previous?.isConnected)
            previous.focus(); };
    }, [confirmation]);
    React.useEffect(() => { if (confirmation && pending)
        box.current?.focus(); }, [confirmation, pending]);
    if (!confirmation)
        return null;
    return _jsx("div", { className: "lockDialogBackdrop", children: _jsxs("div", { ref: box, tabIndex: -1, className: "lockConfirmationDialog", role: "dialog", "aria-modal": "true", "aria-labelledby": "lock-confirmation-title", onKeyDown: event => {
                if (event.key === "Escape") {
                    event.preventDefault();
                    if (!pending)
                        cancel.current();
                }
                if (event.key === "Tab") {
                    const buttons = box.current?.querySelectorAll("button:not(:disabled)");
                    if (!buttons?.length) {
                        event.preventDefault();
                        return;
                    }
                    const first = buttons[0];
                    const last = buttons[buttons.length - 1];
                    if (event.shiftKey && document.activeElement === first) {
                        event.preventDefault();
                        last.focus();
                    }
                    else if (!event.shiftKey && document.activeElement === last) {
                        event.preventDefault();
                        first.focus();
                    }
                }
            }, children: [_jsx("h2", { id: "lock-confirmation-title", children: "\u0417\u0430\u043A\u0440\u0435\u043F\u0438\u0442\u044C \u043A\u0430\u0434\u0440?" }), _jsxs("p", { children: [_jsx("strong", { children: confirmation.frameNumber ? "Кадр " + confirmation.frameNumber : confirmation.frameCode }), " \u00B7 \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u044B\u0439 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 ", confirmation.ready.selectedGenerationId.slice(-8)] }), _jsx("p", { children: "\u042D\u0442\u043E \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435 \u043D\u0435\u043B\u044C\u0437\u044F \u043E\u0442\u043C\u0435\u043D\u0438\u0442\u044C \u0432 \u0441\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u044E\u0449\u0435\u043C \u043F\u0440\u043E\u0446\u0435\u0441\u0441\u0435. \u041F\u043E\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0430, \u0446\u0435\u043B\u0435\u0432\u043E\u0435 \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u0438 \u0432\u044B\u0431\u043E\u0440 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u0430 \u0441\u0442\u0430\u043D\u0443\u0442 \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u044B \u0442\u043E\u043B\u044C\u043A\u043E \u0434\u043B\u044F \u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440\u0430." }), _jsx("p", { children: "\u041F\u0440\u043E\u0434\u043E\u043B\u0436\u0435\u043D\u0438\u0435 \u0438\u0441\u0442\u043E\u0440\u0438\u0438 \u0441\u043C\u043E\u0436\u0435\u0442 \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u044C \u0437\u0430\u043A\u0440\u0435\u043F\u043B\u0451\u043D\u043D\u044B\u0439 \u0438\u0441\u0442\u043E\u0440\u0438\u0447\u0435\u0441\u043A\u0438\u0439 \u0438\u0441\u0442\u043E\u0447\u043D\u0438\u043A. \u041A\u0430\u043D\u043E\u043D\u0438\u0447\u0435\u0441\u043A\u0438\u0435 \u0440\u0435\u0444\u0435\u0440\u0435\u043D\u0441\u044B \u0441\u043E\u0445\u0440\u0430\u043D\u044F\u044E\u0442 \u043F\u0440\u0438\u043E\u0440\u0438\u0442\u0435\u0442." }), _jsx("p", { className: "muted", children: "\u0417\u0430\u043A\u0440\u0435\u043F\u043B\u0435\u043D\u0438\u0435 \u043D\u0435 \u0441\u043E\u0437\u0434\u0430\u0451\u0442 \u043D\u043E\u0432\u044B\u0439 \u0441\u043D\u0438\u043C\u043E\u043A \u0438 \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0430\u0435\u0442 \u0432\u0438\u0437\u0443\u0430\u043B\u044C\u043D\u043E\u0435 \u043A\u0430\u0447\u0435\u0441\u0442\u0432\u043E \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u044F." }), _jsxs("details", { children: [_jsx("summary", { children: "\u0422\u0435\u0445\u043D\u0438\u0447\u0435\u0441\u043A\u0438\u0435 \u0441\u0432\u0435\u0434\u0435\u043D\u0438\u044F" }), _jsxs("dl", { children: [_jsx("dt", { children: "\u041A\u043E\u0434 \u043A\u0430\u0434\u0440\u0430" }), _jsx("dd", { children: confirmation.frameCode }), _jsx("dt", { children: "Generation ID" }), _jsx("dd", { children: _jsx("code", { children: confirmation.ready.selectedGenerationId }) }), _jsx("dt", { children: "\u0421\u0442\u0430\u0442\u0443\u0441 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u0430" }), _jsx("dd", { children: confirmation.generationStatus }), _jsx("dt", { children: "Target revision" }), _jsx("dd", { children: confirmation.ready.targetRevision })] })] }), _jsxs("div", { className: "compareActions", children: [_jsx("button", { type: "button", disabled: pending, onClick: onCancel, children: "\u041E\u0442\u043C\u0435\u043D\u0430" }), _jsx("button", { type: "button", disabled: pending, onClick: onConfirm, children: pending ? "Проверка и закрепление…" : "Закрепить кадр" })] })] }) });
}
