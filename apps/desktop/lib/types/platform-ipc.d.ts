/** Shared names for the desktop Platform bridge. */
/** Private desktop channels; the Platform renderer receives bootstrap and locale updates. */
export declare const PLATFORM_IPC: {
    readonly bootstrap: "dsh-platform:bootstrap";
    readonly localeChanged: "dsh-platform:locale-changed";
    readonly open: "dsh-platform:open";
    readonly bounds: "dsh-platform:bounds";
    readonly close: "dsh-platform:close";
};
/** Resolved Platform language; Desktop resolves the system preference before sending it. */
export type PlatformLocale = 'en_US' | 'zh_CN';
//# sourceMappingURL=platform-ipc.d.ts.map