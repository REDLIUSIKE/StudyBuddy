import { withRenderRuntime } from '../../src/runtime.mjs';
import {withMediaLinksHome} from '../../src/media-links.mjs';
// @ts-check
/**
 * A film rendered in a process of its own (exports.mjs `renderApart`): its browsers and encoders are this process's,
 * so whatever breaks in them (a browser's pipe, a crash, memory running out) ends this render and says why, and Studio
 * keeps serving. Told `{ args, opts }` once; says `progress`, then `done` (render's result) or `failed`; `cancel`
 * stops it.
 */
import { render } from '../../src/render.mjs';

/* Studio gone (it stopped, or was ended): nothing will take this render, and its browsers and encoders end with it */
const abort = new AbortController(),owned=new Set();let started=false;
process.on('disconnect', () => {abort.abort();if(!started)process.exit(1);});

process.once('message', async (/** @type {{ args: string[], opts: Record<string, unknown> }} */ { args, opts }) => {
  started=true;
  process.on('message', (/** @type {{ type?: string }} */ m) => { if (m?.type === 'cancel') abort.abort(); });
  /** @param {unknown} message */
  const say = (message) => new Promise((done) => { if(!process.connected)return done(undefined);process.send?.(message, () => done(undefined)); });
  let code=1;
  try {
    const result = await withMediaLinksHome(opts.mediaLinksHome,()=>withRenderRuntime(opts.renderRuntime,() => render(args, {
      ...opts, signal: abort.signal,
      onProgress: (/** @type {number} */ done, /** @type {number} */ total) => { process.send?.({ type: 'progress', done, total }); },
    }),!!opts.renderRuntime,abort.signal,work=>{owned.add(work);void work.finally(()=>owned.delete(work)).catch(()=>{});}),opts.mediaLinkAdmissions);
    await say({ type: 'done', result });
    code=0;
  } catch (e) {
    await say({ type: 'failed', error: e instanceof Error ? e.message : String(e) });
  } finally {
    while(owned.size)await Promise.allSettled([...owned]);
    process.exit(code);
  }
});
