/**
 * Public-network resolution and address-pinned HTTP transport for `web-fetch-http`.
 * One DNS answer set is validated before Undici receives it through a custom lookup,
 * so the connection cannot resolve the hostname again to a private address.
 *
 * @module @deepseek-ai/dsh-web-fetch-http/network
 */
import { lookup as systemLookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import ipaddr from 'ipaddr.js';
import { WebError } from '@deepseek-ai/dsh-web';
/** RFC 6052 prefix lengths that may carry an IPv4 destination through NAT64. */
const RFC6052_PREFIX_LENGTHS = [32, 40, 48, 56, 64, 96];
const IPV4ONLY_DISCOVERY_HOST = 'ipv4only.arpa';
const IPV4ONLY_SENTINELS = new Set(['192.0.0.170', '192.0.0.171']);
/**
 * Return whether an address is globally reachable unicast. IPv4-mapped IPv6 is
 * classified by its embedded IPv4 address; transition and translation prefixes
 * remain blocked because their eventual IPv4 destination cannot be pinned here.
 *
 * @param input - textual IPv4 or IPv6 address.
 * @returns true only for a public unicast destination.
 */
export function isPublicIpAddress(input) {
    let parsed;
    try {
        parsed = ipaddr.parse(stripIpv6Brackets(input));
    }
    catch {
        return false;
    }
    if (parsed instanceof ipaddr.IPv4)
        return parsed.range() === 'unicast';
    if (parsed.isIPv4MappedAddress())
        return parsed.toIPv4Address().range() === 'unicast';
    return parsed.range() === 'unicast';
}
/**
 * Resolve a hostname once and reject the complete answer set if any destination
 * is not public. The returned addresses are the only ones the transport may use.
 *
 * @param hostname - URL hostname, including brackets when it is an IPv6 literal.
 * @param signal - aborts the wait for system resolution; an in-flight OS lookup may finish unused.
 * @param resolver - lookup implementation, overridden only by focused tests.
 * @returns the validated, non-empty address set.
 */
export async function resolvePublicAddresses(hostname, signal, resolver = systemLookup) {
    const unbracketed = stripIpv6Brackets(hostname);
    const literalFamily = isIP(unbracketed);
    const resolved = literalFamily === 0
        ? await raceWithSignal(resolver(unbracketed, { all: true, order: 'verbatim' }), signal)
        : [{ address: unbracketed, family: literalFamily }];
    if (resolved.length === 0) {
        throw new WebError(`hostname "${hostname}" resolved to no addresses`, 'WEB_PROVIDER_ERROR');
    }
    const hasIpv6 = resolved.some(entry => entry.family === 6 && isIP(entry.address) === 6);
    const nat64Prefixes = hasIpv6
        ? await discoverNat64Prefixes(signal, resolver)
        : [];
    const addresses = [];
    for (const entry of resolved) {
        if ((entry.family !== 4 && entry.family !== 6) || isIP(entry.address) !== entry.family) {
            throw new WebError(`hostname "${hostname}" resolved to an invalid IP address`, 'WEB_PROVIDER_ERROR');
        }
        if (!isPublicIpAddress(entry.address)) {
            throw new WebError(`URL hostname "${hostname}" resolves to a non-public IP address`, 'WEB_BLOCKED_URL');
        }
        const translatedIpv4 = translatedIpv4Address(entry.address, nat64Prefixes);
        if (translatedIpv4 !== undefined && !isPublicIpAddress(translatedIpv4)) {
            throw new WebError(`URL hostname "${hostname}" resolves through NAT64 to a non-public IPv4 address`, 'WEB_BLOCKED_URL');
        }
        addresses.push({ address: entry.address, family: entry.family });
    }
    return addresses;
}
/** Discover the active DNS64 prefix set using RFC 7050's reserved hostname. */
async function discoverNat64Prefixes(signal, resolver) {
    const discovered = await raceWithSignal(resolver(IPV4ONLY_DISCOVERY_HOST, { all: true, order: 'verbatim' }), signal);
    const prefixes = [];
    const seen = new Set();
    for (const entry of discovered) {
        if (entry.family !== 6 || isIP(entry.address) !== 6)
            continue;
        const bytes = ipaddr.parse(entry.address).toByteArray();
        for (const length of RFC6052_PREFIX_LENGTHS) {
            const embedded = embeddedIpv4Address(bytes, length);
            if (embedded === undefined || !IPV4ONLY_SENTINELS.has(embedded))
                continue;
            const prefixBytes = bytes.slice(0, length / 8);
            const key = `${String(length)}:${prefixBytes.join('.')}`;
            if (seen.has(key))
                continue;
            seen.add(key);
            prefixes.push({ bytes: prefixBytes, length });
        }
    }
    return prefixes;
}
/** Return the RFC 6052-embedded IPv4 address when an IPv6 address matches a discovered prefix. */
function translatedIpv4Address(input, prefixes) {
    if (isIP(input) !== 6)
        return undefined;
    const bytes = ipaddr.parse(input).toByteArray();
    for (const prefix of prefixes) {
        if (!prefix.bytes.every((byte, index) => bytes[index] === byte))
            continue;
        const embedded = embeddedIpv4Address(bytes, prefix.length);
        if (embedded !== undefined)
            return embedded;
    }
    return undefined;
}
/** Extract one IPv4 address from an RFC 6052 IPv6 layout. */
function embeddedIpv4Address(bytes, prefixLength) {
    if (prefixLength === 96)
        return bytes.slice(12, 16).join('.');
    if (bytes[8] !== 0)
        return undefined;
    const prefixBytes = prefixLength / 8;
    const beforeReservedOctet = 8 - prefixBytes;
    const ipv4 = [
        ...bytes.slice(prefixBytes, prefixBytes + beforeReservedOctet),
        ...bytes.slice(9, 9 + 4 - beforeReservedOctet),
    ];
    return ipv4.join('.');
}
/**
 * Whether a hostname is an IP literal that {@link resolvePublicAddresses} would refuse.
 *
 * A proxied hop skips those checks because the proxy resolves the origin, but a literal needs no
 * resolution: the address is already stated, and handing it to a proxy running on this machine
 * would reach exactly the loopback or private service the checks exist to keep out of reach.
 *
 * @param hostname - a URL's hostname, bracketed or not.
 * @returns true when the host is a literal address no request may be sent to.
 */
export function isNonPublicIpLiteral(hostname) {
    const unbracketed = stripIpv6Brackets(hostname);
    return isIP(unbracketed) !== 0 && !isPublicIpAddress(unbracketed);
}
/**
 * Fetch through an agent whose lookup callback returns only the already validated address set. The
 * URL hostname remains intact for HTTP Host and TLS SNI.
 *
 * The agent is this request's own because the address set is: pinning is how this package refuses a
 * DNS answer that changes between validation and connection, and it may not apply process-wide —
 * an operator-configured MCP server or model endpoint on loopback is a supported destination, and
 * only the URLs this tool fetches are the model's to choose.
 *
 * @param url - validated HTTP(S) URL the policy does not route through a proxy.
 * @param addresses - public addresses returned by {@link resolvePublicAddresses}.
 * @param headers - request headers.
 * @param signal - request and body-read cancellation signal.
 * @returns a response plus the disposer its consumer must call.
 */
export async function requestPinned(url, addresses, headers, signal) {
    // Keep the Node-only transport out of browser-worker startup. The preview can load the provider
    // and fail loud at its DNS stub without evaluating Undici; a real request resolves it here.
    const { Agent, fetch } = await import('undici');
    // Reached only where `proxyRouteFor` reported no proxy for this URL, and the pinned lookup this
    // agent carries is per-request state the process-wide dispatcher cannot hold.
    // proxy-exempt: pinning one request's validated addresses, on a URL the policy routes directly.
    const dispatcher = new Agent({ autoSelectFamily: true, connect: { lookup: createPinnedLookup(addresses) } });
    try {
        // proxy-exempt: the agent above, whose lifetime is this one request.
        const response = await fetch(url, { method: 'GET', redirect: 'manual', headers, signal, dispatcher });
        return { response, close: async () => { await dispatcher.close(); } };
    }
    catch (error) {
        await dispatcher.close();
        throw error;
    }
}
/**
 * Fetch through the dispatcher the proxy policy already installed, letting the proxy resolve the
 * origin.
 *
 * No address set is pinned because none exists to pin: the proxy performs the lookup, and a
 * connection pinned to a locally resolved address would reach the origin directly and defeat the
 * proxy. The dispatcher is the process-wide one, so hops share its connection pool and no caller
 * closes it.
 *
 * @param dispatcher - the route's dispatcher, from `proxyRouteFor`.
 * @param url - validated HTTP(S) URL the policy routes through a proxy.
 * @param headers - request headers.
 * @param signal - request and body-read cancellation signal.
 * @returns a response plus a disposer that releases nothing, so both paths close alike.
 */
export async function requestVia(dispatcher, url, headers, signal) {
    const { fetch } = await import('undici');
    // proxy-exempt: the dispatcher is the installed policy's own, handed over by `proxyRouteFor`.
    const response = await fetch(url, { method: 'GET', redirect: 'manual', headers, signal, dispatcher });
    return { response, close: () => Promise.resolve() };
}
/** Production network operations kept as an object so provider tests can replace resolution only. */
export const publicHttpNetwork = {
    resolve: resolvePublicAddresses,
    request: requestPinned,
    requestVia,
};
/**
 * Build the connector lookup that serves a fixed validated answer set.
 *
 * @param addresses - public addresses retained from the preceding resolution.
 * @returns a Node-compatible lookup callback that performs no network resolution.
 */
export function createPinnedLookup(addresses) {
    return (hostname, options, callback) => {
        const family = typeof options.family === 'number'
            ? options.family
            : options.family === 'IPv4' ? 4 : options.family === 'IPv6' ? 6 : 0;
        const eligible = family === 0 ? addresses : addresses.filter(address => address.family === family);
        const selected = eligible[0];
        if (selected === undefined) {
            const error = Object.assign(new Error(`no validated address for ${hostname} in family ${family}`), {
                code: 'ENOTFOUND',
                hostname,
            });
            callback(error, options.all === true ? [] : '', family);
            return;
        }
        if (options.all === true) {
            callback(null, eligible.map(address => ({ ...address })));
            return;
        }
        callback(null, selected.address, selected.family);
    };
}
/** Race a non-cancellable OS lookup without letting it delay tool cancellation. */
function raceWithSignal(promise, signal) {
    const abortError = () => new Error('web fetch aborted during hostname resolution', { cause: signal.reason });
    if (signal.aborted)
        return Promise.reject(abortError());
    return new Promise((resolve, reject) => {
        const abort = () => { reject(abortError()); };
        signal.addEventListener('abort', abort, { once: true });
        promise.then(resolve, reject).finally(() => { signal.removeEventListener('abort', abort); });
    });
}
/** WHATWG URL retains brackets around IPv6 hostnames; IP parsers do not. */
function stripIpv6Brackets(hostname) {
    return hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
}
//# sourceMappingURL=network.js.map