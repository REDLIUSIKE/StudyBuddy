/** Cover mode retains DOM-layered pages under menus; native surfaces keep the concealment default. */
export function projectEmbeddedSurface(container, menus = 'hide') {
    const overlay = Array.from(document.querySelectorAll('[role="dialog"][aria-modal="true"],[role="menu"]')).some((element) => {
        if (menus === 'cover' && element.getAttribute('role') === 'menu')
            return false;
        if (container && element.getAttribute('role') === 'dialog' && element.contains(container))
            return false;
        const style = getComputedStyle(element);
        return style.display !== 'none' && style.visibility !== 'hidden' && element.getAttribute('aria-hidden') !== 'true';
    });
    const rect = container?.getBoundingClientRect();
    return {
        bounds: rect ? { x: rect.left, y: rect.top, width: rect.width, height: rect.height } : null,
        visible: !!container?.isConnected && !!rect && rect.width > 0 && rect.height > 0 && !overlay,
    };
}
/** Observe the container and foreground DOM; dispose disconnects all observers/listeners. */
export function observeEmbeddedSurface(container, listener) {
    let frame = null, disposed = false;
    const queue = () => {
        if (disposed || frame !== null)
            return;
        frame = requestAnimationFrame(() => {
            frame = null;
            if (!disposed)
                listener(projectEmbeddedSurface(container));
        });
    };
    const mutations = new MutationObserver(queue), resize = new ResizeObserver(queue);
    mutations.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['open', 'hidden', 'aria-hidden', 'style', 'class'],
    });
    resize.observe(container);
    document.addEventListener('scroll', queue, true);
    window.addEventListener('resize', queue);
    queue();
    return () => {
        if (disposed)
            return;
        disposed = true;
        mutations.disconnect();
        resize.disconnect();
        document.removeEventListener('scroll', queue, true);
        window.removeEventListener('resize', queue);
        if (frame !== null)
            cancelAnimationFrame(frame);
    };
}
/** Capture the existing finite, sanitized theme variables without business state. */
export function readEmbeddedSurfaceTheme() {
    const style = getComputedStyle(document.body), variables = {};
    for (let i = 0; i < style.length; i++) {
        const name = style.item(i);
        if (/^--(?:dsw-|dsh-(?:content-font-size|terminal-font-size|font-family))/.test(name)) {
            const value = style.getPropertyValue(name).trim();
            if (value && value.length <= 256 && !/[;{}<>]|url\s*\(|@/i.test(value))
                variables[name] = value;
        }
    }
    return {
        mode: document.body.hasAttribute('data-ds-dark-theme') ||
            document.documentElement.style.colorScheme === 'dark' ||
            document.documentElement.dataset.theme === 'dark' ||
            document.body.dataset.theme === 'dark'
            ? 'dark'
            : 'light',
        variables,
    };
}
//# sourceMappingURL=embedded-surface-geometry.js.map