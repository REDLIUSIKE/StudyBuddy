/** Windows caption menu labels and native popup anchors, isolated from the Web client. */
import { ipcRenderer } from 'electron';
import { DESKTOP_IPC } from "./ipc.js";
import { resolveDesktopLocale } from "./locale.js";
/**
 * Mount the Windows caption menubar without moving focus out of the active editor.
 * @returns Language refresh and document teardown operations.
 */
export function installWindowsMenu() {
    const host = document.createElement('div');
    host.dataset.windowsMenu = '';
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `
    :host { position: fixed; top: 0; left: var(--dsh-windows-menu-start, 48px); z-index: 1100;
      height: var(--dsh-windows-titlebar-height); display: flex; align-items: center;
      font-family: var(--dsw-font-family); -webkit-app-region: no-drag; }
    [role=menubar] { display: flex; gap: 2px; }
    button { height: 28px; padding: 0 10px; border: 0; border-radius: 6px;
      background: transparent; color: var(--dsw-alias-label-secondary);
      font: inherit; font-size: 14px; cursor: default; }
    button:hover, button[aria-expanded=true] { background: var(--dsw-alias-interactive-bg-hover);
      color: var(--dsw-alias-label-primary); }
    button:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: -2px; }
    :host-context(html[data-input-modality='pointer']) button:focus-visible { outline-color: transparent; }
  `;
    const bar = document.createElement('div');
    bar.setAttribute('role', 'menubar');
    let restoreEditor = () => { };
    const rememberEditor = (event) => {
        const target = event.composedPath()[0];
        if (!(target instanceof HTMLElement) || target === host || shadow.contains(target))
            return;
        if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLTextAreaElement)
            && !target.matches('[contenteditable="true"]'))
            return;
        const selection = document.getSelection();
        const ranges = selection === null ? [] : Array.from({ length: selection.rangeCount }, (_, i) => selection.getRangeAt(i).cloneRange());
        const input = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement ? target : undefined;
        const start = input?.selectionStart;
        const end = input?.selectionEnd;
        const direction = input?.selectionDirection;
        restoreEditor = () => {
            if (!target.isConnected)
                return;
            target.focus({ preventScroll: true });
            if (input !== undefined && start != null && end != null)
                input.setSelectionRange(start, end, direction ?? undefined);
            else if (selection !== null && ranges.length > 0) {
                selection.removeAllRanges();
                for (const range of ranges)
                    selection.addRange(range);
            }
        };
    };
    document.addEventListener('focusout', rememberEditor, true);
    const createButton = (name, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.setAttribute('role', 'menuitem');
        button.setAttribute('aria-haspopup', 'menu');
        button.setAttribute('aria-expanded', 'false');
        button.tabIndex = index === 0 ? 0 : -1;
        button.addEventListener('pointerdown', (event) => { event.preventDefault(); });
        button.addEventListener('mousedown', (event) => { event.preventDefault(); });
        const open = async () => {
            if (button.getAttribute('aria-expanded') === 'true')
                return;
            const rect = button.getBoundingClientRect();
            button.setAttribute('aria-expanded', 'true');
            if (document.activeElement === host)
                restoreEditor();
            try {
                await ipcRenderer.invoke(DESKTOP_IPC.windowsMenu, name, rect.left, rect.bottom);
            }
            catch (error) {
                console.error('Desktop caption menu failed', error);
            }
            finally {
                button.setAttribute('aria-expanded', 'false');
            }
        };
        button.addEventListener('click', () => { void open(); });
        button.addEventListener('keydown', (event) => {
            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                event.preventDefault();
                const next = buttons[index === 0 ? 1 : 0];
                button.tabIndex = -1;
                next.tabIndex = 0;
                next.focus();
            }
            else if (event.key === 'ArrowDown') {
                event.preventDefault();
                void open();
            }
        });
        bar.append(button);
        return button;
    };
    const buttons = [createButton('application', 0), createButton('edit', 1)];
    shadow.append(style, bar);
    const measure = () => {
        if (!host.isConnected)
            return;
        document.documentElement.style.setProperty('--dsh-windows-menu-width', `${host.getBoundingClientRect().width}px`);
    };
    const resizeObserver = new ResizeObserver(measure);
    const mount = () => {
        // AppFrame owns this seat; boot readiness alone precedes the rendered application.
        if (document.querySelector('[data-shell-overlay]') === null)
            return;
        document.body.append(host);
        observer.disconnect();
        resizeObserver.observe(host);
        measure();
    };
    const observer = new MutationObserver(mount);
    observer.observe(document.body, { childList: true, subtree: true });
    mount();
    const update = () => {
        const { messages } = resolveDesktopLocale(document.documentElement.lang);
        bar.setAttribute('aria-label', messages.menuBar);
        buttons[0].textContent = messages.application;
        buttons[1].textContent = messages.edit;
        measure();
    };
    update();
    return {
        update,
        dispose: () => {
            observer.disconnect();
            resizeObserver.disconnect();
            document.removeEventListener('focusout', rememberEditor, true);
            host.remove();
            document.documentElement.style.removeProperty('--dsh-windows-menu-width');
        },
    };
}
//# sourceMappingURL=preload-menu.js.map