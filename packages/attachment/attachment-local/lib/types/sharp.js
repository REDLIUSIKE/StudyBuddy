/** Process-realm lazy access to Sharp's CommonJS-compatible entry. */
import { createLazyRequire } from '@deepseek-ai/dsh-lazy-require';
/** Load Sharp on the first raster operation and retain its callable export. */
export const requireSharp = createLazyRequire('sharp', import.meta.url);
//# sourceMappingURL=sharp.js.map