import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useId, useRef, useState } from 'react';
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store';
import { Button, IconCloseOutlineRegular, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives';
import { bindInspectorKeyboard } from "./keyboard.js";
import { InspectorResizeHandle } from "./resize.js";
import { zh, en } from "./locales.js";
import css from './page.module.css';
const ID = 'inspector.toggle';
function InspectorPage({ t, frontendUrl, close, bindFrame, usePanel }) {
    const state = usePanel(value => value);
    const [height, setHeight] = useState(45);
    const panelId = useId();
    const release = useRef();
    const frameRef = useCallback((frame) => {
        release.current?.();
        release.current = frame === null ? undefined : bindFrame(frame);
    }, [bindFrame]);
    return _jsxs("section", { id: panelId, className: css.panel, style: { '--inspector-height': `${height}dvh` }, hidden: state !== 'visible', "aria-label": t('title'), "data-inspector-panel": true, children: [state === 'visible' && _jsx(InspectorResizeHandle, { height: height, onResize: setHeight, label: t('resize'), panelId: panelId }), _jsxs("header", { className: css.header, children: [_jsx("span", { children: t('title') }), _jsx(Tooltip, { label: t('close'), side: "top", portal: true, children: _jsx(Button, { variant: "ghost", size: "sm", className: css.close, "aria-label": t('close'), onClick: close, icon: _jsx(IconCloseOutlineRegular, { size: 14 }) }) })] }), state !== 'unopened' && _jsx("iframe", { ref: frameRef, className: css.page, src: frontendUrl, title: t('frameTitle'), name: "dsh-nodejs-inspector", referrerPolicy: "no-referrer", "data-inspector-devtools": true })] });
}
/**
 * Register bottom content and its window-local toggle command for one Client source.
 * @param ctx - Inspector context owning the registrations.
 * @param sourceId - Claimed identity of the embedding page's Client source.
 */
export function registerInspectorPage(ctx, sourceId) {
    const query = new URLSearchParams({ disableLocaleInfoBar: 'true', clientSourceId: sourceId });
    const frontendUrl = `inspector/devtools/devtools_app.html?${query}`;
    ctx.effect(() => ctx.locale.register('inspectorPanel', { zh, en }));
    const t = ctx.locale.bind('inspectorPanel');
    ctx.slots.inject('shell.bottom', function* () {
        const panel = createSnapshotStore('unopened');
        let opener;
        const close = () => {
            if (panel.getSnapshot() !== 'visible')
                return;
            panel.set('hidden');
            if (opener?.isConnected)
                opener.focus();
        };
        yield ctx.shortcuts.register({
            id: ID, label: () => t('toggle'), aliases: ['inspector', 'nodejs', 'devtools'],
            defaults: {
                'desktop:macos': { code: 'Period', modifiers: ['primary', 'shift'] },
                'desktop:windows': { code: 'Period', modifiers: ['primary', 'shift'] },
                'desktop:linux': { code: 'Period', modifiers: ['primary', 'shift'] },
                'web:macos': { code: 'Period', modifiers: ['primary', 'shift'] },
                'web:windows': { code: 'Period', modifiers: ['primary', 'shift'] },
                'web:linux': { code: 'Period', modifiers: ['primary', 'shift'] },
            },
            regions: ['page', 'editable', 'terminal'], modals: [],
            resolve: ({ target }) => ({ status: 'handled', run: () => {
                    if (panel.getSnapshot() === 'visible')
                        close();
                    else {
                        opener = target instanceof HTMLElement ? target : undefined;
                        panel.set('visible');
                    }
                } }),
        });
        yield ctx.slots.register({
            name: 'shell.bottom', locale: 'inspectorPanel',
            inject: () => ({
                frontendUrl, close, hooks: { panel },
                bindFrame: frame => bindInspectorKeyboard(frame, () => ctx.shortcuts.catalog.getSnapshot().find(row => row.id === ID)?.binding),
            }),
        }, InspectorPage);
    });
}
//# sourceMappingURL=page.js.map