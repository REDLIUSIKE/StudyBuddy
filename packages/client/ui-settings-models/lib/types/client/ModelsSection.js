import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * Models settings section: the provider rows joined from the configurable
 * directory, settings namespaces, and credential states, with one editor
 * card at a time. Rows retain the account-first order supplied by the store
 * and expose only confirmed API-key state through accessible
 * solid configured or missing dots. A whole-section provider without a
 * configured key renders as its open setup card instead of a row, but only in
 * the first-run posture — no provider on the page can serve requests yet — and
 * only until the user closes that card. The add flow is one card behind one
 * button: a mode switch chooses between adopting a dormant directory provider
 * (the catalog select over the provider editor) and declaring a custom model
 * API (the create form). A panel mounts the first time its mode is shown and
 * stays mounted, hidden, while the card is open and its mode stays offered,
 * so switching modes discards neither draft and an unvisited mode costs
 * nothing; the switch holds still while either panel has a write or an
 * endpoint interrogation in flight, since a switch underneath one would
 * orphan the answer. Each card kind owns its own open state, so closing one
 * never discards a draft in another. Every
 * mutation writes through the wire, while a provider removal first requires
 * confirmation; the page re-renders from pushed invalidations or the
 * post-apply reload.
 */
import { useId, useState } from 'react';
import { Button, Modal, SegmentedControl, ModelProviderList, ModelProviderRow, ModelProviderAddButton } from '@deepseek-ai/dsh-client-ui-primitives';
import { CustomProviderCard } from "./CustomProviderCard.js";
import { deriveKeyRef, protocolChoices, providerUsable } from "./store.js";
import { ProviderEditor } from "./ProviderEditor.js";
import styles from './ModelsSection.module.css';
/** Render an editor for either the setup posture or an expanded provider row. */
function renderProviderEditor({ target, ...props }) {
    return (_jsx(ProviderEditor, { provider: target.provider, displayName: target.displayName, settingsPath: target.settingsPath, ...target.declared === true ? { declared: true } : {}, ...props }));
}
/**
 * Remove one user-added provider and its page-managed credential. Credential
 * removal comes first so a second-step failure leaves the provider row visible
 * and the whole operation safely retryable; both unsets are idempotent.
 * The settings removal names the profile rather than rebuilding its whole
 * namespace from a partial view.
 * @param operations - the page's Host operations.
 * @param controller - the page store to refresh.
 * @param target - the provider's settings address and optional managed credential.
 * @returns the failure message, or undefined once the write and reload landed.
 */
export async function removeProviderProfile(operations, controller, target) {
    if (target.credentialRef !== undefined) {
        const credential = await operations.removeCredential(target.credentialRef);
        if (credential !== undefined)
            return credential;
    }
    const written = await operations.writeSettings(target.settingsNs, [{ op: 'unset', path: [...target.settingsPath] }], undefined);
    if (written.kind !== 'written')
        return written.message;
    await controller.load();
    return undefined;
}
/**
 * Whether a whole-section provider still needs its first key: an unconfigured
 * credential opens the setup card instead of showing a row. This is the
 * first-run posture alone — a user who can already reach some provider gets an
 * ordinary row with the missing-key dot, since nothing here is blocking them.
 * @param row - the joined provider row.
 * @param anyUsable - whether any joined row can already serve requests.
 * @returns whether to render the setup card.
 */
export function needsSetup(row, anyUsable) {
    if (anyUsable || row.entry.provider === 'deepseek-account')
        return false;
    if (row.entry.settingsPath.length > 0)
        return false;
    return row.credential?.configured !== true;
}
/**
 * The provider-card seat's credential fact: the reference this page would use
 * for the row — the profile's `apiKeyEnv`, or the page's derived
 * `<ROUTE>_API_KEY` while the profile names none — confirmed configured. The
 * derived half is what keeps the seat consistent with the editor on the
 * add-provider draft, whose dormant row names no reference yet.
 */
