/** V4 framing with native tool-role admission and released physical rows. */
import { SessionFormatError, isSessionFormatJsonObject } from '@deepseek-ai/dsh-session-format';
import { releasedV2SessionFormatCodec } from '@deepseek-ai/dsh-session-format-v2-to-v3';
import { assertV4SourceRowAdmission } from "./message-sources.js";
import { assertV4RetiredSyntax } from "./retired-syntax.js";
import { assertV4SystemMessageFields } from "./system-message.js";
import { assertV4DeveloperData } from "./developer.js";
import { assertV4ForkResult } from "./fork-result.js";
import { assertV4ToolResultMessage } from "./tool-role.js";
import { assertReleasedV4Header } from "./validation.js";
function physicalV2(value) {
    if (!isSessionFormatJsonObject(value) || value['version'] !== 4)
        throw new SessionFormatError('expected format v4 physical header');
    return { ...value, version: 2 };
}
/**
 * V4 physical encoder and decoder retain the released row framing while
 * validating the native tool-role message directly.
 */
export const releasedV4SessionFormatCodec = Object.freeze({
    version: 4,
    decodeHeader(value) {
        return { ...releasedV2SessionFormatCodec.decodeHeader(physicalV2(value)), version: 4 };
    },
    createDecoder(value, recovery) {
        const decoder = releasedV2SessionFormatCodec.createDecoder(physicalV2(value), recovery);
        return {
            ...decoder,
            header: { ...decoder.header, version: 4 },
            decodeRow(row, context) {
                assertV4RowAdmission(row);
                decoder.decodeRow(row, {
                    emitRun: context.emitRun.bind(context),
                    emitEvent: context.emitEvent.bind(context),
                });
            },
        };
    },
    encodeHeader(header, inheritedEventCount) {
        assertReleasedV4Header(header);
        return { ...releasedV2SessionFormatCodec.encodeHeader({ ...header, version: 2 }, inheritedEventCount), version: 4 };
    },
    encodeEvent(event) {
        if (event.type === 'developer/message' && event['ignorable'] === true) {
            assertV4DeveloperData(event);
            assertV4RetiredSyntax(event);
        }
        assertV4RowAdmission(event);
        return releasedV2SessionFormatCodec.encodeEvent(event);
    },
});
/**
 * Apply native V4 admission before a scanner discards a recoverable suffix.
 * Ignorable developer payloads require reader vocabulary; physical decoding defers them.
 * @param row - parsed physical row before framing and source-event range decoding.
 * @param knownEventTypes - installed event types, supplied by native readers before tail recovery.
 */
export function assertV4RowAdmission(row, knownEventTypes) {
    if (isSessionFormatJsonObject(row)) {
        if (row['type'] === 'developer/message' && row['ignorable'] === true
            && knownEventTypes?.has('developer/message') !== true)
            return;
        assertV4DeveloperData(row);
    }
    assertV4SourceRowAdmission(row);
    assertV4RetiredSyntax(row);
    assertV4SystemMessageFields(row);
    if (!isSessionFormatJsonObject(row) || row['type'] !== 'tool/result')
        return;
    const event = row;
    assertV4ToolResultMessage(event);
    assertV4ForkResult(event);
}
//# sourceMappingURL=codec.js.map