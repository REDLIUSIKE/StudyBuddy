import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { memo, useCallback, useMemo } from 'react';
import clsx from 'clsx';
import { CodeBlock, DiffBlock, DisclosureRow, IconInspectOutlineRegular, ReadBlock, SearchBlock, TerminalBlock, TextShimmer, WebBlock, diffTotals, } from '@deepseek-ai/dsh-client-ui-primitives';
import { CHAT_DIFF_MAX_LINES } from "../models/diff-card-model.js";
import { CHAT_READ_MAX_LINES } from "../models/read-card-model.js";
import { CHAT_SEARCH_MAX_LINES } from "../models/search-card-model.js";
import { localizeTerminalCardModel, terminalBlockLabels, } from "../models/terminal-card-model.js";
import { codeToolbarLabels, diffBlockLabels, readBlockLabels, searchBlockLabels, webBlockLabels, } from "../models/primitive-labels.js";
import { formatToolBody, } from "../models/tool-call-model.js";
import { AskQuestionCard } from "./AskQuestionCard.js";
import { ToolDetails } from "./ToolDetails.js";
import css from './ToolRow.module.css';
/** Keep a summary link click from toggling the row; the browser still follows the link. */
function stopLinkClick(event) {
    event.stopPropagation();
}
/** Visually hidden run-state label for color-only running and settlement cues. */
function stateStatus(state, t) {
    switch (state) {
        case 'preparing': return t('row.preparing');
        case 'running': return t('row.running');
        case 'error': return t('row.failed');
        case 'stopped': return t('row.stopped');
        default: return null;
    }
}
/**
 * Render one localized tool summary and lazily mounted result card.
 * Preparation retains the icon, title, and optional tool-name summary without disclosure.
 * @param props - tool state, summary, output, and navigation callbacks.
 * @returns the tool disclosure.
 */
