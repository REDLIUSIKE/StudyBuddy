import { SessionFormatEventCollector } from '@deepseek-ai/dsh-session-format';
import { releasedV4SessionFormatCodec } from "../codec.js";
/**
 * Validate an artifact through the native codec without vocabulary-aware restoration.
 * @param artifact - current-generation artifact to encode and decode.
 */
export function assertReleasedV4Artifact(artifact) {
    const codec = releasedV4SessionFormatCodec;
    const decoder = codec.createDecoder(codec.encodeHeader(artifact.header, artifact.inheritedEventCount), 'strict');
    const output = new SessionFormatEventCollector();
    for (const event of artifact.events)
        decoder.decodeRow(codec.encodeEvent(event), output);
    decoder.finish(output);
}
//# sourceMappingURL=validation.js.map