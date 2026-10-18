import { jsx as _jsx } from "react/jsx-runtime";
import { IconApiOutlineRegular, IconBrowseOutlineRegular, IconCodeOutlineRegular, IconEditOutlineRegular, IconSearchOutlineRegular, IconSparkleRegular, } from '@deepseek-ai/dsh-client-ui-primitives';
import { readCardModel } from "../models/read-card-model.js";
import { diffCardModel } from "../models/diff-card-model.js";
import { searchCardModel } from "../models/search-card-model.js";
import { terminalCardModel, terminalFailed } from "../models/terminal-card-model.js";
import { webCardModel } from "../models/web-card-model.js";
import { toolRowModel } from "../models/tool-call-model.js";
import { localizeAutoReviewDenial } from "../models/auto-review-denial.js";
import { ToolRow } from "../components/ToolRow.js";
/** Variant leading icons (figma table); all glyphs render at 14 inside the 16px leading box. */
const VARIANT_ICONS = {
    search: _jsx(IconSearchOutlineRegular, { size: 14 }),
    read: _jsx(IconBrowseOutlineRegular, { size: 14 }),
    bash: _jsx(IconApiOutlineRegular, { size: 14 }),
    write: _jsx(IconEditOutlineRegular, { size: 14 }),
    edit: _jsx(IconEditOutlineRegular, { size: 14 }),
    code: _jsx(IconCodeOutlineRegular, { size: 14 }),
    others: _jsx(IconSparkleRegular, { size: 14 }),
};
/** @param props - current tool stage and locale. @returns its preparation or dispatched card. */
export function GenericToolCard({ toolName, block, cwd, home, openFile, inspect, useDisclosure, t }) {
    const model = toolRowModel(toolName, block, cwd, home);
    const autoReview = model.autoReviewDenial === null
        ? null
        : localizeAutoReviewDenial(model.autoReviewDenial, t);
    const terminal = terminalCardModel(block, cwd);
    const read = readCardModel(block, cwd, home);
    const diff = diffCardModel(block);
    const search = searchCardModel(block);
    const web = webCardModel(block);
    // A failing exit status is the terminal card's own error signal (the call
    // itself settles isError:false), surfaced through the row's error summary.
    const state = model.state === 'ok' && terminal !== null && terminalFailed(terminal)
        ? 'error'
        : model.state;
    const singleFile = model.filePath !== undefined;
    return (_jsx(ToolRow, { useDisclosure: useDisclosure, t: t, variant: model.variant, toolName: toolName, icon: VARIANT_ICONS[model.variant], title: t(model.titleKey), summary: model.summary, 
        // Single-file tools never expose an args body — the path link is the only
        // args interaction. A card is not an args body: a read/write/edit row is
        // single-file AND carries a card, so the card expands under the path link.
        bodyRaw: singleFile || autoReview !== null ? null : model.bodyRaw, output: autoReview?.output ?? model.output, errorSummary: autoReview?.summary ?? model.errorSummary, terminal: terminal, diff: diff, read: read, search: search, web: web, state: state, filePath: model.filePath, onOpenFile: singleFile ? openFile : undefined, inspect: inspect }));
}
//# sourceMappingURL=GenericToolCard.js.map