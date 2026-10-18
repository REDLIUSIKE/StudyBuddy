import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * Global plugin management: grouped cards for official configuration and
 * optional bundles, the Installed group's cards for the profile's bundles,
 * their row switches, the install dialog with its guide and folded pnpm
 * output, the uninstall confirmation, and the toasts an action's outcome
 * becomes. A bundle's page lists the rows it contributes as the Host runs
 * them; a plugin's configuration renders on its own page through the slots
 * the page declares.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, IconCheckCircleFillRegular, IconChevronDownOutlineRegular, IconChevronLeftOutlineMedium, IconChevronRightOutlineRegular, IconCloseOutlineMedium, IconDownloadOutlineRegular, IconInfoOutlineRegular, IconPlusOutlineRegular, IconRefreshOutlineRegular, IconTrashOutlineRegular, IconWarningOutlineRegular, Input, Menu, MenuItemButton, Modal, pointerModality, PluginArtworkDefault, PluginArtworkLoop, PluginArtworkSearch, PluginArtworkSubagent, PluginArtworkTerminal, StateDot, Switch, Tag, TerminalBlock, Toast, Tooltip, useAnchoredPosition, useDismissOnOutsidePointer, } from '@deepseek-ai/dsh-client-ui-primitives';
import { rowConfigKey } from "./config-ledger.js";
import { INSTALL_GIT_EXAMPLE, INSTALL_PATH_EXAMPLE } from "./locales.js";
import { asksMirror, githubRecoveryRegistry, isInstallPending, offeredRegistries, rowKey, } from "./manager-store.js";
import { managementText, noticeText, packageText, registryText, rowText } from "./presentation.js";
import css from './PluginManagerPage.module.css';
/** The primary action installs; the adjacent menu offers every add-plugin path. */
function AddPluginMenu({ t, disabled, openInstall, renderSlot, closeSettings }) {
    const [open, setOpen] = useState(false);
    const onDismiss = () => { setOpen(false); };
    return (_jsxs("span", { className: css.addGroup, role: "group", "aria-label": t('addPlugin'), children: [_jsx(Button, { variant: "primary", size: "sm", className: css.addPrimary, icon: _jsx(IconPlusOutlineRegular, { size: 13 }), disabled: disabled, onClick: () => { onDismiss(); openInstall(); }, children: t('addPlugin') }), _jsxs(Menu, { open: open, onClose: onDismiss, align: "end", portal: true, autoFocus: true, listClassName: css.addMenu, anchor: (_jsx(Button, { variant: "primary", size: "sm", className: css.addMore, disabled: disabled, "aria-label": t('chooseAddMethod'), "aria-haspopup": "menu", "aria-expanded": open, onClick: () => { setOpen(value => !value); }, onKeyDown: (event) => {
                        if (!open && event.key === 'ArrowDown') {
                            event.preventDefault();
                            setOpen(true);
                        }
                    }, children: _jsx(IconChevronDownOutlineRegular, { size: 12, "aria-hidden": "true" }) })), children: [_jsx(MenuItemButton, { icon: _jsx(IconDownloadOutlineRegular, { size: 14 }), onSelect: () => { onDismiss(); openInstall(); }, children: _jsxs("span", { className: css.addMenuItem, children: [_jsx("span", { children: t('installExisting') }), _jsx("span", { className: css.addMenuDescription, children: t('installExistingDescription') })] }) }), renderSlot('plugins.add.actions', { onDismiss: () => { onDismiss(); closeSettings(); } })] })] }));
}
/** How long the list marks a package an install just enabled. */
const HIGHLIGHT_MS = 2_400;
/** Built-in profile bundles stay out of this page even when the profile declares them as dependencies. */
const BUILTIN_PROFILE_BUNDLES = new Set([
    '@deepseek-ai/dsh-base',
    '@deepseek-ai/dsh-web-app',
    '@deepseek-ai/dsh-headless',
    '@deepseek-ai/dsh-sdk-app',
    '@deepseek-ai/dsh-acp-app',
    '@deepseek-ai/dsh-sdk-minimal',
]);
/** Display order on the main and full optional plugin lists; new bundles join the main list. */
const EXTENSION_BUNDLES = [
    '@deepseek-ai/dsh-experimental-agent-team-profile',
    '@deepseek-ai/dsh-experimental-voice-input-bundle',
    '@deepseek-ai/dsh-experimental-auto-review',
    '@deepseek-ai/dsh-experimental-inspector-profile',
];
const MORE_BUNDLES = [
    '@deepseek-ai/dsh-experimental-tool-worktree',
    '@deepseek-ai/dsh-experimental-cot-translation-bundle',
    '@deepseek-ai/dsh-experimental-terminal-bundle',
    '@deepseek-ai/dsh-experimental-session-search',
    '@deepseek-ai/dsh-experimental-session-titles-bundle',
    '@deepseek-ai/dsh-experimental-badge-skill-bundle',
    '@deepseek-ai/dsh-experimental-ralph-bundle',
    '@deepseek-ai/dsh-subagent-codex',
    '@deepseek-ai/dsh-subagent-claude-code',
];
function orderPackages(packages, order) {
    const rank = (name) => {
        const index = order.indexOf(name);
        return index < 0 ? order.length : index;
    };
    return [...packages].sort((a, b) => rank(a.name) - rank(b.name));
}
/** How long a toast holds: long enough to read a failure that names what broke. */
function toastHoldMs(text) {
    return Math.min(8_000, Math.max(3_000, text.length * 80));
}
const PHASE_KEYS = {
    pending: 'rowPhasePending',
    loading: 'rowPhaseLoading',
    active: 'rowPhaseActive',
    failed: 'rowPhaseFailed',
    unloading: 'rowPhaseUnloading',
};
/** Status dot naming a root-fiber phase; loading and unloading are live transitions. */
const PHASE_STATES = {
    pending: 'idle',
    loading: 'ongoing',
    active: 'done',
    failed: 'error',
    unloading: 'ongoing',
};
/** The count line over a pack's components: the total, then only the states that occur. */
function partsSummary(rows, t) {
    const failed = rows.filter(row => row.phase === 'failed').length;
    const off = rows.filter(row => !row.enabled).length;
    const running = rows.filter(row => row.enabled && row.phase === 'active').length;
    return [
        t('partsCountTotal', { count: String(rows.length) }),
        ...running > 0 ? [t('partsCountRunning', { count: String(running) })] : [],
        ...off > 0 ? [t('partsCountOff', { count: String(off) })] : [],
        ...failed > 0 ? [t('partsCountFailed', { count: String(failed) })] : [],
    ].join(' · ');
}
/** Rows beyond this count get a filter box above the list. */
const ROW_FILTER_THRESHOLD = 10;
/** The size the 36-viewBox plugin artwork renders at inside a card's 48px frame. */
const CARD_ARTWORK_SIZE = 36;
/** The size the artwork renders at inside a row's 40px frame. */
const ROW_ARTWORK_SIZE = 30;
/** The artwork of the official plugins that registered their configuration, by registration id. */
const ITEM_ARTWORK = new Map([
    ['shell', PluginArtworkTerminal],
    ['agent-loop', PluginArtworkLoop],
    ['subagent', PluginArtworkSubagent],
    ['web-search', PluginArtworkSearch],
]);
/** An official plugin's card and page artwork; plugins without their own get the default. */
function itemArtwork(id) {
    const Artwork = ITEM_ARTWORK.get(id) ?? PluginArtworkDefault;
    return _jsx(Artwork, { size: CARD_ARTWORK_SIZE });
}
/** Manifest images remain isolated from the page DOM; a failed decode keeps the position's default artwork. */
function PackageArtwork({ src, row = false, size = row ? ROW_ARTWORK_SIZE : CARD_ARTWORK_SIZE }) {
    const [failedSource, setFailedSource] = useState();
    const Fallback = row ? PluginArtworkSubagent : PluginArtworkDefault;
    return src === undefined || src === failedSource
        ? _jsx(Fallback, { size: size })
        : _jsx("img", { className: css.packageImage, src: src, width: size, height: size, alt: "", onError: () => { setFailedSource(src); } });
}
/** A row's switch: locked, saying why, when the Host refuses to address the row through the profile patch. */
function RowSwitch({ row, title, t, busy, onChange }) {
    const locked = row.readOnlyReason !== undefined || row.entryId === undefined;
    return (_jsx(Switch, { checked: row.enabled, label: t('partToggle', { name: title }), disabled: busy || locked, ...row.readOnlyReason === undefined ? {} : { title: managementText({ code: row.readOnlyReason }, t) }, onChange: onChange }));
}
/** What a row's state line says: off, or the phase its fiber is in. */
function rowStateText(row, t) {
    if (!row.enabled)
        return t('partOff');
    return row.phase === null ? t('rowStateIdle') : t(PHASE_KEYS[row.phase]);
}
/** The dot beside a row: its fiber phase, or idle. */
function rowDotState(row) {
    if (!row.enabled || row.phase === null)
        return 'idle';
    return PHASE_STATES[row.phase];
}
/** A Host metadata diagnostic does not change the package's management permissions. */
function MetadataError({ error, t }) {
    return error === undefined ? null : _jsx("p", { className: css.reason, role: "status", "data-package-meta-error": true, children: t('metadataError', { error }) });
}
/**
 * A pack's rows as a list in the order the pack declares them: a state dot,
 * the row id, one line saying its state, a configure control for a row that
 * registered a page, and, when the pack is on, a switch. A pack like base
 * carries close to a hundred rows, so a long list gets a filter.
 */
