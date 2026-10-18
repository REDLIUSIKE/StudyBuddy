import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** Office presents retained conversion results and font notices around the shared PDF view. */
import { useEffect } from 'react';
import { Button, FileTypeIcon, classifyFileType } from '@deepseek-ai/dsh-client-ui-primitives';
import { pathPartsOf } from '@deepseek-ai/dsh-util-workspace-path';
import { hostFileOf } from "../rpc.js";
import { LoadingIndicator } from "../LoadingIndicator.js";
import common from '../TextPreview.module.css';
import css from './OfficeBody.module.css';
/**
 * Load one Office revision and preserve its result while its tab remains open.
 * @param props - renderer loading request, tab state, conversion callbacks, and PDF slot.
 * @returns conversion status or the PDF scrollport.
 */
export function OfficeBody(props) {
    const { tab } = props.useTabInfo();
    const { load, retainTab, resourceAddress, t } = props;
    const request = props.content.kind === 'renderer' ? props.content : undefined;
    const revision = request?.revision;
    const held = props.useStore(state => state.byTab[tab.id]);
    const view = held?.revision === revision ? held : undefined;
    const settled = view?.file !== undefined || view?.failure !== undefined;
    useEffect(() => { retainTab(tab.id, tab.signal); }, [retainTab, tab.id, tab.signal]);
    // Metadata may replace callbacks without advancing the content revision.
    useEffect(() => {
        if (request === undefined || settled || tab.signal.aborted)
            return;
        const controller = new AbortController();
        const signal = AbortSignal.any([controller.signal, tab.signal]);
        load(tab.id, request.revision, hostFileOf(resourceAddress), signal, request.loaded, request.failed);
        return () => { controller.abort(); };
    }, [revision, resourceAddress, tab.id, tab.signal, load, settled]);
    const file = view?.file;
    if (request === undefined)
        return null;
    if (view?.failure !== undefined) {
        const { name } = pathPartsOf(resourceAddress);
        return _jsxs("div", { className: common.empty, "data-textpreview-failed": view.failure.code, children: [_jsx(FileTypeIcon, { kind: classifyFileType(name), size: 36 }), _jsx("p", { className: common.emptyLine, children: view.failure.message }), _jsx(Button, { size: "sm", onClick: request.reload, children: t('retry') })] });
    }
    if (file === undefined)
        return _jsx(LoadingIndicator, { label: t('loading') });
    return _jsx("div", { className: css.body, children: props.renderSlot('sidebar.right.tab.document.office.pdf', {
            resourceAddress, content: { kind: 'bytes', data: file.data }, wrap: props.wrap, scrollportRef: props.scrollportRef,
            addResource: props.addResource, setResources: props.setResources,
        }, { entryKey: '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/office', hookContext: props.useTabInfo }) });
}
//# sourceMappingURL=OfficeBody.js.map