import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/** Read-only Markdown viewer for logged plans and temporary review documents. */
import { useMemo } from 'react';
import { FileTypeIcon, MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives';
import { isReviewPreviewAddress } from "./review-preview.js";
import { planFailureLine } from "./failure-line.js";
import css from './PlanPreview.module.css';
/**
 * Render the submitted plan with its complete Markdown.
 * @param props - Framework-bound tab identity, resource, and copy.
 * @returns the plan document or a localized loading/failure state.
 */
export function PlanPreview({ useTabInfo, useResource, t }) {
    const tab = useTabInfo();
    const resource = useResource(tab.tab.navigation.address);
    const temporary = isReviewPreviewAddress(tab.tab.navigation.address);
    const params = tab.tab.navigation.params;
    const plan = temporary ? (params !== undefined && 'planReview' in params ? params.planReview : undefined) : resource.value;
    const labels = useMemo(() => ({
        code: { copyLabel: t('copy'), copiedLabel: t('copied'), toolbarLabels: { codeLabel: t('codeBlock.title'), wrapLabel: t('codeBlock.wrap'), unwrapLabel: t('codeBlock.unwrap') } },
        footnotes: t('markdown.footnotes'),
    }), [t]);
    if (plan === undefined)
        return (_jsxs("div", { className: css.message, role: "status", children: [temporary ? t('preview.expired') : resource.status === 'none' ? t('preview.unavailable')
                    : resource.status === 'failed' ? t('preview.failed') : t('preview.loading'), !temporary && resource.failure !== undefined && _jsx("p", { children: planFailureLine(t, resource.failure) })] }));
    return (_jsx("section", { className: css.preview, "data-plan-preview": 'callId' in plan ? plan.callId : tab.tab.navigation.address, "aria-label": plan.title, children: _jsx("div", { className: css.document, children: _jsx(MarkdownText, { text: plan.markdown, labels: labels }) }) }));
}
/**
 * Display a plain file icon and the heading in its tab after resource recovery.
 * @param props - Framework-bound tab identity and resource reader.
 * @returns a decorative file icon followed by the recovered title or initial localized label.
 */
export function PlanTitle({ useTabInfo, useResource }) {
    const tab = useTabInfo();
    const resource = useResource(tab.tab.navigation.address);
    const params = tab.tab.navigation.params;
    const plan = isReviewPreviewAddress(tab.tab.navigation.address)
        ? (params !== undefined && 'planReview' in params ? params.planReview : undefined) : resource.value;
    return _jsxs(_Fragment, { children: [_jsx(FileTypeIcon, { kind: "other", size: 16, className: css.titleIcon }), plan?.title ?? tab.tab.title] });
}
//# sourceMappingURL=PlanPreview.js.map