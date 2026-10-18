/** Block-indexed hierarchy for one live or durable Assistant stream. */
import { INSPECTOR_PREVIEW_LIMIT } from "../format.js";
/** Keeps original delta rows under their blocks and a bounded reasoning prefix for folded headers. */
export class AssistantLogStream {
    parent;
    blocks = new Map();
    count = 0;
    /** @param parent - Stable Assistant event or live-attempt row identity. */
    constructor(parent) {
        this.parent = parent;
    }
    /**
     * Count all received chunks, including children of folded blocks.
     * @returns Number of original chunks received by this stream.
     */
    get length() { return this.count; }
    /**
     * Add one original chunk and update the matching block's disclosure state.
     * Chunks without a loaded block-start remain direct Assistant children.
     * @param chunk - Original chunk, correlated by block index.
     * @returns One row insertion, an optional replaced block header, and its folded preview.
     */
    append(chunk) {
        const index = this.count++;
        const key = `${this.parent}/chunk:${index}`;
        let position = index;
        let row = { key, parent: this.parent, depth: 1 };
        let header;
        let block;
        if (chunk.type === 'block-start') {
            block = {
                row: { ...row, disclosure: 'open' }, offset: index, children: 0,
                ...chunk.blockType === 'reasoning' ? { reasoningText: '' } : {},
            };
            row = block.row;
            this.blocks.set(chunk.index, block);
        }
        else {
            block = 'index' in chunk ? this.blocks.get(chunk.index) : undefined;
            if (block !== undefined) {
                position = block.offset + 1 + block.children++;
                row = { key, parent: block.row.key, depth: 2 };
                for (const following of this.blocks.values()) {
                    if (following.offset > block.offset)
                        following.offset++;
                }
                if (chunk.type === 'reasoning-delta' && block.reasoningText !== undefined) {
                    block.reasoningText = (block.reasoningText + chunk.text).slice(0, INSPECTOR_PREVIEW_LIMIT);
                }
                if (chunk.type === 'block-end') {
                    block.row = { ...block.row, disclosure: 'closed' };
                    header = { position: block.offset, row: block.row };
                }
            }
        }
        return { key, index, position, row, ...header === undefined ? {} : { header },
            ...block?.reasoningText === undefined ? {} : { collapsed: {
                    key: block.row.key,
                    summary: `blockType: reasoning${block.reasoningText === '' ? '' : ` · ${block.reasoningText}`}`.slice(0, INSPECTOR_PREVIEW_LIMIT),
                } } };
    }
}
//# sourceMappingURL=stream.js.map