import type { VideoToolInvocation } from '../../../desktop-host/src/video-control-wire.d.ts';
import type { VideoCapabilityRequest } from './video-types.ts';
/** Closed private Host-to-Main video invocation; no public renderer entry. */
export declare function parseVideoToolInvocation(value: unknown): VideoToolInvocation;
/** Validate every private domain request before Main dispatches a native capability. */
export declare function parseVideoCapabilityRequest(value: unknown): VideoCapabilityRequest;
/** Native domain reports only completed same-parent project renames over private stdio. */
export declare function parseVideoProjectRelocated(value: unknown): {
    type: "project-relocated";
    id: string;
    accountGeneration: string;
    event: {
        projectId: string;
        from: string;
        to: string;
    };
};
//# sourceMappingURL=video-wire.d.ts.map