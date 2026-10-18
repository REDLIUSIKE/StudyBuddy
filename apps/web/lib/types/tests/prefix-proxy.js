/**
 * Test-only HTTP plumbing for the Web browser scaffold beside it
 * (`./scaffold.ts`). The proxy owns one browser-facing mount: it preserves the
 * external Host, strips the prefix, removes hop-by-hop headers, forwards WebSocket upgrades, and rewrites the
 * backend's `Path=/` cookies to the mount. TLS terminates at the real
 * deployment's proxy; this fixture stays plain HTTP.
 */
import { createServer as createHttpServer, request as httpRequest, } from 'node:http';
import { connect as netConnect } from 'node:net';
/** Headers that describe one hop and must not reach the origin. */
const HOP_BY_HOP = ['connection', 'keep-alive', 'proxy-connection', 'transfer-encoding', 'upgrade', 'te', 'trailer'];
/**
 * Start the proxy on an operating-system-assigned loopback port.
 * @param options - browser-facing mount prefix.
 * @returns the running proxy; the caller owns registration and disposal.
 */
export async function startPrefixProxy(options) {
    const { prefix } = options;
    const server = createHttpServer();
    let targetPort;
    let closing;
    const sockets = new Set();
    const track = (socket) => {
        sockets.add(socket);
        socket.once('close', () => { sockets.delete(socket); });
        if (closing !== undefined)
            socket.destroy();
    };
    const mountPath = (raw) => {
        const url = new URL(raw, 'http://dsh.invalid');
        if (!url.pathname.startsWith(prefix))
            return undefined;
        return `/${url.pathname.slice(prefix.length)}${url.search}`;
    };
    const forward = (headers) => {
        const copy = { ...headers };
        for (const name of HOP_BY_HOP)
            Reflect.deleteProperty(copy, name);
        return copy;
    };
    const rewriteCookies = (headers) => {
        const copy = forward(headers);
        const setCookie = copy['set-cookie'];
        if (setCookie === undefined)
            return copy;
        const values = Array.isArray(setCookie) ? setCookie : [setCookie];
        copy['set-cookie'] = values.map(value => value.replace(/(^|;\s*)Path=\/(?=;|$)/iu, `$1Path=${prefix}`));
        return copy;
    };
    server.on('request', (requestMessage, response) => {
        if (closing !== undefined) {
            response.destroy();
            return;
        }
        const routed = mountPath(requestMessage.url ?? '/');
        if (routed === undefined) {
            response.writeHead(404);
            response.end();
            return;
        }
        if (targetPort === undefined) {
            response.writeHead(502);
            response.end();
            return;
        }
        const upstream = httpRequest({
            host: '127.0.0.1', port: targetPort, method: requestMessage.method, path: routed,
            headers: forward(requestMessage.headers), agent: false,
        }, (result) => {
            response.writeHead(result.statusCode, rewriteCookies(result.headers));
            result.pipe(response);
        });
        upstream.on('socket', track);
        upstream.once('error', (error) => { response.destroy(error); });
        response.once('close', () => { upstream.destroy(); });
        requestMessage.pipe(upstream);
    });
    // An upgrade speaks its own hop-by-hop framing, so it cannot ride the
    // request handler: replay the request line and raw headers at the backend,
    // then pipe both directions raw until either side closes.
    server.on('upgrade', (requestMessage, socket, head) => {
        const routed = mountPath(requestMessage.url ?? '/');
        if (closing !== undefined || targetPort === undefined || routed === undefined) {
            socket.destroy();
            return;
        }
        const upstream = netConnect(targetPort, '127.0.0.1');
        track(upstream);
        upstream.once('connect', () => {
            upstream.write(`${requestMessage.method} ${routed} HTTP/1.1\r\n`);
            for (let index = 0; index < requestMessage.rawHeaders.length; index += 2) {
                upstream.write(`${requestMessage.rawHeaders[index]}: ${requestMessage.rawHeaders[index + 1]}\r\n`);
            }
            upstream.write('\r\n');
            if (head.length > 0)
                upstream.write(head);
            socket.pipe(upstream).pipe(socket);
        });
        upstream.once('error', () => { socket.destroy(); });
        socket.once('error', () => { upstream.destroy(); });
        upstream.once('close', () => { socket.destroy(); });
        socket.once('close', () => { upstream.destroy(); });
    });
    server.on('connection', track);
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    const { port } = server.address();
    return {
        port,
        setTarget(port) { targetPort = port; },
        close() {
            closing ??= (async () => {
                const stopped = new Promise((resolve) => { server.close(() => { resolve(); }); });
                const drained = [...sockets].map(socket => new Promise((resolve) => {
                    socket.once('close', () => { resolve(); });
                    socket.destroy();
                }));
                await Promise.all([stopped, ...drained]);
            })();
            return closing;
        },
    };
}
//# sourceMappingURL=prefix-proxy.js.map