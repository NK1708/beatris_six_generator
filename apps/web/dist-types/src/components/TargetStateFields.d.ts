import React from "react";
import type { StoryStateDocument } from "@bearridge/shared";
import type { Character } from "../model.js";
import { type TargetComparisonSource, type TargetPropertyDiff } from "../targetStateComparison.js";
export declare function StatePropertyDiff({ diff, display }: {
    diff: TargetPropertyDiff;
    display?: (value: unknown) => string;
}): React.JSX.Element;
export declare function TargetComparisonOverview({ source, document, characters }: {
    source: TargetComparisonSource;
    document: StoryStateDocument;
    characters: Character[];
}): React.JSX.Element;
export declare function TargetStateFields({ document, source, characters, castIds, onChange, onEnvironmentPendingChange, readOnly }: {
    document: StoryStateDocument;
    source: TargetComparisonSource;
    characters: Character[];
    castIds: string[];
    onChange(document: StoryStateDocument): void;
    onEnvironmentPendingChange?: ((pending: boolean) => void) | undefined;
    readOnly?: boolean;
}): React.JSX.Element;
//# sourceMappingURL=TargetStateFields.d.ts.map