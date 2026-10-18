/**
 * The element vocabulary a `ui.render` hook answers with — Claude Code's
 * `Box`, `Text`, and `Button` constructors — and what the host does with a
 * tree: validate it, serialize it with callbacks replaced by action ids, and
 * search it the way a mod's test does.
 * @module
 */
/** What a serialized tree may carry per prop: scalars only. */
function scalarProps(props) {
    const scalars = {};
    for (const [name, value] of Object.entries(props)) {
        if (name === 'children' || name === 'onPress')
            continue;
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
            scalars[name] = value;
    }
    return scalars;
}
const elementBrand = Symbol('claude-code-mods.element');
function element(type, props) {
    return Object.freeze({ type, props: Object.freeze({ ...props }), [elementBrand]: true });
}
/**
 * Whether a value is an element one of this host's constructors returned.
 * @param value - the candidate.
 * @returns true for a constructor-made element.
 */
export function isUiElement(value) {
    return typeof value === 'object' && value !== null && value[elementBrand] === true;
}
/**
 * The element constructors for one render.
 * @returns `Box`, `Text`, and `Button`.
 */
export function uiElements() {
    return Object.freeze({
        Box: (props) => element('Box', props),
        Text: (props) => element('Text', props),
        Button: (props) => element('Button', props),
    });
}
/** Flatten a node into the elements and text runs it draws, dropping what draws nothing. */
function childrenOf(node) {
    if (node === null || node === undefined || node === false)
        return [];
    if (typeof node === 'string')
        return node.length === 0 ? [] : [node];
    if (typeof node === 'number')
        return [String(node)];
    if (isUiElement(node))
        return [node];
    if (Array.isArray(node))
        return node.flatMap(childrenOf);
    throw new TypeError(`a tree node is ${typeof node}, not an element, text, or a list of them`);
}
/**
 * Check a `ui.render` answer against the vocabulary.
 * @param node - the hook's answer.
 * @returns undefined for a valid tree, or the reason it does not validate.
 */
export function treeProblem(node) {
    try {
        for (const child of childrenOf(node)) {
            if (typeof child === 'string')
                continue;
            if (child.type === 'Button') {
                if (typeof child.props['label'] !== 'string')
                    return 'a Button needs a string label';
                if (child.props['onPress'] !== undefined && typeof child.props['onPress'] !== 'function')
                    return 'a Button onPress must be a function';
                continue;
            }
            const nested = treeProblem(child.props['children']);
            if (nested !== undefined)
                return nested;
        }
        return undefined;
    }
    catch (error) {
        /* v8 ignore next -- childrenOf throws TypeErrors only; the String branch covers a future non-Error throw */
        return error instanceof Error ? error.message : String(error);
    }
}
/**
 * Serialize a validated tree for a client: scalars kept, children flattened,
 * each `onPress` replaced by the id `holdAction` returns for it.
 * @param node - the hook's answer, already validated with {@link treeProblem}.
 * @param holdAction - stores one callback and returns its id.
 * @returns the serialized nodes, in drawing order.
 */
export function serializeTree(node, holdAction) {
    return childrenOf(node).map((child) => {
        if (typeof child === 'string')
            return child;
        if (child.type === 'Button') {
            const onPress = child.props['onPress'];
            return {
                type: 'Button',
                props: scalarProps(child.props),
                children: [],
                ...typeof onPress === 'function' ? { actionId: holdAction(onPress) } : {},
            };
        }
        return { type: child.type, props: scalarProps(child.props), children: serializeTree(child.props['children'], holdAction) };
    });
}
/** The text a node draws, with child texts joined in order. */
function textOf(node) {
    if (typeof node === 'string')
        return node;
    if (node.type === 'Button')
        return String(node.props['label']);
    return childrenOf(node.props['children']).map(textOf).join('');
}
function textMatches(expected, actual) {
    return typeof expected === 'string' ? actual.includes(expected) : expected.test(actual);
}
/**
 * Every element of a tree matching a pattern, in drawing order.
 * @param node - the tree.
 * @param pattern - the type, text, and label to match; an empty pattern matches every element.
 * @returns the matching elements.
 */
export function findAll(node, pattern) {
    const found = [];
    const visit = (child) => {
        if (typeof child === 'string')
            return;
        const matchesType = pattern.type === undefined || child.type === pattern.type;
        const matchesText = pattern.text === undefined || textMatches(pattern.text, textOf(child));
        const matchesLabel = pattern.label === undefined || (child.type === 'Button' && textMatches(pattern.label, String(child.props['label'])));
        if (matchesType && matchesText && matchesLabel)
            found.push(child);
        if (child.type !== 'Button')
            for (const grandchild of childrenOf(child.props['children']))
                visit(grandchild);
    };
    for (const child of childrenOf(node))
        visit(child);
    return found;
}
/**
 * The plain text a tree draws, one line per top-level node: the test kit's and the host log's view of a surface.
 * @param node - the tree.
 * @returns the drawn text.
 */
export function renderText(node) {
    return childrenOf(node).map(textOf).join('\n');
}
//# sourceMappingURL=elements.js.map