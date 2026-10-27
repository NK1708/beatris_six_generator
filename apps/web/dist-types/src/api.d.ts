import type { AvailableFrameTargetStoryStateResponse, FrameTargetRecoveryCandidatesResponse, FrameTargetRecoveryRequest, FrameTargetStoryStateResponse, UpdateFrameTargetStoryStateInput } from "@bearridge/shared";
export declare const api: {
    get<T>(url: string): Promise<T>;
    post<T>(url: string, body: unknown): Promise<T>;
    put<T>(url: string, body: unknown): Promise<T>;
    delete<T>(url: string, body: unknown): Promise<T>;
    getFrameTargetStoryState(frameId: string): Promise<FrameTargetStoryStateResponse>;
    initializeFrameTargetStoryState(frameId: string): Promise<AvailableFrameTargetStoryStateResponse>;
    updateFrameTargetStoryState(frameId: string, input: UpdateFrameTargetStoryStateInput): Promise<AvailableFrameTargetStoryStateResponse>;
    getFrameTargetRecoveryCandidates(frameId: string): Promise<FrameTargetRecoveryCandidatesResponse>;
    recoverFrameTargetStoryState(frameId: string, input: FrameTargetRecoveryRequest): Promise<AvailableFrameTargetStoryStateResponse>;
};
export declare class ApiError extends Error {
    readonly code: string | null;
    readonly status: number;
    readonly diagnostics: string[];
    constructor(message: string, code: string | null, status: number, diagnostics?: string[]);
}
//# sourceMappingURL=api.d.ts.map