function RowsSection({ rows, t, resolveText, toggle, configure }) {
    const [filter, setFilter] = useState('');
    const query = filter.trim().toLowerCase();
    const localized = rows.map(row => ({ row, ...rowText(row, resolveText) }));
    const shown = query === '' ? localized : localized.filter(({ row, title, description }) => [title, description, row.rowId, row.moduleName].some(value => value?.toLowerCase().includes(query)));
    return (_jsxs("section", { className: css.detailSection, "data-plugin-rows": true, children: [_jsxs("div", { className: css.sectionHead, children: [_jsx("h4", { className: css.sectionTitle, children: t('partsLabel') }), rows.length === 0 ? null : _jsx("span", { className: css.sectionCount, children: partsSummary(rows, t) })] }), rows.length === 0 ? _jsx("p", { className: css.status, children: t('partsEmpty') }) : null, rows.length > ROW_FILTER_THRESHOLD
                ? (_jsx(Input, { type: "search", className: css.partsFilter, placeholder: t('partsFilter'), "aria-label": t('partsFilter'), value: filter, onChange: (event) => { setFilter(event.target.value); } }))
                : null, rows.length > 0 && shown.length === 0 ? _jsx("p", { className: css.status, children: t('partsFilterEmpty') }) : null, shown.length === 0
                ? null
                : (_jsx("ul", { className: css.rows, children: shown.map(({ row, title, description }) => (_jsxs("li", { className: css.row, "data-plugin-row": row.entryId ?? row.rowId, ...row.phase === 'failed' ? { 'data-state': 'failed' } : row.enabled ? {} : { 'data-state': 'off' }, children: [_jsxs("div", { className: css.rowLine, children: [_jsx("span", { className: css.rowIcon, "aria-hidden": "true", children: _jsx(PackageArtwork, { src: row.meta?.icon, row: true }, row.meta?.icon) }), _jsxs("div", { className: css.rowMain, children: [configure?.has(row) === true
                                                ? (_jsxs("button", { type: "button", className: css.rowOpen, "aria-label": t('configureRow', { name: title }), onClick: () => { configure.open(row); }, children: [_jsx("span", { className: css.rowId, children: title }), _jsx(IconChevronRightOutlineRegular, { className: css.rowOpenIcon, "aria-hidden": "true" })] }))
                                                : _jsx("span", { className: css.rowId, children: title }), description === undefined ? null : _jsx("span", { className: css.rowModule, children: description }), title === row.rowId ? null : _jsx("code", { className: css.rowModule, children: row.rowId }), title === row.moduleName ? null : _jsx("code", { className: css.rowModule, children: row.moduleName })] }), _jsxs("span", { className: css.rowState, children: [_jsx(StateDot, { state: rowDotState(row) }), rowStateText(row, t)] }), toggle === undefined
                                        ? null
                                        : _jsx(RowSwitch, { row: row, title: title, t: t, busy: toggle.busy(row), onChange: (enabled) => { toggle.onSetEnabled(row, enabled); } })] }), _jsx(MetadataError, { error: row.meta?.error, t: t })] }, row.rowId))) }))] }));
}
/** Declared install source and versions; unavailable files retain their recorded dependency spec. */
function SourceSection({ pkg, t }) {
    if (pkg.source === undefined && !pkg.installed && pkg.availability === 'installation' && !pkg.optional)
        return null;
    return (_jsxs("section", { className: css.detailSection, "data-plugin-source": true, children: [_jsx("h4", { className: css.sectionTitle, children: t('sourceTitle') }), _jsxs("dl", { className: css.facts, children: [_jsxs("div", { children: [_jsx("dt", { children: t('sourceSpec') }), _jsx("dd", { children: pkg.source !== undefined ? _jsx("code", { children: pkg.source }) : pkg.availability === 'missing'
                                    ? t(pkg.installed ? 'statusMissingFiles' : 'sourceNotInstalled') : t('sourceBuiltIn') })] }), pkg.version === undefined
                        ? null
                        : (_jsxs("div", { children: [_jsx("dt", { children: t('sourceVersion') }), _jsx("dd", { children: pkg.version })] })), pkg.installTarget === undefined ? null : (_jsxs(_Fragment, { children: [_jsxs("div", { children: [_jsx("dt", { children: t('sourceTargetSpec') }), _jsx("dd", { children: _jsx("code", { children: pkg.installTarget.spec }) })] }), _jsxs("div", { children: [_jsx("dt", { children: t('sourceTargetVersion') }), _jsx("dd", { children: pkg.installTarget.version })] })] }))] })] }));
}
/**
 * A bundle's enable switch on its card and its page: locked, saying why, for
 * one the Host protects; off and locked for one it cannot read.
 */
function EnableSwitch({ pkg, title, t, busy, onSetEnabled }) {
    return (_jsx(Switch, { checked: pkg.enabled, label: t('enableToggle', { name: title }), disabled: busy || pkg.readOnlyReason !== undefined || (!pkg.enabled && pkg.error !== undefined && !(pkg.availability === 'missing' && pkg.installTarget !== undefined)), ...pkg.readOnlyReason === undefined ? {} : { title: managementText({ code: pkg.readOnlyReason }, t) }, onChange: onSetEnabled }));
}
/** The status one card carries: running, off, or a problem the Host reported. */
function packageStatus(pkg) {
    if (pkg.error !== undefined)
        return 'problem';
    return pkg.enabled ? 'running' : 'disabled';
}
/** The head every card shares: the artwork, the name that opens the page beside its tags, its one-liner, and what sits at the end. */
function CardHead({ title, t, onOpen, icon, tags, description, end }) {
    const descriptionId = useId();
    return (_jsxs("div", { className: css.cardHead, children: [_jsx("span", { className: css.cardIcon, "aria-hidden": "true", children: icon }), _jsxs("div", { className: css.cardMain, children: [_jsxs("div", { className: css.titleRow, children: [_jsx("button", { type: "button", className: `${css.cardTitle} ${css.cardOpen}`, "aria-label": t('openDetail', { name: title }), "aria-describedby": description === undefined ? undefined : descriptionId, onClick: onOpen, children: title }), tags] }), description === undefined ? null : _jsx("span", { className: css.cardDesc, id: descriptionId, children: description })] }), end === undefined ? null : _jsx("div", { className: css.cardEnd, children: end })] }));
}
/** First-read placeholders share the core configuration group's card and text-line layout. */
function ListSkeleton({ label }) {
    return (_jsxs("section", { className: css.group, role: "status", "aria-label": label, "data-plugin-loading": true, children: [_jsx("div", { className: css.groupHead, "aria-hidden": "true", children: _jsx("span", { className: `${css.groupTitle} ${css.skeletonText} ${css.skeletonHeading}`, children: _jsx("span", { className: `${css.skeletonFill} ${css.skeletonBar}` }) }) }), _jsx("ul", { className: css.cards, "aria-hidden": "true", children: [0, 1, 2, 3].map(index => (_jsx("li", { className: css.card, children: _jsxs("div", { className: css.cardHead, children: [_jsx("span", { className: `${css.cardIcon} ${css.skeletonFill} ${css.skeletonIcon}` }), _jsxs("div", { className: css.cardMain, children: [_jsx("div", { className: css.titleRow, children: _jsx("span", { className: `${css.cardTitle} ${css.skeletonText} ${css.skeletonTitle}`, children: _jsx("span", { className: `${css.skeletonFill} ${css.skeletonBar}` }) }) }), _jsx("span", { className: `${css.cardDesc} ${css.skeletonText} ${css.skeletonDescription}`, children: _jsx("span", { className: `${css.skeletonFill} ${css.skeletonBar}` }) })] }), _jsx("div", { className: `${css.cardEnd} ${css.skeletonActions}` })] }) }, index))) })] }));
}
/** The top every page shares: the crumb that leads back, then the icon with the page's actions at its right. */
function DetailTop({ crumbLabel, crumbText, onBack, icon, actions }) {
    return (_jsxs("div", { className: css.detailTop, "data-window-drag": true, children: [_jsxs("button", { type: "button", className: css.crumb, "aria-label": crumbLabel, onClick: onBack, children: [_jsx(IconChevronDownOutlineRegular, { className: css.crumbIcon, "aria-hidden": "true" }), _jsx("span", { children: crumbText })] }), _jsxs("div", { className: css.detailHead, children: [_jsx("span", { className: css.cardIcon, "aria-hidden": "true", children: icon }), actions] })] }));
}
function updateAvailable(pkg) {
    const target = pkg.installTarget;
    if (!pkg.installed || pkg.availability === 'installation' || target === undefined)
        return false;
    return pkg.version !== target.version
        || ((target.spec.startsWith('link:') || pkg.source?.startsWith('link:') === true) && pkg.source !== target.spec);
}
/** One package as a card that opens its page: its name, its one-liner, its tags, and its bundle switch. */
function PackageCard({ pkg, t, resolveText, busy, highlighted, onOpen, onSetEnabled }) {
    const { title, description, beta } = packageText(pkg, resolveText);
    const status = packageStatus(pkg);
    return (_jsxs("li", { className: `${css.card} ${css.cardLink}`, "data-plugin-package": pkg.name, "data-plugin-status": status, ...highlighted ? { 'data-plugin-highlight': '' } : {}, children: [_jsx(CardHead, { title: title, t: t, onOpen: onOpen, icon: _jsx(PackageArtwork, { src: pkg.meta?.icon }, pkg.meta?.icon), tags: (_jsxs(_Fragment, { children: [beta ? _jsx(Tag, { className: css.statusTag, tone: "info", children: t('statusBeta') }) : null, status === 'problem' ? _jsx(Tag, { className: css.statusTag, tone: "danger", children: t('statusProblem') }) : null, pkg.availability === 'missing' ? _jsx(Tag, { className: css.statusTag, children: t(pkg.installed ? 'statusMissingFiles' : 'statusNotInstalled') }) : null, updateAvailable(pkg) ? _jsx(Tag, { className: css.statusTag, tone: "info", children: t('statusUpdateAvailable') }) : null] })), description: description, end: _jsx(EnableSwitch, { pkg: pkg, title: title, t: t, busy: busy, onSetEnabled: onSetEnabled }) }), _jsx(MetadataError, { error: pkg.meta?.error, t: t })] }));
}
/**
 * One official plugin as a card that opens its page: its icon, its title from
 * the registration, and the one-liner the entry renders in its summary view.
 */
