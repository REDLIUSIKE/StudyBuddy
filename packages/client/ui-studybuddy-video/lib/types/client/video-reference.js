import { formatFileMention } from '@deepseek-ai/dsh-file-reference/grammar';
/** Retry acknowledgement without inserting the same reference into a draft twice. */
export class VideoReferenceImporter {
    applied = new Set();
    insert(input, reference) {
        if (this.applied.has(reference.id))
            return true;
        const tokens = reference.files.map(path => formatFileMention({ path, kind: 'file' }, false));
        if (tokens.some(token => token === undefined))
            return false;
        const state = input.state.getSnapshot();
        const text = (state.draft && !state.draft.endsWith('\n') ? '\n' : '') + [reference.text, ...tokens].filter(Boolean).join('\n');
        if (!input.insert({ text, span: { start: state.draft.length, end: state.draft.length, draftRev: state.draftRev } }))
            return false;
        this.applied.add(reference.id);
        return true;
    }
    clear() { this.applied.clear(); }
}
//# sourceMappingURL=video-reference.js.map