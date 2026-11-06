import { ApiError } from "./api.js";
import type { Generation, PreviewResponse, Project } from "./model.js";
export interface GenerationDiagnostic {
    code: string;
    message: string;
    entityId?: string;
}
export declare class GenerationRequestError extends ApiError {
    readonly problems: GenerationDiagnostic[];
    constructor(message: string, code: string | null, status: number, problems: GenerationDiagnostic[]);
}
export declare function generationRequest<T>(url: string, body?: unknown): Promise<T>;
export declare function parseGenerationResponse<T>(response: Response): Promise<T>;
export declare function generationProblemLabel(code: string, fallback?: string): string;
export declare function generationMetadata(generation: Generation): {
    mode: string;
    error: string | null;
    targetRevision: number | null;
};
export type GenerationFix = {
    kind: "target" | "cast";
    label: string;
} | {
    kind: "character" | "outfit" | "location" | "style";
    id: string;
    label: string;
} | {
    kind: "explain";
    label: string;
};
export declare function generationFix(project: Project, issue: GenerationDiagnostic): GenerationFix;
export declare function canPrepareProduction(preview: PreviewResponse | undefined): boolean;
//# sourceMappingURL=generationWorkspace.d.ts.map