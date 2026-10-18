import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { createPortal } from 'react-dom';
import { writeClipboard } from "./clipboard.js";
import { usePointerGrace } from "./pointer-grace.js";
import { overlayTopMargin } from "./overlay-top-margin.js";
import { TooltipSuppression } from "./Tooltip.js";
import css from './HoverCard.module.css';
/** Preview opacity transition and retained lifetime during dismissal. */
const PREVIEW_FADE_MS = 100;
const PREVIEW_MAX_HEIGHT = 420;
const PREVIEW_INSET = 24;
const INLINE_PREVIEW_WIDTH = 300;
const ANCHOR_GAP = 8;
const VIEWPORT_MARGIN = 8;
/**
 * Render an anchor with a hover-triggered preview card, hidden while a tooltip within the anchor is visible.
 * @param props.anchor - the hover target (rendered in place inside a wrapper span).
 * @param props.content - card content; the pointer may rest on it, so it is
 * readable and selectable, but it carries no dismissal affordance of its own.
 * @param props.openDelayMs - hover dwell before the card shows (default 500).
 * @param props.variant - compact card beside the anchor, or a preview above/below it
 * with 24px side insets, a 420px height cap, frame-top clearance, and 100ms opacity transitions.
 * @param props.widthAnchorRef - optional element whose width and horizontal position size the preview.
 * @param props.inline - keep the anchor in prose; show a contained preview on hover or keyboard focus.
 * @param props.disabled - suppress opening; turning true dismisses an open card.
 * @param props.copyText - optional primary value copied by activation and
 * included in the card's accessible name.
 * @param props.copyLabel - localized accessible activation-label prefix.
 * @param props.copiedLabel - localized visible success label.
 * @returns anchor wrapper with the conditional portaled card.
 */
