/** Provider-list display extracted from the native Models settings section. */
import type { ButtonHTMLAttributes, ReactNode } from 'react';
/** Pure provider display; credential dots describe only the supplied credential fact. */
export interface ModelProviderRowProps {
    name: string;
    tag?: string | undefined;
    credential?: {
        configured: boolean;
        label: string;
    } | undefined;
    /** Current model availability, supplied by the account's revision-bound authority. */
    readiness?: {
        state: 'ready' | 'failed' | 'pending' | 'unknown';
        label: string;
    } | undefined;
    status?: ReactNode;
    editLabel: string;
    editAccessibleLabel: string;
    editDisabled?: boolean | undefined;
    onEdit: () => void;
    extraActions?: ReactNode;
    children?: ReactNode;
}
/**
 * Render the native single-column provider list without settings or credential operations.
 * @param props - provider rows, including any owner-rendered setup card.
 * @returns the list with the native Models spacing.
 */
export declare function ModelProviderList({ children }: {
    children: ReactNode;
}): import("react").JSX.Element;
/**
 * Render one provider row with owner-supplied status and edit behavior.
 * @param props - display facts, localized labels and callbacks belonging to the caller.
 * @returns a native provider row; a configured credential does not imply model readiness.
 */
export declare function ModelProviderRow({ name, tag, credential, readiness, status, editLabel, editAccessibleLabel, editDisabled, onEdit, extraActions, children, }: ModelProviderRowProps): import("react").JSX.Element;
/**
 * Render the original full-width dashed add entry.
 * @param props - localized text and native button attributes; the caller owns creation.
 * @returns the add row with the original plus icon and keyboard behavior.
 */
export declare function ModelProviderAddButton({ label, ...props }: {
    label: string;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'className'>): import("react").JSX.Element;
//# sourceMappingURL=ModelProviderList.d.ts.map