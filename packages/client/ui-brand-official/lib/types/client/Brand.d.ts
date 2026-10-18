import type { SidebarBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client';
/**
 * Render the standalone mark only when the host is not showing the full wordmark.
 * @param props - Host-supplied mark presentation.
 * @returns the approved StudyBuddy mark.
 */
export declare function OfficialBrandMark({ size, wide }: SidebarBrandMarkOwnerProps): import("react").JSX.Element | null;
/**
 * Render the complete wordmark with its single integrated mascot letter.
 * @returns the official name wordmark.
 */
export declare function OfficialBrandName(): import("react").JSX.Element;
/** Approved compact mark for the conversation hero. */
export declare function StudyBuddyHeroMark({ size, className }: {
    size: number;
    className?: string | undefined;
}): import("react").JSX.Element;
//# sourceMappingURL=Brand.d.ts.map