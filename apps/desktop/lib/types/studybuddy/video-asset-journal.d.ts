import { z } from 'zod';
import type { VideoArtifact } from '../../../desktop-host/src/video-domain-types.ts';
export declare const VideoTtsDetailsSchema: z.ZodObject<{
    wordTimestampsStatus: z.ZodEnum<{
        available: "available";
        unavailable: "unavailable";
    }>;
    timing: z.ZodOptional<z.ZodObject<{
        durationMs: z.ZodNumber;
        words: z.ZodArray<z.ZodObject<{
            token: z.ZodString;
            startMs: z.ZodNumber;
            endMs: z.ZodNumber;
        }, z.core.$strict>>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type VideoTtsDetails = z.infer<typeof VideoTtsDetailsSchema>;
export declare class VideoAssetJournal {
    private readonly root;
    private readonly identity;
    private readonly destination;
    private readonly check;
    private readonly file;
    private retained;
    constructor(root: string, identity: {
        requestId: string;
        inputHash: string;
        contextHash: string;
    }, destination: (path: string) => Promise<string>, check: () => void);
    retains(path: string): boolean;
    private safe;
    private read;
    claim(): Promise<boolean>;
    private save;
    private verified;
    recover(target: (mime: string) => Promise<string>): Promise<{
        artifact: VideoArtifact;
        details?: VideoTtsDetails;
    } | null>;
    stage(temporary: string, artifact: VideoArtifact, bytes: number, target: (mime: string) => Promise<string>, details?: VideoTtsDetails): Promise<VideoArtifact>;
    private publish;
}
//# sourceMappingURL=video-asset-journal.d.ts.map