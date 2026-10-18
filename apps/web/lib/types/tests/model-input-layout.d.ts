/** Model input types stay below both capacity fields across editor widths. */
import type { Locator, Page } from 'playwright';
/**
 * Verify the expanded row at the current viewport and a narrow viewport.
 * @param page - page with an explicit viewport, restored even when an assertion fails.
 * @param editor - expanded model editor containing the capacity and input-type fields.
 * @returns after checking both widths and restoring the caller's size.
 */
export declare function assertModelInputLayout(page: Page, editor: Locator): Promise<void>;
//# sourceMappingURL=model-input-layout.d.ts.map