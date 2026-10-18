/**
 * Client-side parsing, description, and structured shapes of the five-field
 * cron expressions the Run time card edits.
 *
 * The Host owns canonicalization, occurrence selection, and dispatch. This
 * module parses the same dialect so the card can reject a malformed expression
 * locally, describe a valid one without a Host round trip, and recognize the
 * common shapes the card's cron builder edits as structured rows.
 */
import { assertNever } from '@deepseek-ai/dsh-util-values';
/** Field bounds of the supported dialect, in `minute hour day-of-month month day-of-week` order. */
const CRON_FIELDS = [
    { min: 0, max: 59, count: 60 },
    { min: 0, max: 23, count: 24 },
    { min: 1, max: 31, count: 31 },
    { min: 1, max: 12, count: 12 },
    { min: 0, max: 7, count: 7, foldMax: 7 },
];
/** One stepped element over the whole field. */
const CRON_STEP = /^\*\/(?<step>\d+)$/;
/** One value, range, or range with step. */
const CRON_ELEMENT = /^(?<start>\d+)(?:-(?<end>\d+))?(?:\/(?<step>\d+))?$/;
/** ISO weekday dictionary keys indexed by ISO weekday minus one. */
const CRON_WEEKDAY_KEYS = [
    'frequency.weekday.1', 'frequency.weekday.2', 'frequency.weekday.3', 'frequency.weekday.4',
    'frequency.weekday.5', 'frequency.weekday.6', 'frequency.weekday.7',
];
/** Most clock times the description spells out before it names minutes and hours instead. */
const CRON_TIME_LIST_LIMIT = 6;
/**
 * List one inclusive arithmetic range.
 * @param from - first value.
 * @param to - last value.
 * @param step - positive increment.
 * @returns ascending values from `from` through `to`.
 */
function ascendingRange(from, to, step) {
    const values = [];
    for (let value = from; value <= to; value += step)
        values.push(value);
    return values;
}
/**
 * Read one in-range field element value.
 * @param text - digits of one element value.
 * @param spec - bounds of the field it belongs to.
 * @returns the value, or undefined when it is outside the field.
 */
function cronValue(text, spec) {
    const value = Number(text);
    return Number.isSafeInteger(value) && value >= spec.min && value <= spec.max ? value : undefined;
}
/**
 * Read one positive field step.
 * @param text - digits of one step.
 * @returns the step, or undefined when it is not a positive safe integer.
 */
function cronStep(text) {
    const value = Number(text);
    return Number.isSafeInteger(value) && value >= 1 ? value : undefined;
}
/**
 * Expand one comma-separated element into the values it matches.
 * @param element - one element of a field.
 * @param spec - bounds of the field it belongs to.
 * @returns matched values, or undefined when the Host would reject the element.
 */
function cronElementValues(element, spec) {
    if (element.length === 0)
        return undefined;
    if (element === '*')
        return ascendingRange(spec.min, spec.max, 1);
    if (element.startsWith('*')) {
        const groups = CRON_STEP.exec(element)?.groups;
        if (groups === undefined)
            return undefined;
        const stepText = groups['step'];
        /* v8 ignore next -- a successful fixed regex always provides the step group. */
        if (stepText === undefined)
            return undefined;
        const step = cronStep(stepText);
        return step === undefined ? undefined : ascendingRange(spec.min, spec.max, step);
    }
    const groups = CRON_ELEMENT.exec(element)?.groups;
    if (groups === undefined)
        return undefined;
    const startText = groups['start'];
    /* v8 ignore next -- a successful fixed regex always provides the start group. */
    if (startText === undefined)
        return undefined;
    const start = cronValue(startText, spec);
    if (start === undefined)
        return undefined;
    const end = groups['end'];
    if (end === undefined)
        return groups['step'] === undefined ? [start] : undefined;
    const last = cronValue(end, spec);
    if (last === undefined || start > last)
        return undefined;
    const stepText = groups['step'];
    const step = stepText === undefined ? 1 : cronStep(stepText);
    return step === undefined ? undefined : ascendingRange(start, last, step);
}
/**
 * Expand one whitespace-free cron field into its matched value set.
 * @param raw - one field of the expression.
 * @param spec - bounds of that field.
 * @returns unique ascending values with Sunday folded, or undefined when malformed.
 */
