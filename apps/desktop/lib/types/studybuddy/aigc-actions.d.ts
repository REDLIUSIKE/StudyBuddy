/** Sandboxed AIGC page inputs carry intentions and rectangles, never native authority. */
import { z } from 'zod';
export declare const aigcSubmit: z.ZodObject<{
    kind: z.ZodOptional<z.ZodLiteral<"submit">>;
    directory: z.ZodString;
    sessionId: z.ZodString;
    requestId: z.ZodUUID;
    prompt: z.ZodString;
    providerId: z.ZodString;
    modelId: z.ZodString;
    reasoningEffort: z.ZodOptional<z.ZodString>;
    attachments: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        path: z.ZodString;
        mimeType: z.ZodString;
    }, z.core.$strict>>;
}, z.core.$strict>;
export declare const parseAigcPageAction: (value: unknown) => {
    kind: "prepare-canvas";
    directory: string;
    controllerRef: string;
} | {
    directory: string;
    sessionId: string;
    requestId: string;
    prompt: string;
    providerId: string;
    modelId: string;
    attachments: {
        name: string;
        path: string;
        mimeType: string;
    }[];
    kind: "submit";
    reasoningEffort?: string | undefined;
} | {
    kind: "open";
    directory: string;
} | {
    kind: "new";
    directory: string;
} | {
    kind: "select";
    directory: string;
    sessionId: string;
} | {
    kind: "close";
    directory: string;
    sessionId: string;
} | {
    kind: "rename";
    directory: string;
    sessionId: string;
    name: string;
} | {
    kind: "project-title";
    directory: string;
    name: string;
} | {
    kind: "records";
    directory: string;
    sessionId: string;
} | {
    kind: "reference";
    directory: string;
    sessionId: string;
    references: {
        id: string;
        label: string;
        dataType: string;
        value: z.core.util.JSONType;
        source: {
            kind: "asset";
            path: string;
        } | {
            kind: "canvas";
            canvasId: string;
            canvasName: string;
            nodeId: string;
            nodeName: string;
            outputId: string;
            outputName: string;
        };
    }[];
} | {
    kind: "list";
    directory: string;
} | {
    kind: "archive";
    directory: string;
    file?: string | undefined;
} | {
    kind: "continue";
    directory: string;
    file: string;
} | {
    kind: "surface";
    directory: string;
    visible: boolean;
    rect: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
} | {
    kind: "hide";
};
//# sourceMappingURL=aigc-actions.d.ts.map