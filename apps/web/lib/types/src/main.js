/** Browser entry for the Web client. */
import '@deepseek-ai/dsh-client-ui-theme/brand-font.css';
import { AppWebEntry, applyIndexInjections } from '@deepseek-ai/dsh-client-web';
const desktop = globalThis.dshDesktopBoot;
const reportFailure = (reason) => {
    if (desktop === undefined)
        throw reason;
    void desktop.failed(reason instanceof Error ? reason.message : String(reason)).catch(console.error);
};
try {
    const el = document.getElementById('root');
    if (el === null)
        throw new Error('web app: missing #root');
    const entry = new AppWebEntry(el);
    if (desktop !== undefined) {
        const gate = globalThis.__DSH_BOOT_READY__;
        if (gate === undefined)
            throw new Error('desktop web: boot readiness is missing');
        void desktop.ready().then(async ({ injections, streamBaseUrl }) => {
            const transport = globalThis;
            transport.__DSH_TRANSPORT__ = { ownsHost: true, streamBaseUrl };
            await applyIndexInjections(injections, src => new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = src;
                script.onload = () => { resolve(); };
                script.onerror = () => { reject(new Error(`desktop web: failed to load ${src}`)); };
                document.head.append(script);
            }));
            gate.resolve();
        }).catch((error) => { gate.reject(error); });
    }
    void entry.run(desktop === undefined ? undefined : reportFailure);
}
catch (reason) {
    reportFailure(reason);
}
//# sourceMappingURL=main.js.map