function ItemCard({ item, t, onOpen, renderSlot }) {
    return (_jsx("li", { className: `${css.card} ${css.cardLink}`, "data-plugin-item": item.id, children: _jsx(CardHead, { title: item.label, t: t, onOpen: onOpen, icon: itemArtwork(item.id), description: renderSlot('plugins.item', { view: 'summary' }, { only: item.id }) }) }));
}
/** One row as the detail slots see it. */
function rowRef(row) {
    return { rowId: row.rowId, moduleName: row.moduleName, enabled: row.enabled };
}
/** One bundle as the detail slots see it. */
function packageRef(pkg) {
    return {
        name: pkg.name,
        ...pkg.version === undefined ? {} : { version: pkg.version },
        installed: pkg.installed,
        availability: pkg.availability,
        official: pkg.official,
        enabled: pkg.enabled,
        rows: pkg.rows.map(rowRef),
    };
}
/**
 * An official plugin's page: the crumb back to the cards, its icon with the
 * contributed actions, its title with the contributed badges over its
 * one-liner, the form the entry renders, and the contributed sections.
 */
function ItemDetail({ item, t, onBack, renderSlot, form }) {
    const subject = { kind: 'item', id: item.id };
    return (_jsxs("div", { className: css.detail, "data-plugin-item-detail": item.id, children: [_jsx(DetailTop, { crumbLabel: t('backToList'), crumbText: t('crumbRoot'), onBack: onBack, icon: itemArtwork(item.id), actions: _jsx("div", { className: css.detailActions, children: renderSlot('plugins.detail.actions', { subject }) }) }), _jsxs("div", { className: css.detailMain, children: [_jsxs("div", { className: css.titleRow, children: [_jsx("h3", { className: css.detailTitle, children: item.label }), renderSlot('plugins.detail.badge', { subject })] }), _jsx("p", { className: css.detailDesc, children: renderSlot('plugins.item', { view: 'summary' }, { only: item.id }) })] }), _jsxs("div", { className: css.detailSections, children: [_jsx("section", { className: css.detailSection, "data-plugin-config": true, children: renderSlot('plugins.item', { view: 'page', form }, { only: item.id }) }), renderSlot('plugins.detail.section', { subject })] })] }));
}
/**
 * A row's configuration page keeps its technical identity beside local package
 * text and the form supplied by its configuration entry.
 */
function RowDetail({ pkg, row, t, resolveText, onBack, renderSlot, form }) {
    const { title } = packageText(pkg, resolveText);
    const { title: rowTitle, description } = rowText(row, resolveText);
    const key = rowConfigKey(pkg.name, row.rowId);
    const subject = { kind: 'row', pkg: packageRef(pkg), row: rowRef(row) };
    return (_jsxs("div", { className: css.detail, "data-plugin-row-detail": key, children: [_jsx(DetailTop, { crumbLabel: t('backToPackage', { name: title }), crumbText: title, onBack: onBack, icon: _jsx(PackageArtwork, { src: row.meta?.icon, row: true, size: CARD_ARTWORK_SIZE }, row.meta?.icon), actions: _jsx("div", { className: css.detailActions, children: renderSlot('plugins.detail.actions', { subject }) }) }), _jsxs("div", { className: css.detailMain, children: [_jsxs("div", { className: css.titleRow, children: [_jsx("h3", { className: css.detailTitle, children: rowTitle }), renderSlot('plugins.detail.badge', { subject })] }), rowTitle === row.rowId ? null : _jsx("p", { className: css.detailName, children: _jsx("code", { children: row.rowId }) }), _jsx("p", { className: css.detailName, children: _jsx("code", { children: row.moduleName }) }), _jsx("p", { className: css.detailDesc, children: description ?? renderSlot('plugins.row.config', { view: 'summary' }, { entryKey: key }) })] }), _jsx(MetadataError, { error: row.meta?.error, t: t }), _jsxs("div", { className: css.detailSections, "data-plugin-config": true, children: [renderSlot('plugins.row.config', { view: 'page', form }, { entryKey: key }), renderSlot('plugins.detail.section', { subject })] })] }));
}
/**
 * One package's page: the crumb back to the list; its icon with its switch
 * and, for a package the profile installed or a selection the Host can remove, uninstall; its title beside its
 * version tag, its beta tag, and its problem tag; the package name the title
 * stands for; its one-liner; the Host's problem when it reports one; the
 * configuration the bundle registered for itself; its rows with their switches
 * and configure controls; and where it comes from.
 */