function cronFieldValues(raw, spec) {
    const matched = new Set();
    for (const element of raw.split(',')) {
        const values = cronElementValues(element, spec);
        if (values === undefined)
            return undefined;
        for (const value of values)
            matched.add(value === spec.foldMax ? spec.min : value);
    }
    return [...matched].sort((left, right) => left - right);
}
/**
 * Failure reading a value the cron parser's own matching already proved present.
 */
/* v8 ignore next -- constructed only by the unreachable bounds guard below. */
class CronInvariantError extends Error {
    /**
     * Construct an invariant failure.
     * @param message - violated invariant.
     */
    constructor(message) {
        super(message);
        this.name = 'CronInvariantError';
    }
}
/**
 * Read one array element the caller's own length guard already bounds.
 * @param values - array whose length the caller checked.
 * @param index - index inside that length.
 * @returns the element at that index.
 */
function cronElementAt(values, index) {
    const value = values[index];
    /* v8 ignore next -- every caller reads an index inside an array length it already proved. */
    if (value === undefined)
        throw new CronInvariantError('cron description read an index outside its array');
    return value;
}
/**
 * Parse one five-field cron expression in the dialect the Host accepts.
 * @param expression - candidate `minute hour day-of-month month day-of-week` text.
 * @returns parsed fields, or undefined when the Host would reject the expression.
 */
export function parseCronExpression(expression) {
    if (expression.length === 0 || expression.trim() !== expression)
        return undefined;
    const fields = expression.split(/\s+/);
    if (fields.length !== 5)
        return undefined;
    const parsed = fields.map((field, index) => {
        const spec = cronElementAt(CRON_FIELDS, index);
        const values = cronFieldValues(field, spec);
        return values === undefined
            ? undefined
            : (() => {
                // The star flag reads the field text's first character, exactly as the
                // Host's `parseCronField` does; full coverage is a separate fact, because
                // `*/2` is a star field that still restricts and `1-31` covers everything
                // without being a star field.
                const starred = field.startsWith('*');
                const full = values.length === spec.count;
                return { values, starred, full, unrestricted: starred && full };
            })();
    });
    const [minutes, hours, daysOfMonth, months, daysOfWeek] = parsed;
    if (minutes === undefined || hours === undefined || daysOfMonth === undefined
        || months === undefined || daysOfWeek === undefined)
        return undefined;
    return { minutes, hours, daysOfMonth, months, daysOfWeek };
}
/**
 * Zero one field value to two digits.
 * @param value - number to spell.
 * @returns the value padded to at least two digits.
 */
function twoDigits(value) {
    return String(value).padStart(2, '0');
}
/**
 * Split ascending values into runs of consecutive numbers.
 * @param values - unique ascending values.
 * @returns the runs, each ascending, in value order.
 */
function consecutiveRuns(values) {
    const runs = [];
    for (const value of values) {
        const run = runs[runs.length - 1];
        if (run !== undefined && cronElementAt(run, run.length - 1) + 1 === value)
            run.push(value);
        else
            runs.push([value]);
    }
    return runs;
}
/**
 * Join one list of numbers with the localized list separator.
 * @param values - numbers to spell.
 * @param t - cron translations supplying the separator.
 * @returns the localized list.
 */
function numberList(values, t) {
    return values.map(String).join(t('cron.list.join'));
}
/**
 * Render cron weekdays as localized names, collapsing a run of three or more
 * consecutive days into one range.
 * @param values - cron weekdays, Sunday 0 through Saturday 6, ascending.
 * @param t - cron and weekday translations.
 * @returns localized weekday text, for example `Mon–Fri` or `Mon, Wed`.
 */
