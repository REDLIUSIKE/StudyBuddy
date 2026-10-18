export const IMAGE_TAB_ID = 'studybuddy-conversation-image';
export function imageAddress(target) {
    return `dsh-resource://conversation-image/${encodeURIComponent(target.sessionId)}?${new URLSearchParams({ src: target.src, name: target.name })}`;
}
export function parseImageAddress(address) {
    if (address.length > 24000)
        return undefined;
    try {
        const url = new URL(address);
        if (url.protocol !== 'dsh-resource:' || url.hostname !== 'conversation-image')
            return undefined;
        const sessionId = decodeURIComponent(url.pathname.slice(1));
        const src = url.searchParams.get('src') ?? '';
        const name = url.searchParams.get('name') ?? '';
        const source = new URL(src);
        if (sessionId === '' || sessionId.length > 200 || name.length > 160 || src.length > 8192
            || !((source.protocol === 'dsh-app:' && source.hostname === 'app' && source.pathname.startsWith('/api/'))
                || ((source.protocol === 'http:' || source.protocol === 'https:') && source.username === '' && source.password === '')
                || (source.protocol === 'blob:' && src.startsWith('blob:dsh-app://app/'))))
            return undefined;
        return { sessionId, src, name };
    }
    catch {
        return undefined;
    }
}
export function imageDefinition(title) {
    return { id: IMAGE_TAB_ID, kind: IMAGE_TAB_ID, patterns: ['dsh-resource://conversation-image/**'], priority: 'builtin',
        canOpen: address => parseImageAddress(address) !== undefined, title: address => parseImageAddress(address)?.name || title() };
}
//# sourceMappingURL=definition.js.map