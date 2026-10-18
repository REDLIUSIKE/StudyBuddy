import type { AccountLocaleKey } from './locales.ts';
export declare function ErrorNotice({ code, t, retry }: {
    code: string | null;
    t: (key: AccountLocaleKey) => string;
    retry?: () => void;
}): import("react").JSX.Element | null;
//# sourceMappingURL=ErrorNotice.d.ts.map