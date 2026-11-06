export interface GuideBlock {
    kind: "heading" | "paragraph" | "ordered" | "unordered" | "quote" | "image";
    text: string;
    level?: number;
    id?: string;
    items?: string[];
    src?: string;
}
export declare function parseGuide(markdown: string): GuideBlock[];
//# sourceMappingURL=guideMarkdown.d.ts.map