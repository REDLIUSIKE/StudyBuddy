export declare function videoRelativePath(value: unknown): string;
/** Store semantic reference fields and local source paths; preview URLs never enter model context. */
export declare function sanitizeVideoReference(value: unknown): {
    text: string;
    files: string[];
    data: Record<string, unknown>;
};
//# sourceMappingURL=video-reference.d.ts.map