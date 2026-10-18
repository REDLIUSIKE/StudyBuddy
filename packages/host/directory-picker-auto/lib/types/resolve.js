/**
 * Boot-time backend resolution for the adaptive directory-picker composition:
 * one pure decision from sampled host facts to a concrete backend kind. The
 * caller samples exactly once per boot, so the mounted capability stays
 * stable for the service lifetime as the seam requires.
 * @module @deepseek-ai/dsh-host-directory-picker-auto/resolve
 */
import { isLoopbackHost } from '@deepseek-ai/dsh-host-webserver';
/** An env value counts only when set and non-blank (an empty export is "unset" by shell convention). */
const present = (value) => value !== undefined && value !== '';
/**
 * Resolve which backend serves this boot. `native` requires every signal that
 * the operator can see the host display and the native backend can serve it:
 * no remote-authority trust, a loopback bind (remote-authority trust or a
 * non-loopback bind admits remote browsers no OS chooser can reach), no SSH
 * launch (a forwarded connection cannot display the server's chooser), and a
 * servable display session — assumed on darwin/win32, requiring
 * `DISPLAY`/`WAYLAND_DISPLAY` plus a chooser binary on linux, and never true
 * elsewhere (the native backend drives exactly darwin/win32/linux). Anything
 * ambiguous resolves to
 * `browse`, which works everywhere.
 * @param facts - the sampled host facts.
 * @returns the backend kind to mount.
 */
export function resolveDirectoryPickerBackend(facts) {
    if (facts.allowsRemoteAuthorities || !isLoopbackHost(facts.bindHost))
        return 'browse';
    if (facts.ssh)
        return 'browse';
    if (facts.platform === 'darwin' || facts.platform === 'win32')
        return 'native';
    if (facts.platform !== 'linux' || !facts.linuxChooser)
        return 'browse';
    return present(facts.env.DISPLAY) || present(facts.env.WAYLAND_DISPLAY) ? 'native' : 'browse';
}
//# sourceMappingURL=resolve.js.map