function PackageDetail({ pkg, t, resolveText, busy, rowBusy, configured, configure, renderSlot, inMore, onBack, onSetEnabled, onUninstall, onUpdate, onSetRowEnabled, }) {
    const { title, description, beta } = packageText(pkg, resolveText);
    const status = packageStatus(pkg);
    const subject = { kind: 'bundle', pkg: packageRef(pkg) };
    return (_jsxs("div", { className: css.detail, "data-plugin-detail": pkg.name, children: [_jsx(DetailTop, { crumbLabel: inMore ? t('backToPackage', { name: t('moreTitle') }) : t('backToList'), crumbText: t(inMore ? 'moreTitle' : 'crumbRoot'), onBack: onBack, icon: _jsx(PackageArtwork, { src: pkg.meta?.icon }, pkg.meta?.icon), actions: (_jsxs("div", { className: css.detailActions, children: [renderSlot('plugins.detail.actions', { subject }), updateAvailable(pkg) ? (_jsx(Button, { variant: "outline", size: "sm", icon: _jsx(IconRefreshOutlineRegular, { size: 13 }), disabled: busy, "aria-label": t('updateLabel', { name: title }), onClick: onUpdate, children: t('update') })) : null, pkg.installed || pkg.removable
                            ? (_jsx(Button, { variant: "outline", size: "sm", className: css.danger, icon: _jsx(IconTrashOutlineRegular, { size: 13 }), "aria-label": t('uninstallLabel', { name: title }), disabled: busy || !pkg.removable || pkg.readOnlyReason !== undefined, onClick: onUninstall, children: t('uninstall') }))
                            : null, _jsx(EnableSwitch, { pkg: pkg, title: title, t: t, busy: busy, onSetEnabled: onSetEnabled })] })) }), _jsxs("div", { className: css.detailMain, children: [_jsxs("div", { className: css.titleRow, children: [_jsx("h3", { className: css.detailTitle, children: title }), pkg.version === undefined ? null : _jsx(Tag, { className: css.versionTag, tone: "neutral", children: t('versionTag', { version: pkg.version }) }), beta ? _jsx(Tag, { className: css.statusTag, tone: "info", children: t('statusBeta') }) : null, status === 'problem' ? _jsx(Tag, { className: css.statusTag, tone: "danger", children: t('statusProblem') }) : null, pkg.availability === 'missing' ? _jsx(Tag, { className: css.statusTag, children: t(pkg.installed ? 'statusMissingFiles' : 'statusNotInstalled') }) : null, updateAvailable(pkg) ? _jsx(Tag, { className: css.statusTag, tone: "info", children: t('statusUpdateAvailable') }) : null, renderSlot('plugins.detail.badge', { subject })] }), _jsx("p", { className: css.detailName, children: _jsx("code", { "data-plugin-name": true, children: pkg.name }) }), description === undefined ? null : _jsx("p", { className: css.detailDesc, children: description })] }), _jsx(MetadataError, { error: pkg.meta?.error, t: t }), pkg.error === undefined ? null : _jsxs("p", { className: css.reason, role: "status", children: [t('reasonLabel'), ": ", managementText(pkg.error, t)] }), pkg.readOnlyReason === undefined ? null : _jsx("p", { className: css.reason, role: "status", children: managementText({ code: pkg.readOnlyReason }, t) }), _jsxs("div", { className: css.detailSections, children: [configured
                        ? (_jsx("section", { className: css.detailSection, "data-plugin-config": true, children: renderSlot('plugins.bundle.config', { view: 'page' }, { entryKey: pkg.name }) }))
                        : null, pkg.availability === 'missing' ? null : (_jsx(RowsSection, { rows: pkg.rows, t: t, resolveText: resolveText, toggle: pkg.enabled ? { busy: row => busy || rowBusy(row), onSetEnabled: onSetRowEnabled } : undefined, configure: configure })), _jsx(SourceSection, { pkg: pkg, t: t }), renderSlot('plugins.detail.section', { subject })] })] }));
}
/** Output lines an install run's terminal shows before its middle folds: the first and last six of a long pnpm log. */
const INSTALL_TERMINAL_LINES = 12;
/** The install terminal's display copy, from the tab's dictionary. */
function terminalLabels(t) {
    return {
        commandLine: line => t('terminalCommandLine', { n: String(line) }),
        /* v8 ignore next -- the Host reports a killed pnpm as a null exit code, never a signal name; the label interface needs one */
        signal: signal => t('terminalSignal', { signal }),
        exitCode: code => t('terminalExitCode', { code: String(code) }),
        noExitCode: t('terminalNoExitCode'),
        running: t('terminalRunning'),
        failed: t('terminalFailed'),
        done: t('terminalDone'),
        copy: t('terminalCopy'),
        copied: t('terminalCopied'),
        noOutput: t('terminalNoOutput'),
        collapseAria: t('terminalCollapseAria'),
        collapse: t('terminalCollapse'),
        expandAria: hidden => t('terminalExpandAria', { n: String(hidden) }),
        expand: hidden => t('terminalExpand', { n: String(hidden) }),
    };
}
/** The sentence under the field for a spec the check refused. */
const INPUT_PROBLEM_KEYS = {
    'invalid-spec': 'installProblemInvalid',
    'already-installed': 'installProblemInstalled',
    'shipped': 'installProblemShipped',
    'not-found': 'installProblemNotFound',
    'not-a-package': 'installProblemNotPackage',
    'not-a-bundle': 'installProblemNotBundle',
    'network': 'installProblemNetwork',
    'unknown': 'installProblemUnknown',
};
/** The spec form the install guide shows, with an example the person can drop into the field. */
const GUIDE_EXAMPLES = [
    { key: 'id', titleKey: 'installGuideIdTitle', exampleKey: 'installGuideIdExample', hintKey: 'installGuideIdHint' },
];
/** The one-line reading of a classified pnpm failure. */
const FAILURE_KIND_KEYS = {
    'pnpm-missing': 'installFailurePnpmMissing',
    'timeout': 'installFailureTimeout',
    'not-found': 'installFailureNotFound',
    'no-matching-version': 'installFailureNoMatchingVersion',
    'network': 'installFailureNetwork',
    'disk-full': 'installFailureDiskFull',
    'permission': 'installFailurePermission',
    'build-blocked': 'installFailureBuildBlocked',
    'integrity': 'installFailureIntegrity',
    'unknown': 'installFailureGeneric',
};
/** The heading of each screen past the spec. */
const SCREEN_TITLE_KEYS = {
    starting: 'installStarting',
    running: 'installingTitle',
    cancelling: 'installCancelling',
    applying: 'installApplying',
    unconfirmed: 'installUnconfirmedTitle',
    unknown: 'installUnknownTitle',
    done: 'installedTitle',
    failed: 'installFailedTitle',
};
/** What the spec's kind reads as when the package carries no description of its own. */
const SUBJECT_KIND_KEYS = {
    registry: undefined,
    path: 'installSubjectPath',
    git: 'installSubjectGit',
    tarball: 'installSubjectTarball',
};
/** The registries asked, by name, in the dictionary's list form. */
function registryList(registries, t, resolved) {
    return registries.map(registry => registryText(registry, t, resolved).name).join(t('registryListSeparator'));
}
/** An option's name with its host in tertiary text, unless the host is the name. */
function registryOption(registry, t, resolved) {
    const { name, host } = registryText(registry, t, resolved);
    return name === host ? name : _jsxs(_Fragment, { children: [name, ' ', _jsx("span", { className: css.registryHint, children: host })] });
}
/**
 * The failed screen's one line: a pnpm failure by its kind, a refusal by its
 * code, any other failure in the Host's words; the run's output stays behind the details.
 * A run the Host laid at the spec's own host says so; one it laid at a registry
 * names every registry asked when there were several.
 */
function failureText(failure, t, install) {
    if (failure === null)
        return t('installFailureGeneric');
    // A compatibility refusal is the package's own answer, whatever pnpm's exit classified the run as.
    if (failure.code === 'incompatible-version') {
        const incompatible = failure.incompatible === undefined ? {} : { incompatible: failure.incompatible };
        return managementText({ code: failure.code, installing: true, ...incompatible }, t);
    }
    // Blocked scripts the Host could not name leave the person to allow them in the profile's pnpm settings by hand.
    if (failure.kind === 'build-blocked' && !failure.pendingBuilds?.length)
        return t('installFailureBuildBlockedManual');
    const host = install?.subject?.host;
    if (failure.failedAt === 'spec-host' && host !== undefined)
        return t('installFailureNetworkHost', { host });
    const asked = install?.attempts?.registries ?? [];
    if (failure.failedAt === 'registry' && (failure.kind === 'network' || failure.kind === 'timeout') && asked.length > 1) {
        return t('installFailureNetworkAll', { registries: registryList(asked, t, install?.registries?.resolved ?? null) });
    }
    if (failure.kind !== undefined)
        return t(FAILURE_KIND_KEYS[failure.kind]);
    if (failure.code !== undefined)
        return managementText({ code: failure.code, diagnostic: failure.reason }, t);
    return failure.reason === '' ? t('installFailureGeneric') : failure.reason;
}
/** The package the install is about: its name, one-liner, and version, as the Host read them before installing. */
function SubjectCard({ subject, t }) {
    const title = subject.name ?? subject.spec;
    const kindKey = SUBJECT_KIND_KEYS[subject.kind];
    const description = subject.description ?? (kindKey === undefined ? undefined : t(kindKey));
    return (_jsxs("div", { className: css.subject, "data-install-subject": subject.spec, children: [_jsx("p", { className: css.subjectName, children: title }), description === undefined ? null : _jsx("p", { className: css.subjectDesc, children: description }), subject.version === undefined ? null : _jsx("p", { className: css.subjectMeta, children: t('installVersion', { version: subject.version }) })] }));
}
/** Track one install field's composition, including Safari's 10ms post-composition Enter window. */
function useInstallComposition(active) {
    const composition = useRef({ active: false, until: 0 });
    useEffect(() => { composition.current = { active: false, until: 0 }; }, [active]);
    return {
        onCompositionStart: () => { composition.current.active = true; },
        onCompositionEnd: () => { composition.current = { active: false, until: Date.now() + 10 }; },
        onBlur: () => { composition.current = { active: false, until: 0 }; },
        isComposing: (event) => event.isComposing || Reflect.get(event, 'keyCode') === 229
            || composition.current.active || Date.now() < composition.current.until,
    };
}
/**
 * The install dialog: the spec and its check, then the installing, installed,
 * and failed screens over the same subject card. A failed run that left
 * install scripts undecided shows them for approval in place of plain retry.
 */