export function HoverCard({ anchor, content, openDelayMs = 500, disabled = false, copyText, copyLabel, copiedLabel, variant = 'compact', widthAnchorRef, inline = false, }) {
    const rootRef = useRef(null);
    const cardRef = useRef(null);
    const timerRef = useRef(null);
    const copyTimerRef = useRef(null);
    const copyHeightRef = useRef(null);
    const copyEpochRef = useRef(0);
    const copyingRef = useRef(false);
    const mountedRef = useRef(true);
    const [phase, setPhase] = useState('closed');
    const open = phase !== 'closed';
    const closing = phase === 'closing';
    const [pos, setPos] = useState(null);
    const positioned = pos !== null;
    const [copied, setCopied] = useState(false);
    const [suppressed, setSuppressed] = useState(false);
    const clearCopied = useCallback(() => {
        if (copyTimerRef.current !== null) {
            clearTimeout(copyTimerRef.current);
            copyTimerRef.current = null;
        }
        copyHeightRef.current = null;
        setCopied(false);
    }, []);
    const close = useCallback(() => {
        copyEpochRef.current += 1;
        clearCopied();
        setPhase(current => variant === 'preview' && current !== 'closed' ? 'closing' : 'closed');
    }, [clearCopied, variant]);
    const { arm: armClose, cancel: cancelClose } = usePointerGrace(close);
    const clearTimer = () => {
        if (timerRef.current !== null) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    };
    useEffect(() => {
        if (!closing)
            return;
        const timer = setTimeout(() => { setPhase('closed'); }, PREVIEW_FADE_MS);
        return () => { clearTimeout(timer); };
    }, [closing]);
    // Owner disabling mid-hover (menu opened, drag started) starts dismissal.
    useEffect(() => {
        if (!disabled)
            return;
        clearTimer();
        cancelClose();
        close();
    }, [disabled, cancelClose, close]);
    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            copyEpochRef.current += 1;
            clearTimer();
            if (copyTimerRef.current !== null) {
                clearTimeout(copyTimerRef.current);
                copyTimerRef.current = null;
            }
        };
    }, []);
    useEffect(() => {
        if (!open || (variant !== 'preview' && !inline))
            return;
        const dismiss = (event) => {
            if (event.key !== 'Escape')
                return;
            if (inline)
                event.stopPropagation();
            clearTimer();
            cancelClose();
            close();
        };
        window.addEventListener('keydown', dismiss, inline);
        return () => { window.removeEventListener('keydown', dismiss, inline); };
    }, [open, variant, inline, cancelClose, close]);
    // Fixed-position from the anchor rect before paint; track the anchor while
    // open (capture-phase scroll catches nested panes), as in Menu portal mode.
    useLayoutEffect(() => {
        if (!open) {
            setPos(null);
            return;
        }
        const place = () => {
            const wrapper = rootRef.current;
            /* v8 ignore next -- the ref is attached before the layout effect runs and the listeners die with it. */
            if (wrapper === null)
                return;
            const r = wrapper.getBoundingClientRect();
            const h = cardRef.current?.offsetHeight ?? 0;
            if (variant === 'preview') {
                const bounds = widthAnchorRef?.current?.getBoundingClientRect() ?? r;
                const width = Math.max(0, Math.min(bounds.width - PREVIEW_INSET * 2, window.innerWidth - VIEWPORT_MARGIN * 2));
                const topMargin = overlayTopMargin(VIEWPORT_MARGIN);
                const belowTop = Math.max(topMargin, r.bottom + ANCHOR_GAP);
                const above = Math.max(0, r.top - ANCHOR_GAP - topMargin);
                const below = Math.max(0, window.innerHeight - belowTop - VIEWPORT_MARGIN);
                const onTop = above >= Math.min(PREVIEW_MAX_HEIGHT, below);
                const maxHeight = Math.min(PREVIEW_MAX_HEIGHT, onTop ? above : below);
                setPos({
                    left: Math.max(VIEWPORT_MARGIN, Math.min(bounds.left + PREVIEW_INSET, window.innerWidth - width - VIEWPORT_MARGIN)),
                    top: onTop ? Math.max(topMargin, r.top - Math.min(h, maxHeight) - ANCHOR_GAP) : belowTop,
                    width, maxHeight,
                });
                return;
            }
            if (inline) {
                const height = Math.max(h, cardRef.current?.scrollHeight ?? 0);
                const width = Math.max(0, Math.min(INLINE_PREVIEW_WIDTH, window.innerWidth - VIEWPORT_MARGIN * 2));
                const topMargin = overlayTopMargin(VIEWPORT_MARGIN);
                const belowTop = Math.max(topMargin, r.bottom + ANCHOR_GAP);
                const above = Math.max(0, r.top - ANCHOR_GAP - topMargin);
                const below = Math.max(0, window.innerHeight - belowTop - VIEWPORT_MARGIN);
                const onTop = height > below && above > below;
                const maxHeight = onTop ? above : below;
                setPos({
                    left: Math.max(VIEWPORT_MARGIN, Math.min(r.left, window.innerWidth - width - VIEWPORT_MARGIN)),
                    top: onTop ? r.top - ANCHOR_GAP - Math.min(height, maxHeight) : belowTop,
                    width, maxHeight,
                });
                return;
            }
            const top = r.top + h > window.innerHeight - VIEWPORT_MARGIN ? window.innerHeight - h - VIEWPORT_MARGIN : r.top;
            setPos({ left: r.right + ANCHOR_GAP, top });
        };
        place();
        const observer = (variant === 'preview' || inline) && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(place) : null;
        for (const element of [cardRef.current, rootRef.current, widthAnchorRef?.current]) {
            if (element !== null && element !== undefined)
                observer?.observe(element);
        }
        window.addEventListener('scroll', place, true);
        window.addEventListener('resize', place);
        return () => {
            observer?.disconnect();
            window.removeEventListener('scroll', place, true);
            window.removeEventListener('resize', place);
        };
    }, [open, variant, widthAnchorRef, positioned, inline]);
    // The first placement ran before the card mounted (height read 0): once the
    // card's real height is measurable, correct the bottom-edge clamp. The
    // correction converges — a clamped top satisfies the guard, so it runs once.
    useLayoutEffect(() => {
        if (!open || pos === null || variant === 'preview' || inline || suppressed)
            return;
        /* v8 ignore next -- the card is mounted whenever pos is set, so the ref is attached here. */
        const h = cardRef.current?.offsetHeight ?? 0;
        if (pos.top + h > window.innerHeight - VIEWPORT_MARGIN) {
            setPos({ left: pos.left, top: window.innerHeight - h - VIEWPORT_MARGIN });
        }
    }, [open, pos, variant, inline, suppressed]);
    const copy = async (text) => {
        if (copied || copyingRef.current)
            return;
        copyingRef.current = true;
        const copyEpoch = copyEpochRef.current;
        const accepted = await writeClipboard(text);
        copyingRef.current = false;
        const card = cardRef.current;
        if (!accepted || !mountedRef.current || copyEpoch !== copyEpochRef.current || card === null)
            return;
        const height = card.offsetHeight;
        copyHeightRef.current = height > 0 ? height : null;
        setCopied(true);
        copyTimerRef.current = setTimeout(clearCopied, 1000);
    };
    const copyable = copyText !== undefined;
    const dismissFromAnchor = (event) => {
        // Portal content is a React child, but its clicks and text selection do not activate the anchor.
        if (cardRef.current?.contains(event.target))
            return;
        clearTimer();
        cancelClose();
        close();
    };
    const card = open && pos !== null && !suppressed && (_jsx("div", { ref: cardRef, className: clsx(css.card, variant === 'preview' && css.preview, inline && css.media, copyable && css.copyable, copied && css.feedback), "data-closing": closing || undefined, style: {
            ...pos, minHeight: copied && copyHeightRef.current !== null ? copyHeightRef.current : undefined,
            '--dsh-hover-preview-fade': `${PREVIEW_FADE_MS}ms`,
        }, role: copyable ? 'button' : undefined, tabIndex: copyable ? 0 : undefined, "aria-label": copyable ? `${copyLabel}: ${copyText}` : undefined, onClick: copyable
            ? (e) => {
                const selection = window.getSelection();
                if (selection !== null && !selection.isCollapsed) {
                    for (let i = 0; i < selection.rangeCount; i += 1) {
                        if (selection.getRangeAt(i).intersectsNode(e.currentTarget))
                            return;
                    }
                }
                void copy(copyText);
            }
            : undefined, onKeyDown: copyable
            ? (e) => {
                if (e.key !== 'Enter' && e.key !== ' ')
                    return;
                e.preventDefault();
                void copy(copyText);
            }
            : undefined, children: copied ? _jsx("span", { className: css.copied, "aria-hidden": "true", children: copiedLabel }) : content }));
    return (_jsxs("span", { ref: rootRef, className: clsx(css.root, inline && css.inline), onFocus: inline ? (event) => {
            if (!disabled && event.target.matches(':focus-visible')) {
                cancelClose();
                setPhase('open');
            }
        } : undefined, onBlur: inline ? (event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) {
                clearTimer();
                cancelClose();
                close();
            }
        } : undefined, onPointerEnter: (event) => {
            if (disabled || (inline && event.pointerType === 'touch'))
                return;
            // Coming back inside during the grace (the gap, or the card itself)
            // keeps the current card rather than restarting the dwell.
            cancelClose();
            if (open) {
                setPhase('open');
                return;
            }
            clearTimer();
            timerRef.current = setTimeout(() => { setPhase('open'); }, openDelayMs);
        }, onPointerLeave: () => {
            clearTimer();
            // Leaving a closed card schedules a no-op close; only arm while
            // open, matching Menu's shape.
            if (open)
                armClose();
        }, onPointerDownCapture: dismissFromAnchor, onClickCapture: dismissFromAnchor, children: [_jsx(TooltipSuppression.Provider, { value: setSuppressed, children: anchor }), open && !suppressed && copyable && _jsx("span", { className: css.status, role: "status", children: copied ? copiedLabel : '' }), card !== false && createPortal(card, document.body)] }));
}
//# sourceMappingURL=HoverCard.js.map