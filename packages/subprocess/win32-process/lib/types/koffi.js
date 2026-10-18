/** Process-realm lazy access to Koffi's CommonJS entry. */
import { createLazyRequire } from '@deepseek-ai/dsh-lazy-require';
/** Load Koffi on the first Win32 native operation. */
export const requireKoffi = createLazyRequire('koffi', import.meta.url);
//# sourceMappingURL=koffi.js.map