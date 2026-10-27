import React from "react";
import { type AvailableFrameTargetStoryStateResponse, type FrameTargetStoryStateResponse, type StoryStateDocument } from "@bearridge/shared";
import type { Character, FrameStatus } from "../model.js";
export declare const frameTargetStoryStateQueryKey: (frameId: string) => readonly ["frame-target-story-state", string];
export interface TargetStoryStateEditSession {
    frameId: string;
    baseRevision: number;
    baseDocument: StoryStateDocument;
    draft: StoryStateDocument;
}
export declare function createTargetStoryStateEditSession(target: AvailableFrameTargetStoryStateResponse): TargetStoryStateEditSession;
export declare function isTargetStoryStateDirty(session: TargetStoryStateEditSession): boolean;
export declare function validateTargetStoryState(document: StoryStateDocument): string[];
export declare function FrameTargetStoryStatePanel({ frameId, frameStatus, characters }: {
    frameId: string | null;
    frameStatus: FrameStatus | null;
    characters: Character[];
}): React.JSX.Element;
export declare function FrameTargetStoryStateView({ response, loading, requestError, frameStatus, characters, onEdit }: {
    response?: FrameTargetStoryStateResponse | undefined;
    loading?: boolean | undefined;
    requestError?: boolean | undefined;
    frameStatus: FrameStatus | null;
    characters?: Character[] | undefined;
    onEdit?: (() => void) | undefined;
}): React.JSX.Element;
export declare function TargetStoryStateEditor({ session, characters, frameStatus, saving, validationErrors, saveError, conflict, onChange, onSave, onCancel, onContinue, onLoadLatest }: {
    session: TargetStoryStateEditSession;
    characters: Character[];
    frameStatus: FrameStatus | null;
    saving: boolean;
    validationErrors: string[];
    saveError: string | null;
    conflict: boolean;
    onChange(document: StoryStateDocument): void;
    onSave(): void;
    onCancel(): void;
    onContinue(): void;
    onLoadLatest(): void;
}): React.JSX.Element;
export declare function StoryStateDocumentView({ document, characters }: {
    document: StoryStateDocument;
    characters: Character[];
}): React.JSX.Element;
//# sourceMappingURL=FrameTargetStoryStatePanel.d.ts.map