function keyConfiguredOf(row) {
    return row.apiKeyEnv !== undefined
        ? row.credential?.configured === true
        : row.derivedCredential?.configured === true;
}
function targetOf(row) {
    const managedRef = deriveKeyRef(row.entry.provider);
    const credentialRef = row.apiKeyEnv === managedRef
        && row.credential?.configured === true
        && row.credential.writable
        ? managedRef
        : undefined;
    return {
        provider: row.entry.provider,
        displayName: row.entry.displayName,
        settingsNs: row.entry.settingsNs,
        settingsPath: row.entry.settingsPath,
        ...credentialRef === undefined ? {} : { credentialRef },
        // Only declared routes may expose route-owned fields.
        ...row.entry.declared === true ? { declared: true } : {},
    };
}
/** Stable visible and accessible identity for one provider target. */
export function providerTargetLabel(target) {
    return target.provider === target.displayName
        ? target.provider
        : `${target.displayName} (${target.provider})`;
}
/** Replace the one provider placeholder in localized destructive-action copy. */
export function providerCopy(template, target) {
    return template.replace('{provider}', () => providerTargetLabel(target));
}
/**
 * Render the Models section content column.
 * @param props - slot-delivered injected dependencies.
 * @returns the section, or null while the shell has not injected yet.
 */
