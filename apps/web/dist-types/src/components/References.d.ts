import React from "react";
import type { AssetStatus, OwnerType, Project, Reference } from "../model.js";
export declare function ReferenceSlots({ project, ownerType, ownerId, references, slots, onChanged }: {
    project: Project;
    ownerType: OwnerType;
    ownerId: string;
    references: Reference[];
    slots: string[];
    onChanged(): void;
}): React.JSX.Element;
export declare function StatusBadge({ status }: {
    status: AssetStatus;
}): React.JSX.Element;
export declare const characterSlots: string[];
export declare const outfitSlots: string[];
export declare const locationSlots: string[];
//# sourceMappingURL=References.d.ts.map