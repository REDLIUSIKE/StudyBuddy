import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** Name-first project creation; directory picking remains an optional parent-owned interaction. */
import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { Button, Input, Modal, Tooltip, IconCloseOutlineRegular, IconFolderCloseRegular, IconPlusOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import css from './CreateProject.module.css';
/**
 * Render the confirmed project's name and optional source-folder form.
 * @param props - localized form copy, directory interaction and Host commands.
 * @returns the modal; closing cancels presentation, not an already committed Host operation.
 */
export function CreateProject(props) {
    const { open, t, canChooseFolder, chooseFolder, registerSource, createProject, onCreated, onClose } = props;
    const [title, setTitle] = useState('');
    const [sources, setSources] = useState([]);
    const [primary, setPrimary] = useState();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const generation = useRef(0);
    const attempt = useRef(undefined);
    useEffect(() => {
        if (!open)
            generation.current++;
        return () => { generation.current++; };
    }, [open]);
    const close = () => { generation.current++; onClose(); };
    const addFolder = async () => {
        const current = generation.current;
        setBusy(true);
        setError(null);
        try {
            const path = await chooseFolder();
            if (path === undefined || current !== generation.current)
                return;
            const source = await registerSource({ path });
            if (current !== generation.current)
                return;
            setSources(existing => existing.some(item => item.sourceId === source.sourceId || item.path === source.path)
                ? existing : [...existing, source]);
            setPrimary(existing => existing ?? source.sourceId);
        }
        catch (reason) {
            console.warn('Project source selection failed', reason);
            if (current === generation.current)
                setError(t('project.sourceFailed'));
        }
        finally {
            if (current === generation.current)
                setBusy(false);
        }
    };
    const submit = async () => {
        if (busy || title.trim() === '')
            return;
        const input = { title: title.trim(), sourceIds: sources.map(source => source.sourceId), ...(primary === undefined ? {} : { primarySourceId: primary }) };
        const fingerprint = JSON.stringify(input);
        if (attempt.current?.fingerprint !== fingerprint) {
            attempt.current = { fingerprint, requestId: crypto.randomUUID() };
        }
        const current = generation.current;
        setBusy(true);
        setError(null);
        try {
            const project = await createProject({ ...input, requestId: attempt.current.requestId });
            if (current !== generation.current)
                return;
            onCreated(project.workspaceId);
            close();
        }
        catch (reason) {
            console.warn('Named project creation failed', reason);
            if (current === generation.current)
                setError(t('project.createFailed'));
        }
        finally {
            if (current === generation.current)
                setBusy(false);
        }
    };
    return (_jsxs(Modal, { headless: true, open: open, onClose: close, title: t('project.create'), className: clsx(css.dialog), children: [_jsxs("header", { className: css.header, children: [_jsx("h2", { className: css.title, children: t('project.create') }), _jsx(Button, { variant: "ghost", "aria-label": t('close'), onClick: close, children: _jsx(IconCloseOutlineRegular, { size: 16 }) })] }), _jsxs("form", { className: css.form, onSubmit: event => { event.preventDefault(); void submit(); }, children: [_jsx(Input, { "data-modal-autofocus": true, value: title, onChange: event => { setTitle(event.target.value); }, disabled: busy, "aria-label": t('project.name'), placeholder: t('project.name'), icon: _jsx(IconFolderCloseRegular, { size: 16 }), className: clsx(css.name) }), _jsxs("section", { className: css.sourceSection, "aria-label": t('project.sources'), children: [_jsx(Tooltip, { label: t('project.automaticDirectory'), children: _jsx("span", { className: css.label, children: t('project.sources') }) }), _jsxs("div", { className: css.sources, children: [sources.length === 0
                                        ? _jsx("p", { className: css.hint, children: t('project.addOnComputer') })
                                        : _jsx("ul", { className: css.list, children: sources.map(source => (_jsxs("li", { className: css.row, children: [_jsx(IconFolderCloseRegular, { size: 16 }), _jsx("span", { className: css.path, children: source.path }), _jsx(Button, { variant: "ghost", disabled: busy, "aria-pressed": primary === source.sourceId, onClick: () => { setPrimary(source.sourceId); }, children: t(primary === source.sourceId ? 'project.primary' : 'project.setPrimary') }), _jsx(Tooltip, { label: t('project.removeSource'), portal: true, children: _jsx("button", { type: "button", className: css.remove, "aria-label": t('project.removeSource'), disabled: busy, onClick: () => {
                                                                const remaining = sources.filter(item => item.sourceId !== source.sourceId);
                                                                setSources(remaining);
                                                                if (primary === source.sourceId)
                                                                    setPrimary(remaining[0]?.sourceId);
                                                            }, children: _jsx(IconCloseOutlineRegular, { size: 14 }) }) })] }, source.sourceId))) }), _jsxs(Button, { variant: "ghost", disabled: busy || !canChooseFolder, onClick: () => { void addFolder(); }, children: [_jsx(IconPlusOutlineRegular, { size: 14 }), t('project.addFolder')] })] })] }), error !== null && _jsx("p", { className: css.error, role: "alert", children: error })] }), _jsxs("footer", { className: css.footer, children: [_jsx(Button, { variant: "ghost", onClick: close, children: t('cancel') }), _jsx(Button, { variant: "primary", disabled: busy || title.trim() === '', onClick: () => { void submit(); }, children: t('project.create') })] })] }));
}
//# sourceMappingURL=CreateProject.js.map