function cronWeekdayText(values, t) {
    const join = t('cron.list.join');
    const name = (day) => t('cron.weekday.name', { weekday: t(cronElementAt(CRON_WEEKDAY_KEYS, day - 1)) });
    const iso = values.map(value => (value === 0 ? 7 : value)).sort((left, right) => left - right);
    return consecutiveRuns(iso).map(run => run.length >= 3
        ? t('cron.weekday.range', { from: name(cronElementAt(run, 0)), to: name(cronElementAt(run, run.length - 1)) })
        : run.map(name).join(join)).join(join);
}
/**
 * Name the months a rule restricts, or nothing when it matches every month.
 * @param values - matched months, January 1 through December 12.
 * @param locale - active UI locale naming the months.
 * @param t - cron translations.
 * @returns localized month suffix, or an empty string for all twelve months.
 */
function cronMonthSuffix(values, locale, t) {
    if (values.length === 12)
        return '';
    const format = new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' });
    const months = values.map(month => format.format(Date.UTC(2026, month - 1, 1))).join(t('cron.list.join'));
    return t('cron.months', { months });
}
/**
 * Describe the days one parsed rule matches.
 * @param parsed - parsed cron expression.
 * @param locale - active UI locale naming restricted months.
 * @param t - cron translations.
 * @returns whether the phrase states no day restriction at all, and the localized day phrase.
 */
function cronDayText(parsed, locale, t) {
    const months = cronMonthSuffix(parsed.months.values, locale, t);
    const weekdays = cronWeekdayText(parsed.daysOfWeek.values, t);
    const days = numberList(parsed.daysOfMonth.values, t);
    const params = { days, weekdays, months };
    const dayOfMonth = parsed.daysOfMonth;
    const dayOfWeek = parsed.daysOfWeek;
    // The Host requires both day fields when either field text starts with `*`, and
    // otherwise accepts either field matching, so a star on either side narrows the
    // phrase to the intersection. A field covering every value adds nothing to that
    // intersection (and covers everything in a union).
    if (dayOfMonth.starred || dayOfWeek.starred) {
        if (dayOfMonth.full && dayOfWeek.full)
            return { everyDay: months === '', text: t('cron.day.every', { months }) };
        if (dayOfMonth.full)
            return { everyDay: false, text: t('cron.day.weekdays', params) };
        if (dayOfWeek.full)
            return { everyDay: false, text: t('cron.day.monthDays', params) };
        return { everyDay: false, text: t('cron.day.bothStarred', params) };
    }
    if (dayOfMonth.full || dayOfWeek.full)
        return { everyDay: months === '', text: t('cron.day.every', { months }) };
    return { everyDay: false, text: t('cron.day.both', params) };
}
/**
 * Name a restricted hour set as a contiguous range or an explicit list.
 * @param values - matched hours, ascending.
 * @param t - cron translations.
 * @returns localized hour scope, for example `09–17` or `09, 15`.
 */
function cronHourText(values, t) {
    const hours = values.map(twoDigits);
    const contiguous = hours.length >= 2
        && cronElementAt(values, values.length - 1) - cronElementAt(values, 0) === values.length - 1;
    return contiguous
        ? t('cron.hours.range', { from: cronElementAt(hours, 0), to: cronElementAt(hours, hours.length - 1) })
        : t('cron.hours.list', { hours: hours.join(t('cron.list.join')) });
}
/**
 * Read the uniform step of a field that covers its whole range.
 * @param values - unique ascending matched values.
 * @param min - lowest value of the field.
 * @param max - highest value of the field.
 * @returns the step when the values cover the whole field in equal increments, otherwise undefined.
 */