export function ModelsSection(props) {
    const { controller, useSnapshot, operations, schema, t, renderSlot } = props;
    if (controller === undefined || useSnapshot === undefined || operations === undefined
        || schema === undefined || t === undefined)
        return null;
    return _jsx(Loaded, { injected: { controller, useSnapshot, operations, schema, t }, renderSlot: renderSlot });
}
function Loaded({ injected, renderSlot }) {
    const { controller, operations, schema, t } = injected;
    const snapshot = injected.useSnapshot(value => value);
    const state = { ...snapshot, rows: snapshot.rows.map(row => row.entry.provider === 'deepseek-account'
            ? { ...row, entry: { ...row.entry, displayName: t('deepSeekAccount') } } : row) };
    /** A new or failed surface waits for a current snapshot; background refreshes preserve its drafts. */
    const [hasReadySnapshot, setHasReadySnapshot] = useState(state.status === 'ready');
    if (state.status === 'ready' && !hasReadySnapshot)
        setHasReadySnapshot(true);
    if (state.status === 'error' && hasReadySnapshot)
        setHasReadySnapshot(false);
    const [editing, setEditing] = useState(undefined);
    const [addOpen, setAddOpen] = useState(false);
    const [addMode, setAddMode] = useState('catalog');
    /** The modes shown since the add card opened; each keeps its panel mounted. */
    const [visited, setVisited] = useState(() => new Set());
    /** Whether each add panel has a write or an interrogation in flight. */
    const [catalogBusy, setCatalogBusy] = useState(false);
    const [customBusy, setCustomBusy] = useState(false);
    /** Base of the add card's tab and panel ids. */
    const addId = useId();
    const [deleteTarget, setDeleteTarget] = useState(undefined);
    const [deleting, setDeleting] = useState(false);
    const [deleteFailure, setDeleteFailure] = useState(undefined);
    const [savedTarget, setSavedTarget] = useState(undefined);
    const [dismissedSetup, setDismissedSetup] = useState(() => new Set());
    const announceSaved = (target) => {
        // Announced only once the refreshed directory is in the snapshot the
        // notice reads its name from: an apply can rename the route, and the
        // target captured when the card opened still carries the old name.
        void controller.load().then(() => { setSavedTarget(target); });
    };
    /**
     * Close the add card whole. The catalog target is forgotten with it, since
     * `editing` doubles as the row editor's target once the card is closed and a
     * refresh could otherwise open the row of a provider the draft never saved.
     * The busy flags reset here because a panel that closes itself on success
     * unmounts before it can report idle.
     */
    const closeAdd = () => {
        setEditing(undefined);
        setAddOpen(false);
        setCatalogBusy(false);
        setCustomBusy(false);
    };
    const closeEditor = (changed, target) => {
        closeAdd();
        if (changed)
            announceSaved(target);
    };
    /**
     * Close a setup card, which owns none of the state above: the row-editor
     * and add cards each own one of those, so clearing them here would discard
     * a draft the user opened beside this card. Dismissal is this card's own —
     * the provider falls back to an ordinary row for the rest of the session,
     * and reopens through Edit.
     */
    const closeSetup = (changed, target) => {
        setDismissedSetup(previous => new Set([...previous, target.provider]));
        if (changed)
            announceSaved(target);
    };
    const closeDelete = () => {
        if (deleting)
            return;
        setDeleteTarget(undefined);
        setDeleteFailure(undefined);
    };
    const confirmDelete = () => {
        /* v8 ignore next -- the action only renders with a target and is disabled while a deletion is pending */
        if (deleteTarget === undefined || deleting)
            return;
        setDeleting(true);
        setDeleteFailure(undefined);
        void removeProviderProfile(operations, controller, deleteTarget)
            .then((failure) => {
            if (failure !== undefined) {
                setDeleteFailure(failure);
                return;
            }
            setDeleteTarget(undefined);
        })
            .finally(() => { setDeleting(false); });
    };
    if (state.status === 'idle')
        void controller.load();
    if (state.status === 'error') {
        /* v8 ignore next -- an error status always carries text; the fallback satisfies the nullable type */
        const errorText = state.error ?? '';
        return (_jsxs("div", { className: styles['section'], children: [_jsx("p", { className: styles['error'], children: `${t('loadFailed')}: ${errorText}` }), _jsx("button", { type: "button", className: styles['secondaryButton'], onClick: () => { void controller.load(); }, children: t('retry') })] }));
    }
    if (!hasReadySnapshot && state.status !== 'ready') {
        return (_jsxs("div", { className: styles['section'], children: [_jsx("h2", { className: styles['title'], children: t('title') }), _jsx("p", { className: styles['intro'], children: t('intro') })] }));
    }
    // The saved provider as the directory currently names it. The route id is
    // what the apply cannot change, so it is what the notice is keyed by; a row
    // the same apply removed keeps the captured identity, since nothing newer
    // exists to name it with.
    const savedRow = savedTarget === undefined
        ? undefined
        : state.rows.find(row => row.entry.provider === savedTarget.provider);
    const savedIdentity = savedRow === undefined
        ? savedTarget
        : { provider: savedRow.entry.provider, displayName: savedRow.entry.displayName };
    // One fact decides both first-run postures on this page and the onboarding
    // step: whether the user already has a provider to talk to.
    const anyUsable = state.rows.some(providerUsable);
    const configured = state.rows.filter(row => row.configured);
    const configurable = state.rows.filter(row => state.namespaces.has(row.entry.settingsNs));
    const addable = state.rows.flatMap((row) => {
        const namespace = state.namespaces.get(row.entry.settingsNs);
        return namespace === undefined || row.configured ? [] : [{ row, namespace }];
    });
    // Hand-declared routes live in the pi-ai namespace, which is also the only
    // one whose schema names the protocols one may speak; without it mounted
    // there is nothing to declare and the mode is not offered.
    const piAi = state.namespaces.get('llm-pi-ai');
    const protocols = protocolChoices(piAi, schema);
    // Each mode is offered while its namespace is mounted and enabled while it
    // has something to offer; the card shows the chosen mode where both are
    // offered, else the only one there is. A mode's panel is mounted while it is
    // the shown mode or has been shown since the card opened — derived, so a
    // refresh that changes which modes are offered can never leave the card
    // without a panel.
    const catalogOffered = configurable.length > 0;
    const catalogEnabled = addable.length > 0;
    const customOffered = piAi !== undefined;
    const customEnabled = protocols.length > 0;
    const bothOffered = catalogOffered && customOffered;
    const mode = bothOffered ? addMode : customOffered ? 'custom' : 'catalog';
    const mounted = (candidate) => mode === candidate || visited.has(candidate);
    const switchLocked = catalogBusy || customBusy;
    // The catalog draft: the row the user chose, kept through a refresh that
    // adopts or withdraws it elsewhere so a typed key is never discarded, for as
    // long as its namespace can still take the write; else the first row still
    // addable, since the mode can be entered by a refresh as well as by the
    // switch and the button only picks a target when it opens the card.
    const draft = (() => {
        if (!addOpen || !catalogOffered)
            return undefined;
        const kept = editing === undefined ? undefined : state.namespaces.get(editing.settingsNs);
        if (editing !== undefined && kept !== undefined)
            return { target: editing, namespace: kept };
        const first = addable[0];
        return first === undefined ? undefined : { target: targetOf(first.row), namespace: first.namespace };
    })();
    // The draft's directory row, for the card extension seat. A refresh can drop
    // the row mid-draft (the route was adopted or withdrawn elsewhere); the
    // draft card stays while the seat simply has no row to dispatch.
    const addRow = draft === undefined
        ? undefined
        : state.rows.find(row => row.entry.provider === draft.target.provider);
    return (_jsxs("div", { className: styles['section'], children: [_jsx("h2", { className: styles['title'], children: t('title') }), _jsx("p", { className: styles['intro'], children: t('intro') }), !state.writable && state.status === 'ready' ? _jsx("p", { className: styles['notice'], children: t('readOnly') }) : null, savedIdentity === undefined
                ? null
                : (_jsx("p", { className: styles['savedNotice'], role: "status", "aria-live": "polite", children: providerCopy(t('savedProvider'), savedIdentity) })), _jsx(ModelProviderList, { children: configured.map((row) => {
                    const target = targetOf(row);
                    const namespace = state.namespaces.get(target.settingsNs);
                    /* v8 ignore next -- the join marks a row configured only when its namespace resolved */
                    if (namespace === undefined)
                        return null;
                    const error = row.entry.error === undefined
                        ? null
                        : _jsx("p", { role: "alert", className: styles['error'], children: row.entry.error });
                    if (needsSetup(row, anyUsable) && !dismissedSetup.has(row.entry.provider)) {
                        // First-run posture: the provider exists but has no key — the
                        // setup card IS its presence on the page, until the user closes it.
                        return (_jsxs("li", { className: styles['setupCard'], children: [error, renderProviderEditor({
                                    target,
                                    namespace,
                                    schema,
                                    operations,
                                    t,
                                    readOnly: !state.writable,
                                    onClose: (changed) => { closeSetup(changed, target); },
                                }), renderSlot('settings.models.provider-card', { provider: row.entry, configured: row.configured, keyConfigured: keyConfiguredOf(row) }, { entryKey: row.entry.settingsNs })] }, row.entry.provider));
                    }
                    const open = !addOpen && editing?.provider === row.entry.provider;
                    const credentialConfigured = row.credential?.configured === true;
                    const credentialMissing = !credentialConfigured
                        && row.apiKeyEnv !== undefined
                        && row.credential?.configured === false;
                    return (_jsxs(ModelProviderRow, { name: row.entry.displayName, tag: row.entry.declared === true ? t('customTag') : undefined, credential: credentialConfigured || credentialMissing
                            ? { configured: credentialConfigured, label: t(credentialConfigured ? 'credentialConfigured' : 'credentialMissing') }
                            : undefined, editLabel: t('edit'), editAccessibleLabel: providerCopy(t('editProvider'), target), editDisabled: !open && state.status !== 'ready', onEdit: () => {
                            if (!open && controller.store.getSnapshot().status !== 'ready')
                                return;
                            setSavedTarget(undefined);
                            setAddOpen(false);
                            setEditing(open ? undefined : target);
                        }, extraActions: row.removable
                            ? (_jsx("button", { type: "button", className: styles['dangerButton'], "aria-label": providerCopy(t('removeProvider'), target), disabled: !state.writable || state.status !== 'ready', onClick: () => {
                                    if (controller.store.getSnapshot().status !== 'ready')
                                        return;
                                    setSavedTarget(undefined);
                                    setDeleteFailure(undefined);
                                    setDeleteTarget(target);
                                }, children: t('remove') }))
                            : null, children: [error, renderSlot('settings.models.provider-card', { provider: row.entry, configured: row.configured, keyConfigured: keyConfiguredOf(row) }, { entryKey: row.entry.settingsNs }), open
                                ? renderProviderEditor({
                                    target,
                                    namespace,
                                    schema,
                                    operations,
                                    t,
                                    readOnly: !state.writable,
                                    onClose: (changed) => { closeEditor(changed, target); },
                                })
                                : null] }, row.entry.provider));
                }) }), _jsx("div", { className: styles['addBlock'], children: addOpen
                    ? (_jsxs("div", { className: styles['addCard'], children: [_jsxs("div", { className: styles['addModes'], children: [bothOffered
                                        ? (_jsx(SegmentedControl, { id: addId, label: t('addMode'), value: mode, disabled: switchLocked, options: [
                                                {
                                                    value: 'catalog',
                                                    label: t('addCatalog'),
                                                    disabled: !catalogEnabled,
                                                    ...catalogEnabled ? {} : { title: t('addCatalogExhausted') },
                                                },
                                                {
                                                    value: 'custom',
                                                    label: t('addCustom'),
                                                    disabled: !customEnabled,
                                                    ...customEnabled ? {} : { title: t('addCustomUnavailable') },
                                                },
                                            ], onChange: (next) => {
                                                setAddMode(next);
                                                setVisited(previous => new Set([...previous, next]));
                                            } }))
                                        : (_jsx("div", { className: styles['editorHeader'], children: _jsx("span", { className: styles['editorTitle'], children: t(mode === 'catalog' ? 'addCatalog' : 'addCustom') }) })), _jsx("p", { className: styles['advancedHint'], children: t(mode === 'catalog' ? 'addCatalogHint' : 'addCustomHint') })] }), mounted('catalog') && draft !== undefined
                                ? (_jsxs("div", { id: `${addId}-catalog-panel`, ...bothOffered ? { role: 'tabpanel', 'aria-labelledby': `${addId}-catalog` } : {}, hidden: mode !== 'catalog', className: styles['addPanel'], children: [_jsxs("div", { className: styles['field'], children: [_jsx("span", { className: styles['fieldLabel'], children: t('provider') }), _jsx("select", { className: `${styles['input']} ${styles['selectInput']}`, value: draft.target.provider, "aria-label": t('provider'), disabled: catalogBusy, onChange: (event) => {
                                                        const picked = addable.find(candidate => candidate.row.entry.provider === event.target.value);
                                                        /* v8 ignore next -- the select only lists addable rows */
                                                        if (picked === undefined)
                                                            return;
                                                        setEditing(targetOf(picked.row));
                                                    }, children: addable.map(({ row }) => (_jsx("option", { value: row.entry.provider, children: row.entry.displayName }, row.entry.provider))) })] }), _jsx(ProviderEditor, { provider: draft.target.provider, displayName: draft.target.displayName, hideTitle: true, namespace: draft.namespace, schema: schema, settingsPath: draft.target.settingsPath, operations: operations, t: t, readOnly: !state.writable, onClose: (changed) => { closeEditor(changed, draft.target); }, onBusyChange: setCatalogBusy }, draft.target.provider), addRow === undefined
                                            ? null
                                            : renderSlot('settings.models.provider-card', { provider: addRow.entry, configured: addRow.configured, keyConfigured: keyConfiguredOf(addRow) }, { entryKey: addRow.entry.settingsNs })] }))
                                : null, mounted('custom') && piAi !== undefined
                                ? (_jsx("div", { id: `${addId}-custom-panel`, ...bothOffered ? { role: 'tabpanel', 'aria-labelledby': `${addId}-custom` } : {}, hidden: mode !== 'custom', className: styles['addPanel'], children: _jsx(CustomProviderCard, { taken: state.rows.map(row => row.entry.provider), protocols: protocols, revision: piAi.revision, operations: operations, t: t, readOnly: !state.writable, onClose: (changed) => {
                                            closeAdd();
                                            if (changed)
                                                void controller.load();
                                        }, onBusyChange: setCustomBusy }) }))
                                : null] }))
                    : catalogOffered || customOffered
                        ? (_jsx(ModelProviderAddButton, { label: t('add'), disabled: !state.writable || state.status !== 'ready' || (!catalogEnabled && !customEnabled), onClick: () => {
                                if (controller.store.getSnapshot().status !== 'ready')
                                    return;
                                const first = addable[0];
                                const initial = catalogEnabled ? 'catalog' : 'custom';
                                setSavedTarget(undefined);
                                setEditing(first === undefined ? undefined : targetOf(first.row));
                                setAddMode(initial);
                                setVisited(new Set([initial]));
                                setAddOpen(true);
                            } }))
                        : null }), renderSlot('settings.models.footer', {}), _jsx(Modal, { open: deleteTarget !== undefined, onClose: closeDelete, title: deleteTarget === undefined ? '' : providerCopy(t('deleteTitle'), deleteTarget), closeLabel: t('close'), description: deleteTarget === undefined
                    ? ''
                    : providerCopy(deleteTarget.credentialRef === undefined
                        ? t('deleteDescription')
                        : t('deleteDescriptionWithCredential'), deleteTarget), className: styles['deleteDialog'], footer: (_jsxs(_Fragment, { children: [_jsx(Button, { variant: "outline", "data-modal-autofocus": true, disabled: deleting, onClick: closeDelete, children: t('cancel') }), _jsx(Button, { variant: "outline", className: styles['deleteConfirm'], disabled: deleting, onClick: confirmDelete, children: deleteTarget === undefined
                                ? ''
                                : providerCopy(deleting ? t('deleting') : t('deleteConfirm'), deleteTarget) })] })), children: deleteFailure === undefined ? null : _jsx("p", { className: styles['error'], children: deleteFailure }) })] }));
}
//# sourceMappingURL=ModelsSection.js.map