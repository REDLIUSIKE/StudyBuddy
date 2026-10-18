import { jsx as _jsx } from "react/jsx-runtime";
import { useEffect, useRef } from 'react';
import { ScheduleCreateCard } from "./ScheduleCreateCard.js";
import { scheduleCreateCardModel } from "./schedule-create-card.js";
import { SCHEDULE_CREATE_TOOL, selectScheduleTasks } from "./schedule-turn.js";
import css from './ScheduleTurnCard.module.css';
/**
 * Props of one card rendered from the Turn tail.
 *
 * The keyed Tool seat also carries the owner's file opener, image loader, and
 * workspace facts; this card reads none of them, and the Turn tail supplies
 * only the fields it does.
 * @param block - settled result node recorded against the Turn.
 * @param openTaskDetail - right-Sidebar navigation for the created task.
 * @param t - the active locale's copy.
 * @returns the composed props of one `ScheduleCreateCard`.
 */
function cardProps(block, openTaskDetail, t, currentTask) {
    const supplied = {
        callId: block.callId,
        toolName: SCHEDULE_CREATE_TOOL,
        block,
        openTaskDetail,
        t,
        ...(currentTask === undefined ? {} : { currentTask }),
    };
    return supplied;
}
/** Created-task cards reconciled against the authoritative Host catalog. */
function CurrentScheduleCards({ created, openTaskDetail, t, useCatalog, onRetry }) {
    const catalog = useCatalog(snapshot => snapshot);
    // The cards carry the records their creation calls wrote, so only a read issued
    // after they appeared can state that one is gone: the retained records of an
    // earlier read may simply predate the creation. This tail requests that read
    // itself - the source batches the requests of one commit into a single read, so a
    // conversation with several created-task cards still sends one - which makes the
    // order one of cause, never a comparison of the browser's clock with the Host's.
    // The ordinal is the request the source issued, so a read sent before this tail
    // rendered cannot pass the gate even if it resolves afterwards. A failed read
    // leaves the figure, so the cards keep the created rule until a read succeeds.
    const requestAtMount = useRef(catalog.readRequest).current;
    // The mount ordinal goes with the request: the source shares an in-flight read
    // only when that read was requested after this tail appeared, so a read sent
    // before it cannot answer for it.
    useEffect(() => { void onRetry(requestAtMount); }, [onRetry, requestAtMount]);
    const records = catalog.settled && catalog.readSettled > requestAtMount ? catalog.records : undefined;
    return created.map((block) => {
        const task = scheduleCreateCardModel(block, SCHEDULE_CREATE_TOOL).task;
        const current = task === undefined || records === undefined
            ? undefined
            : records.find(record => record.id === task.id) ?? null;
        return (_jsx(ScheduleCreateCard, { ...cardProps(block, openTaskDetail, t, current) }, block.callId));
    });
}
/**
 * Render the tasks one Turn created as standalone cards beneath its closing
 * prose.
 *
 * The Turn tail is a list seat independent of the Turn's process disclosure,
 * so the cards stay visible while the Tool group is collapsed. Every list entry
 * renders for every Turn, so this one narrows its own Turn here.
 * @param props - closing Turn owner currency, turn-tail navigation, and copy.
 * @returns one created-task card per settled `schedule_create` result, or null when the Turn created none.
 */
export function ScheduleTurnCard(props) {
    const matched = selectScheduleTasks(props);
    if (matched === null)
        return null;
    return (_jsx("div", { className: css.list, children: _jsx(CurrentScheduleCards, { created: matched.created, openTaskDetail: props.openTaskDetail, t: props.t, useCatalog: props.useCatalog, onRetry: props.onRetry }) }));
}
//# sourceMappingURL=ScheduleTurnCard.js.map