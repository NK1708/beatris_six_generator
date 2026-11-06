import type { ConfirmFrameLockInput } from "@bearridge/shared";
import type { Frame } from "./model.js";
export declare function requestConfirmedLock(frameId: string, expected: ConfirmFrameLockInput): Promise<Pick<Frame, "id" | "status" | "selectedGenerationId">>;
//# sourceMappingURL=confirmedLock.d.ts.map