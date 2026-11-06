import React from "react";
export function FrameStatusBar({ children }: { children: React.ReactNode }) {
  return <section className="frameStatusBar frameReview" aria-label="Проверка результата">{children}</section>;
}
