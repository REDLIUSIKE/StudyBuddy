const origin = 'https://guijitongzhuo.com';
const entries = { zhilian: '/leaderboards', skills: '/skills' };
/** @param target Original business page. @param value Server-issued entry. @returns Validated fragment entry with Harness presentation. */
export function communityEntry(target, value) {
    if (typeof value !== 'string' || !URL.canParse(value))
        throw new Error('COMMUNITY_ENTRY_INVALID');
    const url = new URL(value);
    if (url.origin !== origin || url.username || url.password || url.pathname !== entries[target] || !['?embed=desktop', '?embed=desktop&host_ui=harness'].includes(url.search) || !/^#ticket=[A-Za-z0-9_-]{43}$/.test(url.hash))
        throw new Error('COMMUNITY_ENTRY_INVALID');
    url.searchParams.set('host_ui', 'harness');
    return url.href;
}
/** A fresh profile ticket preserves the original campus setup and automatic return flow. */
export function communityCampusEntry(value) {
    if (typeof value !== 'string' || !URL.canParse(value))
        throw new Error('COMMUNITY_ENTRY_INVALID');
    const url = new URL(value);
    if (url.origin !== origin || url.username || url.password || url.pathname !== '/my-ai/profile' || url.search !== '?embed=desktop&return=zhilian' || !/^#ticket=[A-Za-z0-9_-]{43}$/.test(url.hash))
        throw new Error('COMMUNITY_ENTRY_INVALID');
    url.searchParams.set('host_ui', 'harness');
    return url.href;
}
/** @param target Owning page. @param value Navigation URL. @returns Whether navigation stays within its original business. */
export function communityNavigationAllowed(target, value) {
    if (!URL.canParse(value))
        return false;
    const url = new URL(value);
    if (url.origin !== origin || url.username || url.password)
        return false;
    return target === 'skills' ? url.pathname === '/skills' : ['/leaderboards', '/my-ai/profile', '/campus-knowledge'].some(path => url.pathname === path || (path === '/campus-knowledge' && url.pathname.startsWith(path + '/')));
}
/** @param value Original navigation intent. @returns The exact campus setup/return action, or null. */
export function communityProfileAction(value) {
    if (value === 'studybuddy://personal-profile/open?return=zhilian')
        return 'open';
    if (value === 'studybuddy://personal-profile/return?target=zhilian')
        return 'return';
    return null;
}
//# sourceMappingURL=community-routes.js.map