export const ToolRow = memo(function ToolRow({ t, variant, toolName, icon, title, summary, summarySuffix, bodyRaw, output, askQuestion, errorSummary, terminal, diff, read, image, renderSlot, loadImage, search, web, details, state, filePath, filePathLine, onOpenFile, href, inspect, useDisclosure, }) {
    const { expanded, toggle: toggleExpand } = useDisclosure();
    const terminalLabels = useMemo(() => terminalBlockLabels(t), [t]);
    const diffLabels = useMemo(() => diffBlockLabels(t), [t]);
    const readLabels = useMemo(() => readBlockLabels(t), [t]);
    const searchLabels = useMemo(() => searchBlockLabels(t), [t]);
    const webLabels = useMemo(() => webBlockLabels(t), [t]);
    const terminalBody = useMemo(() => terminal === undefined || terminal === null
        ? null
        : localizeTerminalCardModel(terminal, t), [terminal, t]);
    const diffBody = diff ?? null;
    const readBody = read ?? null;
    const imageBody = image !== undefined && image !== null && renderSlot !== undefined && loadImage !== undefined
        ? image
        : null;
    const searchBody = search ?? null;
    const webBody = web ?? null;
    const askQuestionBody = askQuestion ?? null;
    const detailsBody = details ?? null;
    const inputRaw = bodyRaw ?? null;
    const outputText = output ?? null;
    const card = askQuestionBody ?? terminalBody ?? diffBody ?? readBody ?? imageBody ?? searchBody ?? webBody ?? detailsBody;
    const expandable = state !== 'preparing' && (inputRaw !== null || outputText !== null || card !== null);
    const open = expanded && expandable;
    const bodyText = useMemo(() => open && card === null && inputRaw !== null ? formatToolBody(variant, inputRaw) : null, [card, inputRaw, open, variant]);
    const status = stateStatus(state, t);
    const running = state === 'running' || state === 'preparing';
    const normalSummary = terminalBody?.description ?? (open ? detailsBody?.expandedSummary ?? summary : summary);
    // A failure keeps its first result line when available and otherwise turns
    // the ordinary summary red. An interruption turns the tool-owned summary
    // amber while retaining the business icon and hidden state announcement.
    const failureLine = state === 'error' ? errorSummary ?? normalSummary : null;
    const summaryText = failureLine ?? normalSummary;
    // Diff totals remain visible after the optional summary suffix.
    const diffStat = useMemo(() => diffBody === null ? null : diffTotals(diffBody.card.diffs), [diffBody]);
    const settledWithCue = state === 'error' || state === 'stopped';
    const suffix = settledWithCue ? null : summarySuffix ?? null;
    const totals = settledWithCue ? null : diffStat;
    const openFile = useMemo(() => filePath !== undefined && onOpenFile !== undefined && !settledWithCue
        ? (event) => {
            event.stopPropagation();
            if (filePathLine === undefined)
                onOpenFile(filePath);
            else
                onOpenFile(filePath, { line: filePathLine });
        }
        : undefined, [filePath, filePathLine, onOpenFile, settledWithCue]);
    const linkHref = settledWithCue ? undefined : href;
    // Keep Enter/Space on the focused path or URL link from bubbling to the row's
    // keydown handler, which would preventDefault() the key and toggle expand
    // instead of activating the link — the keyboard analogue of the click
    // handlers' stopPropagation. Enter activates both links and Space activates
    // the path button; Space on a URL link does nothing.
    const summaryLinkKeyDown = useCallback((event) => {
        if (event.key === 'Enter' || event.key === ' ')
            event.stopPropagation();
    }, []);
    // The code variant's program renders through CodeBlock (shiki), so only its
    // output joins the IN/OUT card; every other variant's input does too.
    const cardBody = variant === 'code' ? null : bodyText;
    const collapsedContent = useMemo(() => summaryText !== '' && (_jsxs(_Fragment, { children: [_jsx("span", { className: css.sep, "data-shimmer-decoration": true, "aria-hidden": true }), openFile !== undefined ? (_jsx("button", { type: "button", className: css.fileLink, onClick: openFile, onKeyDown: summaryLinkKeyDown, children: _jsx(TextShimmer, { children: summaryText }) })) : linkHref !== undefined ? (_jsx("a", { className: css.fileLink, href: linkHref, target: "_blank", rel: "noopener noreferrer", onClick: stopLinkClick, onKeyDown: summaryLinkKeyDown, children: _jsx(TextShimmer, { children: summaryText }) })) : (_jsx("span", { className: clsx(css.summary, state === 'error' && css.errorSummary, state === 'stopped' && css.stoppedSummary), children: _jsx(TextShimmer, { children: summaryText }) })), suffix !== null && (_jsx(TextShimmer, { className: css.summarySuffix, children: suffix })), totals !== null && (_jsxs(TextShimmer, { className: clsx(css.summarySuffix, css.diffStat), children: [_jsx("span", { className: css.diffAdded, children: `+${totals.added}` }), ' ', _jsx("span", { className: css.diffRemoved, children: `-${totals.removed}` })] }))] })), [summaryLinkKeyDown, linkHref, openFile, state, suffix, totals, summaryText]);
    const expandedContent = useMemo(() => open ? (_jsxs("div", { className: clsx(css.bodyWrap, detailsBody !== null && css.detailsBodyWrap), children: [askQuestionBody !== null
                ? _jsx(AskQuestionCard, { card: askQuestionBody })
                : terminalBody !== null
                    ? (_jsx(TerminalBlock, { ...terminalBody.card, maxLines: Infinity, labels: terminalLabels, className: css.terminalBody }))
                    : diffBody !== null
                        ? _jsx(DiffBlock, { ...diffBody.card, labels: diffLabels, maxLines: CHAT_DIFF_MAX_LINES, className: css.diffBody })
                        : readBody !== null
                            ? _jsx(ReadBlock, { ...readBody, labels: readLabels, maxLines: CHAT_READ_MAX_LINES, className: css.readBody })
                            : imageBody !== null
                                ? (_jsxs("div", { className: css.imageBody, children: [_jsx("div", { className: css.imageLabel, children: imageBody.label }), renderSlot !== undefined && loadImage !== undefined && renderSlot('tool.call.images', {
                                            images: imageBody.images,
                                            loadImage,
                                            align: 'start',
                                        }), _jsx("div", { className: css.imageMeta, children: imageBody.text })] }))
                                : searchBody !== null
                                    ? (_jsxs(_Fragment, { children: [_jsx(SearchBlock, { ...searchBody.card, labels: searchLabels, maxLines: CHAT_SEARCH_MAX_LINES, className: css.searchBody }), searchBody.recovery !== undefined && (_jsx("div", { className: css.searchRecovery, children: searchBody.recovery }))] }))
                                    : webBody !== null
                                        ? _jsx(WebBlock, { ...webBody, labels: webLabels, className: css.webBody })
                                        : detailsBody !== null
                                            ? _jsx(ToolDetails, { model: detailsBody, hasInspect: inspect !== undefined, t: t, onOpenFile: onOpenFile })
                                            : (_jsxs(_Fragment, { children: [variant === 'code' && bodyText !== null && (_jsx("div", { className: css.bodyScroll, children: _jsx(CodeBlock, { code: bodyText, lang: "typescript", copyLabel: t('copy'), copiedLabel: t('copied'), toolbarLabels: codeToolbarLabels(t), className: css.codeBody }) })), (cardBody !== null || outputText !== null) && (_jsxs("div", { className: css.ioCard, children: [cardBody !== null && (_jsxs("div", { className: css.ioSection, children: [_jsx("span", { className: css.ioLabel, children: t('row.input') }), _jsx("span", { className: css.ioText, children: cardBody })] })), cardBody !== null && outputText !== null && (_jsx("span", { className: css.ioDivider, "aria-hidden": true })), outputText !== null && (_jsxs("div", { className: css.ioSection, children: [_jsx("span", { className: css.ioLabel, children: t('row.output') }), _jsx("span", { className: css.ioText, "data-error": state === 'error' || undefined, children: outputText })] }))] }))] })), inspect !== undefined && (_jsxs("button", { type: "button", className: css.inspectButton, onClick: inspect, children: [_jsx(IconInspectOutlineRegular, {}), t('row.inspect')] }))] })) : undefined, [
        open, detailsBody, askQuestionBody, terminalBody, terminalLabels, diffBody, diffLabels, readBody, readLabels,
        imageBody, renderSlot, loadImage, searchBody, searchLabels, webBody, webLabels, inspect, t, onOpenFile,
        variant, bodyText, cardBody, outputText, state,
    ]);
    return (_jsxs("div", { className: css.root, "data-variant": variant, "data-tool": toolName, "data-state": state, children: [status !== null && _jsx("span", { className: css.visuallyHidden, children: status }), _jsx(DisclosureRow, { rowClassName: css.row, leadingClassName: css.leading, titleClassName: css.title, icon: icon, title: title, running: running, open: open, expandable: expandable, expandOnRowClick: true, keepContentWhenOpen: true, onToggle: toggleExpand, collapsedContent: collapsedContent, children: expandedContent })] }));
});
//# sourceMappingURL=ToolRow.js.map