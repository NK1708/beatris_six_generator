import React from "react";
import type { StoryStateDocument } from "@bearridge/shared";
type Environment = StoryStateDocument["environment"];
export interface EnvironmentRow {
    id: string;
    name: string;
    value: Environment[string];
    numberText?: string | undefined;
    invalidValue?: boolean;
}
export declare function environmentRowErrors(rows: EnvironmentRow[]): string[];
export declare function rowsToEnvironment(rows: EnvironmentRow[]): Environment | null;
export declare function reportEnvironmentValidity(container: HTMLElement): boolean;
export declare function EnvironmentStateEditor({ state, onChange, typedValues, onPendingChange }: {
    state: StoryStateDocument;
    onChange(next: StoryStateDocument): void;
    typedValues?: boolean;
    onPendingChange?: ((pending: boolean) => void) | undefined;
}): React.JSX.Element;
export {};
//# sourceMappingURL=EnvironmentStateEditor.d.ts.map