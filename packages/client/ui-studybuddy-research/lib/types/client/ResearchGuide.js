import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/** Illustrated chapters occupy the idle native column without starting research work. */
import { useEffect, useId, useRef, useState } from 'react';
import { Button, Menu, Modal, Tooltip, IconChevronLeftOutlineRegular, IconChevronRightOutlineRegular, IconFlatListOutlineRegular, } from '@deepseek-ai/dsh-client-ui-primitives';
import { researchGuideChapters } from "./research-guide-content.js";
import { researchGuideFigures } from "./research-guide-figures.js";
import css from './ResearchGuide.module.css';
/** @param props - Localized copy and current column visibility. @returns A retained chapter reader with image locations and an expandable figure. */
export function ResearchGuide({ t, visible }) {
    const [page, setPage] = useState(0), [menuOpen, setMenuOpen] = useState(false);
    const [point, setPoint] = useState(0), [zoomOpen, setZoomOpen] = useState(false);
    const [image, setImage] = useState(), [imageFailed, setImageFailed] = useState(false);
    const [retry, setRetry] = useState(0);
    const body = useRef(null), heading = useId(), explanation = useId();
    const chapter = researchGuideChapters[page], last = researchGuideChapters.length - 1;
    const figure = researchGuideFigures[chapter.id], section = chapter.sections[point];
    const loaded = image?.id === figure.id ? image : undefined;
    useEffect(() => { if (!visible) {
        setMenuOpen(false);
        setZoomOpen(false);
    } }, [visible]);
    useEffect(() => { setPoint(0); setZoomOpen(false); if (body.current)
        body.current.scrollTop = 0; }, [page]);
    useEffect(() => {
        if (!visible || loaded)
            return;
        let current = true;
        setImageFailed(false);
        Promise.all([figure.load(), figure.detail?.load()]).then(([main, detail]) => {
            if (current)
                setImage({ id: figure.id, source: main.default, ...(detail ? { detail: detail.default } : {}) });
        }).catch(() => { if (current)
            setImageFailed(true); });
        return () => { current = false; };
    }, [figure, visible, retry, loaded]);
    const move = (delta) => setPage(current => Math.max(0, Math.min(last, current + delta)));
    const onKeyDown = (event) => {
        if (menuOpen || zoomOpen || event.defaultPrevented || event.nativeEvent.isComposing || event.altKey || event.ctrlKey || event.metaKey)
            return;
        if (event.target instanceof HTMLElement && (event.target.isContentEditable || event.target.closest('input,textarea,select,[role="menu"]')))
            return;
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault();
            move(event.key === 'ArrowLeft' ? -1 : 1);
        }
    };
    return _jsxs("section", { className: css.guide, role: "region", "aria-label": t('guideTitle'), hidden: !visible, tabIndex: 0, onKeyDown: onKeyDown, children: [_jsxs("header", { className: css.header, children: [_jsx("span", { children: t('guideTitle') }), _jsx(Menu, { open: menuOpen, onClose: () => setMenuOpen(false), align: "end", portal: true, selectedId: chapter.id, items: researchGuideChapters.map(row => ({ id: row.id, label: t(row.title) })), onSelect: id => { const index = researchGuideChapters.findIndex(row => row.id === id); if (index >= 0)
                            setPage(index); setMenuOpen(false); }, anchor: _jsx(Button, { variant: "ghost", size: "sm", icon: _jsx(IconFlatListOutlineRegular, { size: 16 }), "aria-expanded": menuOpen, "aria-haspopup": "menu", onClick: () => setMenuOpen(open => !open), children: t('guideContents') }) })] }), _jsx("div", { ref: body, className: css.body, children: _jsxs("article", { className: css.chapter, "aria-labelledby": heading, children: [_jsx("p", { className: css.eyebrow, children: t(page === 0 ? 'guideOverviewLabel' : 'guideFeatureLabel') }), _jsx("h2", { id: heading, children: t(chapter.title) }), _jsx("p", { className: css.intro, children: t(chapter.text) }), _jsxs("figure", { className: css.figure, children: [_jsx("div", { className: css.imageFrame, "data-bottom-markers": figure.bottomMarkers, style: { aspectRatio: `${figure.width}/${figure.height}`, maxWidth: (figure.width / figure.height) * 270 }, children: loaded ? _jsxs(_Fragment, { children: [_jsxs(Button, { className: css.imageButton, "aria-label": t('guideExpandImage'), onClick: () => setZoomOpen(true), children: [_jsx("img", { src: loaded.source, alt: t(chapter.title), width: figure.width, height: figure.height, decoding: "async" }), _jsx("span", { className: css.zoomLabel, children: t('guideExpandImage') })] }), figure.points.map((location, index) => _jsx(Tooltip, { label: t(chapter.sections[index].title), side: "top", portal: true, children: _jsx(Button, { className: css.point, style: { left: `${location.x}%`, top: `${location.y}%` }, "aria-label": t('guidePointLabel').replace('{number}', String(index + 1)).replace('{title}', t(chapter.sections[index].title)), "aria-controls": explanation, "aria-pressed": point === index, onClick: () => setPoint(index), children: index + 1 }) }, index))] }) : _jsx("div", { className: css.imagePending, role: "status", children: imageFailed ? _jsxs(_Fragment, { children: [_jsx("span", { children: t('guideImageFailed') }), _jsx(Button, { size: "sm", onClick: () => setRetry(value => value + 1), children: t('retry') })] }) : t('guideImageLoading') }) }), _jsxs("figcaption", { children: [_jsx("span", { className: css.figureKind, children: t(figure.kind === 'snapshot' ? 'guideFigurePhoto' : 'guideFigureDiagram') }), _jsx("span", { children: t('guideImageHelp') })] })] }), _jsx("div", { className: css.locations, children: chapter.sections.map((row, index) => _jsxs(Button, { className: css.location, "data-active": point === index, "aria-pressed": point === index, onClick: () => setPoint(index), children: [_jsx("span", { "aria-hidden": "true", children: index + 1 }), t(row.title)] }, row.title)) }), _jsxs("section", { className: css.explanation, id: explanation, role: "region", "aria-label": t('guideImageExplanation'), "aria-live": "polite", children: [_jsx("h3", { children: t(section.title) }), _jsx("p", { children: t(section.body) }), chapter.id === 'settings-billing' && point === 2 && loaded?.detail && _jsx("img", { className: css.detailImage, src: loaded.detail, alt: t('guideBudgetImage'), width: figure.detail.width, height: figure.detail.height })] })] }, chapter.id) }), _jsx("p", { className: css.hint, children: t('guideOpenProjectHint') }), _jsxs("footer", { className: css.footer, children: [_jsx(Tooltip, { label: t('guidePrevious'), side: "top", portal: true, children: _jsx(Button, { className: css.arrow, "aria-label": t('guidePrevious'), disabled: page === 0, onClick: () => move(-1), children: _jsx(IconChevronLeftOutlineRegular, { size: 22 }) }) }), _jsxs("div", { className: css.position, children: [_jsx("span", { role: "status", "aria-live": "polite", children: t('guidePagePosition').replace('{current}', String(page + 1)).replace('{total}', String(last + 1)) }), _jsx("div", { className: css.dots, "aria-hidden": "true", children: researchGuideChapters.map((row, index) => _jsx("span", { "data-current": index === page }, row.id)) })] }), _jsx(Tooltip, { label: t('guideNext'), side: "top", portal: true, children: _jsx(Button, { className: css.arrow, "aria-label": t('guideNext'), disabled: page === last, onClick: () => move(1), children: _jsx(IconChevronRightOutlineRegular, { size: 22 }) }) })] }), _jsx(Modal, { open: zoomOpen && visible && !!loaded, title: t(chapter.title), description: t(figure.kind === 'snapshot' ? 'guideFigurePhoto' : 'guideFigureDiagram'), onClose: () => setZoomOpen(false), closeLabel: t('guideCloseImage'), ...(css.imageModal === undefined ? {} : { className: css.imageModal }), ...(css.imageModalContent === undefined ? {} : { contentClassName: css.imageModalContent }), children: loaded && _jsx("img", { className: css.enlargedImage, src: loaded.source, alt: t(chapter.title), width: figure.width, height: figure.height }) })] });
}
//# sourceMappingURL=ResearchGuide.js.map