function InstallDialog({ install, t, onClose, onEditSpec, onRun, onCancel, onReconcile, onToggleDetails, onEnableNow, onApproveBuilds, onToggleRegistry, onChooseRegistry, onChangeRegistry, onUseGithubMirror, }) {
    const errorId = useId();
    const templateHintId = useId();
    const guideId = useId();
    const approvalId = useId();
    const registryId = useId();
    const registryErrorId = useId();
    const [guideOpen, setGuideOpen] = useState(false);
    const [customRegistryDraft, setCustomRegistryDraft] = useState('');
    const { phase } = install;
    // The registry options float over the dialog from their toggle, so unfolding them never adds to its height;
    // the store folds them when a run starts, so they show at the spec only.
    const registryToggleRef = useRef(null);
    const registryPanelRef = useRef(null);
    const registryCustomRef = useRef(null);
    const registryShown = install.registryOpen && phase === 'idle';
    const specComposition = useInstallComposition(install.open && phase === 'idle');
    const registryComposition = useInstallComposition(install.open && registryShown);
    const registryPosition = useAnchoredPosition({
        open: registryShown, anchorRef: registryToggleRef, panelRef: registryPanelRef, align: 'end', gap: 6, margin: 12,
    });
    const registryReady = registryShown && registryPosition !== null;
    useEffect(() => {
        if (registryReady && install.registryError)
            registryCustomRef.current?.focus();
    }, [registryReady, install.registryError]);
    // The hook only ever asks to close.
    useDismissOnOutsidePointer(registryToggleRef, registryShown, onToggleRegistry, registryPanelRef);
    useEffect(() => {
        if (!registryShown)
            return;
        // Escape folds the options and goes no further: the dialog under them listens for the same key.
        const onKeyDown = (event) => {
            if (event.key !== 'Escape')
                return;
            event.stopPropagation();
            onToggleRegistry();
        };
        document.addEventListener('keydown', onKeyDown, true);
        return () => { document.removeEventListener('keydown', onKeyDown, true); };
    }, [registryShown, onToggleRegistry]);
    if (githubRecoveryRegistry(install) !== undefined) {
        const anotherWay = asksMirror(install);
        return (_jsx(Modal, { open: install.open, onClose: onClose, title: t(install.failure?.kind === 'timeout' ? 'installGithubTimeoutTitle' : 'installGithubFailedTitle'), closeLabel: t('close'), description: t('installGithubFailedDescription'), footer: (_jsxs(_Fragment, { children: [_jsx(Button, { variant: "outline", onClick: onClose, children: t('cancel') }), _jsx(Button, { variant: "primary", autoFocus: true, onClick: () => {
                            // The mirror is already asked, so the form opens with the package-name guide.
                            if (anotherWay)
                                setGuideOpen(true);
                            onUseGithubMirror();
                        }, children: t(anotherWay ? 'installTryAnotherWay' : 'installUseGithubMirror') })] })) }));
    }
    if (phase === 'idle' || phase === 'checking') {
        const checking = phase === 'checking';
        const empty = install.spec.trim() === '';
        const choice = install.registry;
        const resolved = install.registries?.resolved ?? null;
        const chosenTitle = choice.kind === 'custom' ? t('registryCustom') : registryText(choice.registry, t, resolved).name;
        const inputProblem = install.inputError;
        // A check no registry answered names every registry asked; any other refusal reads by its problem.
        const askedByCheck = inputProblem?.registries ?? [];
        const inputSentence = inputProblem === null
            ? null
            : inputProblem.problem === 'network' && askedByCheck.length > 1
                ? t('installProblemNetworkAll', { registries: registryList(askedByCheck, t, resolved) })
                : t(INPUT_PROBLEM_KEYS[inputProblem.problem], { reason: inputProblem.reason });
        const templateHint = install.spec === INSTALL_GIT_EXAMPLE
            ? t('installGitTemplateHint')
            : install.spec === INSTALL_PATH_EXAMPLE ? t('installPathTemplateHint') : null;
        return (_jsx(Modal, { open: install.open, onClose: onClose, title: t('installTitle'), closeLabel: t('close'), ...install.mirrorRecovery ? {} : { description: t('installDescription') }, className: css.installDialog, contentClassName: css.installContent, footer: (_jsxs("div", { className: css.installFooter, children: [_jsxs("p", { className: css.installSafety, role: "note", children: [_jsx(IconWarningOutlineRegular, { size: 14, "aria-hidden": "true" }), _jsxs("span", { className: css.installSafetyText, children: [_jsx("span", { children: t('installGuideSafety') }), _jsx("span", { children: t('installUpgradeNotice') })] })] }), _jsxs(Button, { variant: "primary", className: css.wide, disabled: checking || empty, "aria-busy": checking, onClick: onRun, children: [checking ? _jsx(StateDot, { state: "ongoing" }) : null, t(checking ? 'installChecking' : 'installRun')] })] })), children: _jsxs("div", { className: css.installBody, children: [_jsx("div", { className: css.installField, children: _jsx("input", { type: "text", autoFocus: install.mirrorRecovery === true, "data-modal-autofocus": true, value: install.spec, placeholder: t('installSpecPlaceholder'), disabled: checking, "aria-label": t(install.mirrorRecovery ? 'installPackageLabel' : 'installSpecLabel'), "aria-invalid": install.inputError !== null, "aria-describedby": inputSentence !== null ? errorId : templateHint !== null ? templateHintId : undefined, onChange: (event) => { onEditSpec(event.currentTarget.value); }, onCompositionStart: specComposition.onCompositionStart, onCompositionEnd: specComposition.onCompositionEnd, onBlur: specComposition.onBlur, onKeyDown: (event) => {
                                if (specComposition.isComposing(event.nativeEvent))
                                    return;
                                if (event.key === 'Enter' && !empty && !checking)
                                    onRun();
                            } }) }), inputSentence === null
                        ? null
                        : _jsx("p", { id: errorId, className: css.inputError, role: "alert", children: inputSentence }), inputSentence === null && templateHint !== null
                        ? _jsx("p", { id: templateHintId, className: css.templateHint, role: "status", children: templateHint })
                        : null, _jsxs("div", { className: css.optionsRow, children: [_jsxs("button", { type: "button", className: css.guideToggle, "aria-expanded": guideOpen, "aria-controls": guideId, onClick: () => { setGuideOpen(open => !open); }, children: [_jsx(IconChevronDownOutlineRegular, { className: css.guideChevron, "aria-hidden": "true" }), _jsx("span", { children: t(guideOpen ? 'installGuideHide' : 'installGuideToggle') })] }), _jsxs("button", { ref: registryToggleRef, type: "button", className: css.registryToggle, "aria-expanded": install.registryOpen, "aria-controls": registryId, "aria-haspopup": "dialog", disabled: checking, onClick: onToggleRegistry, children: [_jsx("span", { children: t('registryToggle') }), ' ', _jsx("span", { className: css.registryChosen, children: chosenTitle }), _jsx(IconChevronDownOutlineRegular, { className: css.guideChevron, "aria-hidden": "true" })] })] }), guideOpen
                        ? (_jsx("div", { id: guideId, className: css.guide, "data-install-guide": true, children: _jsx("ol", { className: css.guideList, children: GUIDE_EXAMPLES.map(({ key, titleKey, exampleKey, hintKey }) => (_jsxs("li", { className: css.guideItem, children: [_jsxs("div", { className: css.guideMain, children: [_jsx("span", { className: css.guideTitle, children: t(titleKey) }), _jsx("span", { className: css.guideHint, children: t(hintKey) }), _jsxs("span", { className: css.guideExample, children: [_jsx("span", { className: css.guideExampleLabel, children: t('installGuideExampleLabel') }), _jsx("code", { children: t(exampleKey) })] })] }), _jsx(Button, { variant: "outline", size: "sm", "aria-label": t('installGuideFillAria', { example: t(exampleKey) }), disabled: checking, onClick: () => { onEditSpec(t(exampleKey)); }, children: t('installGuideFill') })] }, key))) }) }))
                        : null, registryShown
                        ? createPortal(_jsxs("fieldset", { ref: registryPanelRef, id: registryId, className: css.registry, style: registryPosition ?? { visibility: 'hidden', left: 0, top: 0 }, "data-install-registry": true, "aria-label": t('registryLegend'), onKeyDown: (event) => {
                                if (event.key !== 'Tab' || event.ctrlKey || event.altKey || event.metaKey || event.nativeEvent.isComposing)
                                    return;
                                event.preventDefault();
                                event.stopPropagation();
                                const radio = event.currentTarget.querySelector('input[type="radio"]:checked');
                                const field = registryCustomRef.current;
                                if (event.shiftKey && event.target === field)
                                    radio?.focus();
                                else if (!event.shiftKey && event.target !== field)
                                    field?.focus();
                                else {
                                    onToggleRegistry();
                                    registryToggleRef.current?.focus();
                                }
                            }, children: [offeredRegistries(install.registries).map((registry) => {
                                    const checked = choice.kind === 'offered' && choice.registry === registry;
                                    return (_jsxs("label", { className: css.registryOption, "data-checked": checked, children: [_jsx("input", { type: "radio", name: registryId, checked: checked, onChange: () => {
                                                    if (choice.kind === 'custom')
                                                        setCustomRegistryDraft(choice.url);
                                                    onChooseRegistry({ kind: 'offered', registry });
                                                } }), _jsx("span", { className: css.registryTitle, children: registryOption(registry, t, resolved) })] }, registry ?? ''));
                                }), _jsxs("div", { className: css.registryOption, "data-checked": choice.kind === 'custom', onClick: (event) => {
                                        // Keep label activation from moving focus back to the radio.
                                        if (!(event.target instanceof HTMLInputElement))
                                            event.preventDefault();
                                        registryCustomRef.current?.focus();
                                    }, children: [_jsxs("label", { className: css.registryCustomPick, children: [_jsx("input", { type: "radio", name: registryId, checked: choice.kind === 'custom', onChange: () => {
                                                        onChooseRegistry({ kind: 'custom', url: customRegistryDraft });
                                                        registryCustomRef.current?.focus();
                                                    } }), _jsx("span", { className: css.registryTitle, children: _jsx("span", { children: t('registryCustom') }) })] }), _jsx("input", { ref: registryCustomRef, type: "text", className: css.registryCustomField, "aria-label": t('registryCustom'), placeholder: t('registryCustomPlaceholder'), value: choice.kind === 'custom' ? choice.url : customRegistryDraft, "aria-invalid": install.registryError, "aria-describedby": install.registryError ? registryErrorId : undefined, onFocus: () => {
                                                if (pointerModality() && choice.kind !== 'custom')
                                                    onChooseRegistry({ kind: 'custom', url: customRegistryDraft });
                                            }, onChange: (event) => { onChooseRegistry({ kind: 'custom', url: event.currentTarget.value }); }, onCompositionStart: registryComposition.onCompositionStart, onCompositionEnd: registryComposition.onCompositionEnd, onBlur: registryComposition.onBlur, onKeyDown: (event) => {
                                                if (registryComposition.isComposing(event.nativeEvent))
                                                    return;
                                                if (event.key === 'Enter' && !empty)
                                                    onRun();
                                            } }), install.registryError
                                            ? _jsx("p", { id: registryErrorId, className: css.inputError, role: "alert", children: t('registryCustomInvalid') })
                                            : null, _jsx("span", { className: css.registryHint, children: t('registryCustomHint') })] })] }), document.body)
                        : null] }) }));
    }
    const heading = t(SCREEN_TITLE_KEYS[phase]);
    const pending = isInstallPending(phase);
    const cancellable = phase === 'starting' || phase === 'running' || phase === 'unconfirmed';
    const stoppable = cancellable || phase === 'failed' || phase === 'unknown';
    const failure = install.failure;
    const uncertainty = failure?.uncertainty;
    const uncertaintyText = failure?.uncertainty === undefined ? null : t({
        result: 'installResultUnconfirmed',
        cancellation: phase === 'applying' ? 'installApplyingCancellationError' : 'installCancelUnconfirmed',
        acceptance: 'installAwaitingAcceptance',
    }[failure.uncertainty], { reason: failure.reason });
    const pendingBuilds = phase === 'failed' ? install.failure?.pendingBuilds ?? [] : [];
    const approvable = pendingBuilds.length > 0;
    const firstRun = install.runs[0];
    // The registries the Host asked, once there is more than one: the attempt under way while it runs, a badge on each run.
    const asked = install.attempts !== null && install.attempts.registries.length > 1 ? install.attempts : null;
    const current = asked === null ? undefined : asked.registries.at(-1);
    const previous = asked === null ? undefined : asked.registries.at(-2);
    const resolved = install.registries?.resolved ?? null;
    const attemptLine = pending && asked !== null && current !== undefined && previous !== undefined
        ? t('installAttempt', {
            previous: registryText(previous, t, resolved).name, registry: registryText(current, t, resolved).name,
            index: String(asked.registries.length), total: String(asked.total),
        })
        : null;
    // Another registry is worth offering only for a failure the Host laid at the one it asked.
    const changeable = phase === 'failed' && !approvable && install.failure?.failedAt === 'registry';
    const subject = install.subject;
    return (_jsx(Modal, { open: install.open, onClose: onClose, title: heading, headless: true, className: css.installDialog, children: _jsxs("div", { className: css.wizard, "data-install-phase": phase, children: [_jsxs("div", { className: css.wizardHead, children: [phase === 'done'
                            ? _jsx("span", {})
                            : (_jsxs("button", { type: "button", className: css.wizardBack, "aria-label": t(pending ? 'installCancelAndEdit' : 'installEditAria'), disabled: !stoppable, onClick: onCancel, children: [_jsx(IconChevronLeftOutlineMedium, { "aria-hidden": "true" }), _jsx("span", { children: t(pending ? 'installCancelAndEdit' : 'installEdit') })] })), _jsx("button", { type: "button", className: css.wizardClose, "aria-label": t(cancellable ? 'installCloseCancels' : 'close'), onClick: onClose, children: _jsx(IconCloseOutlineMedium, { size: 14 }) })] }), _jsxs("div", { className: css.wizardScroll, children: [_jsxs("div", { className: css.wizardHero, children: [_jsx("span", { className: css.wizardIcon, "data-state": pending ? 'ongoing' : phase === 'done' ? 'done' : 'error', "aria-hidden": "true", children: pending
                                        ? _jsx(StateDot, { state: "ongoing", size: 28 })
                                        : phase === 'done'
                                            ? _jsx(IconCheckCircleFillRegular, { size: 28 })
                                            : _jsx(IconWarningOutlineRegular, { size: 28 }) }), _jsx("h2", { className: css.wizardTitle, role: phase === 'failed' ? 'alert' : 'status', children: heading }), phase === 'failed' ? _jsx("p", { className: css.wizardSub, children: failureText(install.failure, t, install) }) : null, attemptLine === null ? null : _jsx("p", { className: css.wizardSub, children: attemptLine }), uncertaintyText === null ? null : _jsx("p", { className: css.wizardSub, role: "alert", children: uncertaintyText }), phase === 'unknown' ? _jsx("p", { className: css.wizardSub, children: t('installUnknownDescription') }) : null] }), subject === null
                            ? null
                            : _jsx(SubjectCard, { subject: phase === 'done' && install.installedVersion !== null ? { ...subject, version: install.installedVersion } : subject, t: t }), approvable
                            ? (_jsxs("section", { className: css.approval, role: "group", "aria-labelledby": approvalId, "data-install-approval": true, children: [_jsx("h3", { id: approvalId, className: css.approvalTitle, children: t('installApprovalTitle') }), _jsx("p", { className: css.approvalText, children: t('installApprovalDescription') }), _jsx("ul", { className: css.approvalList, children: pendingBuilds.map(name => _jsx("li", { children: _jsx("code", { children: name }) }, name)) }), _jsx("p", { className: css.approvalText, children: t('installApprovalConsequence') }), _jsx("p", { className: css.approvalCaution, children: t('installApprovalCaution') }), _jsx(Button, { variant: "primary", className: css.wide, onClick: onApproveBuilds, children: t('installApproveAndRetry') })] }))
                            : null, phase === 'done' && install.installed === null
                            ? _jsx("p", { className: css.result, role: "status", children: t('installDoneNothing') })
                            : null, phase === 'done' && install.restartRequired
                            ? _jsx("p", { className: css.resultWarn, role: "status", children: t('installDoneRestart') })
                            : null, phase === 'done' && subject?.kind === 'registry' && subject.name !== undefined && subject.version !== undefined
                            && install.installedVersion !== null && install.installedVersion !== subject.version
                            // A fallback registry can serve another release than the one inspected, so only a single-registry run is explained.
                            && (install.attempts?.registries.length ?? 1) === 1
                            ? (_jsx("p", { className: css.resultWarn, role: "status", children: t('installDoneOtherVersion', {
                                    installed: install.installedVersion, version: subject.version, exact: `${subject.name}@${subject.version}`,
                                }) }))
                            : null, phase === 'done' && install.approvedBuilds.length > 0
                            ? _jsx("p", { className: css.result, role: "status", children: t('installDoneApproved', { names: install.approvedBuilds.join(', ') }) })
                            : null, _jsxs("div", { className: css.wizardFoot, children: [_jsxs("button", { type: "button", className: css.detailsToggle, "aria-expanded": install.detailsOpen, onClick: onToggleDetails, children: [_jsx("span", { children: t(install.detailsOpen ? 'installDetailsHide' : 'installDetailsShow') }), _jsx(IconChevronDownOutlineRegular, { className: css.detailsChevron, "aria-hidden": "true" })] }), uncertainty === 'result' ? _jsx(Button, { variant: "outline", size: "sm", className: css.footAction, onClick: onReconcile, children: t('installReconcile') }) : null, pending
                                    ? (_jsx(Button, { variant: "outline", size: "sm", className: css.footAction, disabled: !cancellable, onClick: onCancel, children: t(phase === 'cancelling' ? 'installCancelling' : 'installCancel') }))
                                    : null, phase === 'failed' && !approvable
                                    ? (_jsxs("span", { className: css.wizardActions, children: [changeable
                                                ? _jsx(Button, { variant: "outline", size: "sm", className: css.footAction, onClick: onChangeRegistry, children: t('installChangeRegistry') })
                                                : null, _jsx(Button, { variant: "primary", size: "sm", className: css.footAction, onClick: onRun, children: t('installRetry') })] }))
                                    : null] }), install.detailsOpen
                            ? (_jsxs("div", { className: css.detailsBody, children: [_jsx("p", { className: css.installLocation, children: firstRun === undefined ? t('terminalNoOutput') : t('installLocation', { dir: firstRun.cwd }) }), install.runs.map((run, index) => {
                                        const registry = asked?.registries[index];
                                        return (_jsxs("div", { className: css.run, children: [registry === undefined
                                                    ? null
                                                    : _jsx("p", { className: css.attemptBadge, children: t('installAttemptBadge', { index: String(index + 1), registry: registryText(registry, t, resolved).name }) }), _jsx(TerminalBlock, { command: run.command, output: run.output, running: run.exitCode === undefined, exitCode: run.exitCode, maxLines: INSTALL_TERMINAL_LINES, labels: { ...terminalLabels(t), ...phase === 'cancelling' ? { failed: t('installCancelledShort') } : {} }, className: css.terminal })] }, run.jobId));
                                    })] }))
                            : null, phase !== 'done'
                            ? null
                            : install.installed !== null && install.subject?.selection === undefined
                                ? _jsx(Button, { variant: "primary", className: css.wide, disabled: install.enabling, "aria-busy": install.enabling, onClick: onEnableNow, children: t('installEnableNow') })
                                : _jsx(Button, { variant: "primary", className: css.wide, onClick: onClose, children: t('installClose') })] })] }) }));
}
/** The confirmation an uninstall waits on. */
function ConfirmDialog({ name, t, onConfirm, onCancel }) {
    return (_jsx(Modal, { open: true, onClose: onCancel, title: t('confirmUninstallTitle', { name }), closeLabel: t('close'), description: t('confirmUninstallDescription'), footer: (_jsxs(_Fragment, { children: [_jsx(Button, { variant: "outline", onClick: onCancel, children: t('cancel') }), _jsx(Button, { variant: "primary", className: css.dangerButton, onClick: onConfirm, children: t('confirmUninstall') })] })) }));
}
/** Render the plugin manager: the official plugins and installed bundles, their pages, the install dialog, and the confirmation. */
export function PluginManagerPage(props) {
    const { t, ensure, renderSlot, resolveText } = props;
    const configurations = props.useConfigurations(snapshot => snapshot.view?.namespaces);
    const formFor = (id) => {
        if (!configurations?.some(view => view.ns === id))
            return undefined;
        const form = props.configForm(id);
        return { state: form.getSnapshot(), mutate: (ops, revision) => form.mutate(ops, revision) };
    };
    const state = props.usePluginManager(snapshot => snapshot);
    const ledger = props.useConfigLedger(snapshot => snapshot);
    // What is open; a package that leaves the list (uninstalled) drops back to the cards.
    const view = props.useStore(state => state.view), { setView } = props.actions;
    const [activation, setActivation] = useState(null);
    useEffect(() => { ensure(); }, [ensure]);
    // Installation highlights visible cards without changing the user's current page.
    const { highlight, clearHighlight } = { highlight: state.highlight, clearHighlight: props.clearHighlight };
    useEffect(() => {
        if (highlight === null)
            return;
        const card = document.querySelector(`[data-plugin-package="${highlight}"]`);
        if (card !== null && typeof card.scrollIntoView === 'function')
            card.scrollIntoView({ block: 'center', behavior: 'smooth' });
        const timer = setTimeout(clearHighlight, HIGHLIGHT_MS);
        return () => { clearTimeout(timer); };
    }, [highlight, clearHighlight]);
    const noticeLine = state.notice === null || state.notice.kind === 'refresh-failed' ? null : noticeText(state.notice, t);
    // The page manages what the person installed, what the installation ships for them to switch on, and a
    // selected name the Host cannot read; the installation's other bundles are inspected in the Settings
    // Plugins section's Plugin list tab.
    const listed = state.packages.filter(pkg => !BUILTIN_PROFILE_BUNDLES.has(pkg.name)
        && (pkg.installed || pkg.official || pkg.error !== undefined));
    const mine = listed.filter(pkg => !pkg.official);
    const official = listed.filter(pkg => pkg.official);
    const extensions = orderPackages(official.filter(pkg => !MORE_BUNDLES.includes(pkg.name)), EXTENSION_BUNDLES);
    const more = [...extensions, ...orderPackages(official.filter(pkg => MORE_BUNDLES.includes(pkg.name)), MORE_BUNDLES)];
    const loaded = state.status === 'ready' || state.status === 'error';
    const refreshing = state.refreshStatus === 'refreshing';
    const openPkg = view.kind === 'package' || view.kind === 'row' ? listed.find(pkg => pkg.name === view.name) : undefined;
    const openItem = view.kind === 'item' ? ledger.items.find(item => item.id === view.id) : undefined;
    const openRow = view.kind === 'row' && openPkg !== undefined ? openPkg.rows.find(row => row.rowId === view.rowId) : undefined;
    const showsCards = openPkg === undefined && openItem === undefined;
    const detailFromMore = (view.kind === 'package' || view.kind === 'row')
        && (view.from === 'more' || MORE_BUNDLES.includes(view.name));
    const showsMoreList = showsCards && (view.kind === 'more' || detailFromMore);
    const showsMainList = showsCards && !showsMoreList;
    const openPkgInMore = openPkg !== undefined && openPkg.official && detailFromMore;
    const activated = listed.find(pkg => pkg.name === activation && pkg.enabled && !state.busy.includes(pkg.name));
    const setRowEnabled = (row, enabled) => {
        /* v8 ignore next -- a row without a live entry has its switch disabled */
        if (row.entryId !== undefined)
            props.setRowEnabled(row.entryId, enabled);
    };
    const configure = (pkg) => ({
        has: row => ledger.rows.has(rowConfigKey(pkg.name, row.rowId)),
        open: (row) => { setView({ kind: 'row', name: pkg.name, rowId: row.rowId, ...openPkgInMore ? { from: 'more' } : {} }); },
    });
    const packageBusy = (pkg) => state.busy.includes(pkg.name)
        || (state.install.subject?.name === pkg.name && (isInstallPending(state.install.phase) || state.install.phase === 'checking'));
    const packageCard = (pkg) => (_jsx(PackageCard, { pkg: pkg, t: t, resolveText: resolveText, busy: packageBusy(pkg), highlighted: state.highlight === pkg.name, onOpen: () => { setActivation(null); setView({ kind: 'package', name: pkg.name, ...showsMoreList ? { from: 'more' } : {} }); }, onSetEnabled: (enabled) => { setActivation(enabled ? pkg.name : null); props.setEnabled(pkg.name, enabled); } }, pkg.name));
    const basicCards = ledger.items.map(item => (_jsx(ItemCard, { item: item, t: t, renderSlot: renderSlot, onOpen: () => { setView({ kind: 'item', id: item.id }); } }, `item:${item.id}`)));
    const renderGroup = (id, heading, cards) => {
        const offersMore = id === 'extensions' && more.length > 0;
        if (cards.length === 0 && !offersMore)
            return null;
        return (_jsxs("section", { className: css.group, "data-plugin-scope": "global", "data-plugin-group": id, children: [_jsxs("div", { className: css.groupHead, children: [_jsx("h3", { className: css.groupTitle, children: heading }), offersMore ? (_jsxs(Button, { size: "sm", className: css.groupMore, onClick: () => { setView({ kind: 'more' }); }, children: [t('moreAction'), _jsx(IconChevronRightOutlineRegular, { size: 14, "aria-hidden": "true" })] })) : null] }), cards.length > 0 ? _jsx("ul", { className: css.cards, children: cards }) : null] }));
    };
    return (_jsxs("section", { className: css.page, "data-plugin-panel": true, "aria-busy": state.status === 'loading' || refreshing, children: [showsMainList
                ? (_jsxs("header", { className: css.pageHead, "data-window-drag": true, children: [_jsxs("div", { children: [_jsx("h1", { className: css.pageTitle, children: t('title') }), _jsxs("div", { className: css.pageIntro, children: [_jsx("span", { children: t('intro') }), _jsx(Tooltip, { label: t('infoDescription'), side: "bottom", delayMs: 300, maxWidth: 300, portal: true, openOnClick: true, children: _jsx(Button, { variant: "ghost", size: "sm", className: css.infoButton, "aria-label": t('infoLabel'), children: _jsx(IconInfoOutlineRegular, { size: 11, "aria-hidden": "true" }) }) })] })] }), _jsxs("div", { className: css.toolbar, children: [_jsx(Tooltip, { label: t('refresh'), delayMs: 500, focusDelayMs: 500, side: "bottom", portal: true, disabled: !loaded || refreshing, children: _jsx("button", { type: "button", className: css.iconButton, "aria-label": t('refresh'), "aria-busy": refreshing, disabled: !loaded || refreshing, onClick: props.refresh, children: _jsx("span", { className: css.iconWrap, "aria-hidden": "true", children: refreshing ? _jsx(StateDot, { state: "ongoing", size: 18 }) : _jsx(IconRefreshOutlineRegular, {}) }) }) }), state.install.requestId === undefined
                                    ? _jsx(AddPluginMenu, { t: t, disabled: !loaded, openInstall: props.openInstall, renderSlot: renderSlot, closeSettings: props.close })
                                    : _jsx(Button, { variant: "primary", size: "sm", className: css.addButton, icon: _jsx(IconPlusOutlineRegular, { size: 13 }), disabled: !loaded, onClick: props.openInstall, children: t('installViewTask') })] })] }))
                : null, showsMoreList ? (_jsxs("header", { className: css.moreHead, "data-window-drag": true, children: [_jsx(Button, { size: "sm", className: css.moreBack, "aria-label": t('backToList'), onClick: () => { setView({ kind: 'list' }); }, children: _jsx(IconChevronLeftOutlineMedium, { size: 20, "aria-hidden": "true" }) }), _jsx("h1", { className: css.pageTitle, children: t('moreTitle') })] })) : null, showsCards && state.status === 'loading' ? _jsx(ListSkeleton, { label: t('loading') }) : null, showsCards && state.status === 'unavailable' ? (_jsxs("p", { className: `${css.status} ${css.statusWithDot}`, role: "status", children: [_jsx(StateDot, { state: "idle" }), t('unavailable')] })) : null, state.notice === null || noticeLine === null
                ? null
                : (_jsx(Toast, { text: noticeLine, icon: _jsx(IconWarningOutlineRegular, {}), holdMs: toastHoldMs(noticeLine), onDone: props.dismissNotice }, state.notice.seq)), !showsCards && state.status === 'error' && !refreshing
                ? (_jsxs("div", { className: css.failure, children: [_jsxs("p", { className: css.statusWithDot, role: "alert", children: [_jsx(StateDot, { state: "error" }), t(state.refreshStatus === 'failed' ? 'refreshError' : 'error')] }), _jsx(Button, { variant: "outline", size: "sm", onClick: props.refresh, children: t('retry') })] }))
                : null, loaded && openPkg !== undefined && openRow !== undefined
                ? (_jsx(RowDetail, { pkg: openPkg, row: openRow, form: formFor(openRow.rowId), t: t, resolveText: resolveText, renderSlot: renderSlot, onBack: () => { setView({ kind: 'package', name: openPkg.name, ...openPkgInMore ? { from: 'more' } : {} }); } }))
                : null, loaded && openPkg !== undefined && openRow === undefined
                ? (_jsx(PackageDetail, { pkg: openPkg, t: t, resolveText: resolveText, busy: packageBusy(openPkg), rowBusy: row => row.entryId !== undefined && state.busy.includes(rowKey(row.entryId)), configured: ledger.bundles.has(openPkg.name), configure: configure(openPkg), renderSlot: renderSlot, inMore: openPkgInMore, onBack: () => { setView({ kind: openPkgInMore ? 'more' : 'list' }); }, onSetEnabled: (enabled) => { props.setEnabled(openPkg.name, enabled); }, onUninstall: () => { props.uninstall(openPkg.name); }, onUpdate: () => { props.update(openPkg.name); }, onSetRowEnabled: setRowEnabled }))
                : null, loaded && openItem !== undefined
                ? _jsx(ItemDetail, { form: formFor(openItem.id), item: openItem, t: t, renderSlot: renderSlot, onBack: () => { setView({ kind: 'list' }); } })
                : null, loaded && showsCards
                ? basicCards.length === 0 && official.length === 0 && mine.length === 0 && state.status !== 'error'
                    ? _jsx("p", { className: css.empty, children: t('empty') })
                    : (_jsxs(_Fragment, { children: [showsMoreList ? (_jsx("section", { className: css.group, "data-plugin-scope": "global", "data-plugin-group": "more", children: _jsx("ul", { className: css.cards, children: more.map(packageCard) }) })) : (_jsxs(_Fragment, { children: [renderGroup('basic', t('basicTitle'), basicCards), renderGroup('extensions', t('extensionsTitle'), extensions.map(packageCard)), renderGroup('bundles', t('bundlesTitle'), mine.map(packageCard))] })), state.status === 'error' && !refreshing
                                ? (_jsxs("div", { className: css.failure, children: [_jsxs("p", { className: css.statusWithDot, role: "alert", children: [_jsx(StateDot, { state: "error" }), t(state.refreshStatus === 'failed' ? 'refreshError' : 'error')] }), _jsx(Button, { variant: "outline", size: "sm", onClick: props.refresh, children: t('retry') })] }))
                                : null] }))
                : null, showsCards && activated !== undefined && !state.install.open
                ? renderSlot('plugins.bundle.activation', {
                    packageName: activated.name,
                    onDismiss: () => { setActivation(null); },
                    onOpenDetails: () => {
                        setActivation(null);
                        setView({ kind: 'package', name: activated.name, ...showsMoreList ? { from: 'more' } : {} });
                    },
                }, { entryKey: activated.name }) : null, _jsx(InstallDialog, { install: state.install, t: t, onClose: props.closeInstall, onEditSpec: props.editInstallSpec, onRun: props.runInstall, onCancel: props.cancelInstall, onReconcile: props.reconcileInstall, onToggleDetails: props.toggleInstallDetails, onEnableNow: () => { setActivation(state.install.installed); props.enableInstalled(); }, onApproveBuilds: props.approveBuildsAndRetry, onToggleRegistry: props.toggleRegistryOptions, onChooseRegistry: props.chooseRegistry, onChangeRegistry: props.changeRegistry, onUseGithubMirror: props.useGithubMirror }), state.confirm === null
                ? null
                : (_jsx(ConfirmDialog, { name: packageText(state.packages.find(pkg => pkg.name === state.confirm?.packageName) ?? { name: state.confirm.packageName }, resolveText).title, t: t, onConfirm: props.confirm, onCancel: props.cancelConfirm }))] }));
}
//# sourceMappingURL=PluginManagerPage.js.map