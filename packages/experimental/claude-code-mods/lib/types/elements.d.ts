/**
 * The element vocabulary a `ui.render` hook answers with — Claude Code's
 * `Box`, `Text`, and `Button` constructors — and what the host does with a
 * tree: validate it, serialize it with callbacks replaced by action ids, and
 * search it the way a mod's test does.
 * @module
 */
import type { SerializedNode } from './types.ts';
/** One element a constructor returns; `props` are the constructor's argument, frozen. */
export interface UiElement {
    readonly type: 'Box' | 'Text' | 'Button';
    readonly props: Readonly<Record<string, unknown>>;
}
/** What a `ui.render` hook returns: an element, text, nothing, or a list of those. */
export type UiNode = UiElement | string | number | null | undefined | false | readonly UiNode[];
/** `Box` props this host lays out; a prop set to `undefined` is one a mod left out. */
export interface BoxProps {
    readonly flexDirection?: 'row' | 'column' | undefined;
    readonly paddingX?: number | undefined;
    readonly paddingY?: number | undefined;
    readonly padding?: number | undefined;
    readonly gap?: number | undefined;
    readonly border?: boolean | string | undefined;
    readonly borderColor?: string | undefined;
    readonly children?: UiNode | undefined;
}
/** `Text` props this host styles. */
export interface TextProps {
    readonly color?: string | undefined;
    readonly bold?: boolean | undefined;
    readonly dimColor?: boolean | undefined;
    readonly italic?: boolean | undefined;
    readonly underline?: boolean | undefined;
    readonly children?: UiNode | undefined;
}
/** `Button` props: a label, an optional hotkey hint, and the callback a press runs on the host. */
export interface ButtonProps {
    readonly label: string;
    readonly hotkey?: string | undefined;
    readonly disabled?: boolean | undefined;
    readonly onPress?: (() => unknown) | undefined;
}
/** The constructors `$.ui.resolve(e)` returns. */
export interface UiElements {
    readonly Box: (props: BoxProps) => UiElement;
    readonly Text: (props: TextProps) => UiElement;
    readonly Button: (props: ButtonProps) => UiElement;
}
export type { SerializedElement, SerializedNode } from './types.ts';
/**
 * Whether a value is an element one of this host's constructors returned.
 * @param value - the candidate.
 * @returns true for a constructor-made element.
 */
export declare function isUiElement(value: unknown): value is UiElement;
/**
 * The element constructors for one render.
 * @returns `Box`, `Text`, and `Button`.
 */
export declare function uiElements(): UiElements;
/**
 * Check a `ui.render` answer against the vocabulary.
 * @param node - the hook's answer.
 * @returns undefined for a valid tree, or the reason it does not validate.
 */
export declare function treeProblem(node: UiNode): string | undefined;
/**
 * Serialize a validated tree for a client: scalars kept, children flattened,
 * each `onPress` replaced by the id `holdAction` returns for it.
 * @param node - the hook's answer, already validated with {@link treeProblem}.
 * @param holdAction - stores one callback and returns its id.
 * @returns the serialized nodes, in drawing order.
 */
export declare function serializeTree(node: UiNode, holdAction: (callback: () => unknown) => string): SerializedNode[];
/** What a tree search matches on. */
export interface TreePattern {
    readonly type?: UiElement['type'];
    /** Text drawn by the element, including its descendants; a string matches as a substring. */
    readonly text?: string | RegExp;
    /** A Button's label. */
    readonly label?: string | RegExp;
}
/**
 * Every element of a tree matching a pattern, in drawing order.
 * @param node - the tree.
 * @param pattern - the type, text, and label to match; an empty pattern matches every element.
 * @returns the matching elements.
 */
export declare function findAll(node: UiNode, pattern: TreePattern): UiElement[];
/**
 * The plain text a tree draws, one line per top-level node: the test kit's and the host log's view of a surface.
 * @param node - the tree.
 * @returns the drawn text.
 */
export declare function renderText(node: UiNode): string;
//# sourceMappingURL=elements.d.ts.map