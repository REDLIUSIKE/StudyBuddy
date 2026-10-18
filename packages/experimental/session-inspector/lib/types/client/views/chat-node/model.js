/** Chat table order follows root references and group membership, independently of row data. */
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store';
import { InspectorRecordSource } from "../table-model.js";
import { inspectorPreview } from "../format.js";
import { ChatObjectIndex } from "./objects.js";
import { matchChatNodeRow } from "./pick-match.js";
const EMPTY = [];
const COLUMN_FIELDS = ['key', 'kind'];
function nodeRecord(node) {
    const location = node.location;
    return { type: node.kind, identity: node.key,
        location: location.kind === 'step' ? `${location.turn.turn}/${location.step.step}`
            : location.kind === 'turn' ? String(location.turn.turn) : location.kind,
        value: node, summary: inspectorPreview(node, COLUMN_FIELDS) };
}
/** Observes structural Chat changes while visible rows observe their own Node or Group. */
export class ChatNodeModel {
    binding;
    rows = createSnapshotStore(EMPTY);
    sources = new Map();
    groups = new Map();
    entries;
    order;
    keys;
    anchors;
    nodeStore;
    grouped;
    subscribers = 0;
    disconnect;
    queued = false;
    targets = new Map();
    objectIndex;
    /** @param binding - Existing target-neutral Conversation binding for the inspected Session. */
    constructor(binding) {
        this.binding = binding;
        this.objectIndex = new ChatObjectIndex(binding);
        this.refresh();
    }
    /**
     * Bind object references and publication updates to the inspected Session.
     * @param sessionId - Session displayed by this model.
     * @returns Weak object lookup and row navigation for its details.
     */
    objects(sessionId) {
        const reference = (value) => {
            const found = this.objectIndex.reference(value);
            if (found === undefined)
                return undefined;
            const row = [...this.targets].find(([, target]) => found.target.nodeKey !== undefined
                ? target.nodeKey === found.target.nodeKey && (found.target.groupPart === undefined || target.groupPart === found.target.groupPart)
                : found.target.groupKey !== undefined && target.groupKey === found.target.groupKey);
            return { ...found, ...(row === undefined ? {} : { rowKey: row[0] }) };
        };
        return { sessionId, updates: this.binding.snapshot, reference, row: (key) => {
                const value = this.row(key)?.getSnapshot()?.value;
                if (value === null || typeof value !== 'object')
                    return undefined;
                const found = reference(value);
                const target = this.targets.get(key);
                return found === undefined || target === undefined ? undefined : { ...found, rowKey: key, target };
            } };
    }
    /** @returns Stable flattened group/node order. */
    getSnapshot = () => this.rows.getSnapshot();
    /**
     * Match a picked Chat object against the current table, including folded children.
     * @param target - Picked Chat identities.
     * @returns Closest current Node or Group row, or undefined without a match.
     */
    pick(target) {
        this.refresh(true);
        return matchChatNodeRow(target, this.targets);
    }
    /** @param listener - Structural invalidation callback. @returns Its disposer. */
    subscribe = (listener) => {
        const stop = this.rows.subscribe(listener);
        if (this.subscribers++ === 0) {
            this.disconnect = this.binding.snapshot.subscribe(() => { this.refresh(); });
            this.binding.activate('chat');
            this.refresh(true);
        }
        return () => {
            stop();
            if (--this.subscribers === 0) {
                this.disconnect?.();
                this.disconnect = undefined;
                for (const stop of this.groups.values())
                    stop();
                this.groups.clear();
            }
        };
    };
    /**
     * Read a loaded row without adding a subscription.
     * @param key - Stable table position.
     * @returns Cached Node or Group metadata source, or undefined outside the loaded rows.
     */
    row = (key) => this.sources.get(key);
    refresh(force = false) {
        const snapshot = this.binding.snapshot.getSnapshot();
        const chat = snapshot.views.get('chat');
        const grouped = snapshot.views.grouped('chat');
        const nodes = chat?.nodes.values();
        const sameKeys = nodes === undefined ? this.keys === undefined
            : nodes.length === this.keys?.length && nodes.every((node, index) => node.key === this.keys?.[index]
                && node.anchorSeq === this.anchors?.[index]);
        if (!force && chat?.order === this.order && chat?.nodes === this.nodeStore
            && sameKeys && grouped === this.grouped && grouped?.entries === this.entries)
            return;
        this.order = chat?.order;
        this.entries = grouped?.entries;
        this.keys = nodes?.map(node => node.key);
        this.anchors = nodes?.map(node => node.anchorSeq);
        if (grouped !== this.grouped) {
            for (const stop of this.groups.values())
                stop();
            this.groups.clear();
            this.sources.clear();
        }
        this.grouped = grouped;
        if (chat?.nodes !== this.nodeStore)
            this.sources.clear();
        this.nodeStore = chat?.nodes;
        const activeGroups = new Set();
        this.targets.clear();
        const rows = [];
        const addNode = (entry, parent) => {
            const key = `node:${entry.key}:${entry.groupPart ?? ''}`;
            const location = chat?.nodes.get(entry.key)?.location;
            const turn = location?.kind === 'turn' || location?.kind === 'step' ? location.turn.turn : undefined;
            const step = location?.kind === 'step' ? location.step.step : undefined;
            this.targets.set(key, { nodeKey: entry.key, ...entry.groupPart === undefined ? {} : { groupPart: entry.groupPart },
                ...turn === undefined ? {} : { turn }, ...step === undefined ? {} : { step } });
            rows.push({ key, depth: parent === undefined ? 0 : 1, ...(parent === undefined ? {} : { parent }) });
            if (!this.sources.has(key) && chat !== undefined) {
                this.sources.set(key, new InspectorRecordSource(chat.nodes.source(entry.key), (node) => {
                    const record = nodeRecord(node);
                    return entry.groupPart === undefined ? record : { ...record, identity: `${node.key}#${entry.groupPart}` };
                }));
            }
        };
        const entries = grouped?.entries ?? chat?.order.map(key => ({ kind: 'node', key })) ?? [];
        const included = new Set();
        const entryAnchors = entries.map((entry) => {
            // oxlint-disable-next-line typescript/no-non-null-assertion -- Group entries exist only when grouped is present.
            const members = entry.kind === 'node' ? [entry] : grouped.groupSource(entry.key).getSnapshot()?.members ?? [];
            let anchor;
            for (const member of members) {
                included.add(member.key);
                const seq = chat?.nodes.get(member.key)?.anchorSeq;
                if (seq !== undefined)
                    anchor = anchor === undefined ? seq : Math.min(anchor, seq);
            }
            return anchor;
        });
        const unlisted = (nodes ?? []).filter(node => !included.has(node.key))
            .sort((left, right) => left.anchorSeq - right.anchorSeq || left.key.localeCompare(right.key));
        let nextUnlisted = 0;
        const addUnlistedBefore = (anchor) => {
            let node = unlisted[nextUnlisted];
            while (node !== undefined && node.anchorSeq <= anchor) {
                addNode({ key: node.key });
                node = unlisted[++nextUnlisted];
            }
        };
        for (const [index, entry] of entries.entries()) {
            const anchor = entryAnchors[index];
            if (anchor !== undefined)
                addUnlistedBefore(anchor);
            if (entry.kind === 'node') {
                addNode(entry);
                continue;
            }
            activeGroups.add(entry.key);
            const key = `group:${entry.key}`;
            this.targets.set(key, { groupKey: entry.key });
            // oxlint-disable-next-line typescript/no-non-null-assertion -- The non-grouped fallback contains only node entries.
            const source = grouped.groupSource(entry.key);
            const group = source.getSnapshot();
            rows.push({ key, depth: 0 });
            if (!this.sources.has(key))
                this.sources.set(key, new InspectorRecordSource(source, (value) => ({
                    type: 'group', identity: value.key, location: '', value, summary: inspectorPreview(value, COLUMN_FIELDS),
                })));
            for (const member of group?.members ?? [])
                addNode(member, key);
            if (this.subscribers > 0 && !this.groups.has(entry.key)) {
                let members = group?.members;
                const stop = source.subscribe(() => {
                    const next = source.getSnapshot()?.members;
                    if (next === members)
                        return;
                    members = next;
                    this.schedule();
                });
                this.groups.set(entry.key, stop);
            }
        }
        addUnlistedBefore(Infinity);
        for (const [key, stop] of this.groups) {
            if (!activeGroups.has(key)) {
                stop();
                this.groups.delete(key);
            }
        }
        const rowKeys = new Set(rows.map(row => row.key));
        for (const key of this.sources.keys())
            if (!rowKeys.has(key))
                this.sources.delete(key);
        this.rows.set(rows);
    }
    schedule() {
        if (this.queued)
            return;
        this.queued = true;
        queueMicrotask(() => {
            this.queued = false;
            if (this.subscribers > 0)
                this.refresh(true);
        });
    }
}
//# sourceMappingURL=model.js.map