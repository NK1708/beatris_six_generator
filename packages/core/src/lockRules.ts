import type { AssetStatus, FrameStatus } from "@bearridge/shared";

export function isCanonicalAsset(status: AssetStatus): boolean {
  return status === "LOCKED";
}

export function isLockedFrame(status: FrameStatus): boolean {
  return status === "LOCKED";
}

export function canonicalMutationWarning(usageCount: number): string | null {
  if (usageCount <= 0) {
    return null;
  }

  return `Этот ассет используется как канонический референс в ${usageCount} кадрах. Изменение может повлиять на визуальную консистентность.`;
}