function cronFullRangeStep(values, min, max) {
    if (values.length < 2)
        return undefined;
    const first = cronElementAt(values, 0);
    if (first !== min)
        return undefined;
    const step = cronElementAt(values, 1) - first;
    for (let index = 1; index < values.length; index += 1) {
        if (cronElementAt(values, index) - cronElementAt(values, index - 1) !== step)
            return undefined;
    }
    return cronElementAt(values, values.length - 1) + step > max ? step : undefined;
}
/**
 * Describe the times of day one parsed rule matches.
 *
 * `interval` marks the phrases that state the repetition themselves; they read
 * as a whole sentence on their own and need the lower-case `joined` wording
 * when a day phrase precedes them.
 * @param parsed - parsed cron expression.
 * @param t - cron translations.
 * @returns whether the phrase states the repeating interval itself, its standalone
 * text, and its text after a day phrase.
 */
function cronTimeText(parsed, t) {
    const step = parsed.minutes.unrestricted ? undefined : cronFullRangeStep(parsed.minutes.values, 0, 59);
    if (parsed.hours.unrestricted) {
        if (parsed.minutes.unrestricted) {
            return { interval: true, text: t('cron.time.everyMinute'), joined: t('cron.time.joinedEveryMinute') };
        }
        if (step !== undefined && step >= 2) {
            return {
                interval: true,
                text: t('cron.time.everyMinutes', { step }),
                joined: t('cron.time.joinedEveryMinutes', { step }),
            };
        }
        // One minute past every hour is the hour itself when that minute is zero:
        // `0 * * * *` reads as `Every hour` rather than naming its zero minute.
        if (parsed.minutes.values.length === 1 && cronElementAt(parsed.minutes.values, 0) === 0) {
            return {
                interval: true,
                text: t('cron.time.everyHour'),
                joined: t('cron.time.joinedEveryHour'),
            };
        }
        const text = t('cron.time.hourlyAt', { minutes: numberList(parsed.minutes.values, t) });
        return {
            interval: false,
            text,
            joined: t('cron.time.joinedHourlyAt', { minutes: numberList(parsed.minutes.values, t) }),
        };
    }
    const hours = cronHourText(parsed.hours.values, t);
    if (parsed.minutes.unrestricted) {
        const text = t('cron.time.hoursEveryMinute', { hours });
        return { interval: false, text, joined: text };
    }
    if (step !== undefined && step >= 2) {
        const text = t('cron.time.hoursEveryMinutes', { hours, step });
        return { interval: false, text, joined: text };
    }
    // A zero minute over an evenly stepped hour set repeats whole hours: `0 */2 * * *`
    // reads as `Every 2 hours` rather than naming its zero minute.
    const hourStep = cronFullRangeStep(parsed.hours.values, 0, 23);
    if (parsed.minutes.values.length === 1 && cronElementAt(parsed.minutes.values, 0) === 0
        && hourStep !== undefined && hourStep >= 2) {
        return {
            interval: true,
            text: t('cron.time.everyNHours', { count: hourStep }),
            joined: t('cron.time.joinedEveryNHours', { count: hourStep }),
        };
    }
    const times = parsed.hours.values.flatMap(hour => parsed.minutes.values.map(minute => `${twoDigits(hour)}:${twoDigits(minute)}`));
    const text = times.length <= CRON_TIME_LIST_LIMIT
        ? t('cron.time.at', { times: times.join(t('cron.list.join')) })
        : t('cron.time.hoursAt', { hours, minutes: numberList(parsed.minutes.values, t) });
    return { interval: false, text, joined: text };
}
/**
 * Describe one parsed cron expression as one localized sentence.
 * @param parsed - parsed cron expression.
 * @param t - cron translations.
 * @param locale - active UI locale naming restricted months.
 * @returns localized sentence, for example `Mon–Fri at 09:00` or `Every 15 minutes`.
 */
export function cronPreview(parsed, t, locale) {
    const day = cronDayText(parsed, locale, t);
    const time = cronTimeText(parsed, t);
    return day.everyDay && time.interval ? time.text : [day.text, time.joined].join(t('cron.part.join'));
}
/**
 * Recognize the structured shape one parsed expression states, when one does.
 *
 * Every shape requires an unrestricted month. Exactly one of the two day fields
 * may restrict: a restricted weekday beside a star day-of-month is a weekly
 * rule, a restricted day-of-month beside a star weekday is a monthly rule, and
 * both restricting is unrecognized because each restriction matches
 * independently under the Host's Vixie union rule. Only a literal star states a
 * day field with no restriction: a written-out full set such as `0-6` or `1-31`
 * stays a weekly or monthly rule with every value selected, so toggling the
 * last pill on never collapses its row. Stepped shapes accept any uniform
 * full-range step on the clock, spelled with a star or written out, since both
 * match the same minutes or hours.
 * @param parsed - parsed cron expression.
 * @returns the shape the builder can edit, or undefined for the raw-expression fallback.
 */
export function recognizeCronShape(parsed) {
    if (!parsed.months.full)
        return undefined;
    const minuteStep = parsed.minutes.unrestricted ? 1 : cronFullRangeStep(parsed.minutes.values, 0, 59);
    const hourStep = parsed.hours.unrestricted ? 1 : cronFullRangeStep(parsed.hours.values, 0, 23);
    const minute = parsed.minutes.values.length === 1 ? cronElementAt(parsed.minutes.values, 0) : undefined;
    const hour = parsed.hours.values.length === 1 ? cronElementAt(parsed.hours.values, 0) : undefined;
    if (parsed.daysOfWeek.unrestricted) {
        if (parsed.daysOfMonth.unrestricted) {
            if (minuteStep !== undefined && parsed.hours.full)
                return { kind: 'minutely', step: minuteStep };
            if (minute !== undefined && hourStep !== undefined)
                return { kind: 'hourly', step: hourStep, minute };
            if (minute !== undefined && hour !== undefined)
                return { kind: 'daily', hour, minute };
            return undefined;
        }
        if (minute === undefined || hour === undefined)
            return undefined;
        return { kind: 'monthly', days: parsed.daysOfMonth.values, hour, minute };
    }
    if (!parsed.daysOfMonth.unrestricted || minute === undefined || hour === undefined)
        return undefined;
    const weekdays = parsed.daysOfWeek.values
        .map(value => (value === 0 ? 7 : value))
        .sort((left, right) => left - right);
    return { kind: 'weekly', weekdays, hour, minute };
}
/**
 * Spell ascending unique field values as cron list text, collapsing a run of
 * three or more consecutive values into one range.
 * @param values - ascending unique field values.
 * @returns cron list text, for example `1-3,10`.
 */
function cronRunField(values) {
    return consecutiveRuns(values)
        .map(run => (run.length >= 3 ? `${cronElementAt(run, 0)}-${cronElementAt(run, run.length - 1)}` : run.join(',')))
        .join(',');
}
/**
 * Spell one builder shape's weekday set as a cron day-of-week field.
 * @param weekdays - ISO weekdays, Monday 1 through Sunday 7.
 * @returns ascending cron weekday field text, Sunday spelled as 0.
 */
function cronWeekdayField(weekdays) {
    return cronRunField([...new Set(weekdays.map(day => day % 7))].sort((left, right) => left - right));
}
/**
 * Spell one builder shape as the five-field expression a save submits.
 *
 * `recognizeCronShape` recognizes every expression this returns as the same
 * shape, so a builder edit never falls back to the raw-expression row.
 * @param state - builder shape to spell.
 * @returns the expression stating that shape.
 */
export function cronShapeExpression(state) {
    switch (state.kind) {
        case 'minutely': return state.step === 1 ? '* * * * *' : `*/${state.step} * * * *`;
        case 'hourly': return state.step === 1
            ? `${state.minute} * * * *`
            : `${state.minute} */${state.step} * * *`;
        case 'daily': return `${state.minute} ${state.hour} * * *`;
        case 'weekly': return `${state.minute} ${state.hour} * * ${cronWeekdayField(state.weekdays)}`;
        case 'monthly': return `${state.minute} ${state.hour} ${cronRunField([...new Set(state.days)].sort((left, right) => left - right))} * *`;
        /* v8 ignore next -- every CronBuilderState kind has a case above. */
        default: return assertNever(state);
    }
}
//# sourceMappingURL=task-cron.js.map