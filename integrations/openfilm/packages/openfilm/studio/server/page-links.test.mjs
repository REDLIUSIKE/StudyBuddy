import { test } from 'node:test';
import assert from 'node:assert/strict';
import { linkKind, rewriteLinks } from './page-links.mjs';

const PAGE = `<!doctype html>
<link rel="stylesheet" href="style.css">
<style>body { background: url("../assets/bg.png") } .x { background: url(#grain) }</style>
<img src="../assets/logo.png" alt=""><a href="https://example.com">x</a><img src="data:image/png;base64,AA">
<div style="background-image: url('pic.jpg')"></div>
<script type="module">
import { tween } from './lib/tween.js';
import three from 'three';
const data = await fetch('data.json?v=2').then((r) => r.json());
const more = await fetch(base + name);
img.src = \`\${dir}/x.png\`;
</script>`;

test('a page moved one folder down: every link it can read still reaches its file', () => {
  const { text, changed, unseen } = rewriteLinks(PAGE, 'html', 'scenes', 'scenes/intro');
  assert.match(text, /href="\.\.\/style\.css"/);
  assert.match(text, /url\("\.\.\/\.\.\/assets\/bg\.png"\)/);
  assert.match(text, /src="\.\.\/\.\.\/assets\/logo\.png"/);
  assert.match(text, /url\('\.\.\/pic\.jpg'\)/);
  assert.match(text, /from '\.\.\/lib\/tween\.js'/);
  assert.match(text, /fetch\('\.\.\/data\.json\?v=2'\)/);
  /* left alone: other sites, data, fragments, packages */
  assert.match(text, /href="https:\/\/example\.com"/);
  assert.match(text, /url\(#grain\)/);
  assert.match(text, /from 'three'/);
  assert.match(text, /src="data:image\/png;base64,AA"/);
  assert.equal(changed, 6);
  /* what is made while it runs cannot be rewritten: it is named */
  assert.ok(unseen.some((u) => u.startsWith('fetch(base')), unseen.join(' | '));
  assert.ok(unseen.some((u) => u.includes('${dir}')), unseen.join(' | '));
});

test('moved back where it was, nothing changes; a file moved along is followed', () => {
  assert.equal(rewriteLinks(PAGE, 'html', 'scenes', 'scenes').changed, 0);
  /* the folder scenes/ moved to shots/: its own files went with it, assets/ stayed */
  const where = (p) => (p.startsWith('scenes/') ? `shots/${p.slice('scenes/'.length)}` : p);
  const { text } = rewriteLinks('<img src="logo.png"><img src="../assets/a.png">', 'html', 'scenes', 'shots', where);
  assert.equal(text, '<img src="logo.png"><img src="../assets/a.png">');
  const deeper = rewriteLinks('<img src="logo.png"><img src="../assets/a.png">', 'html', 'scenes', 'film/shots', (p) => (p.startsWith('scenes/') ? `film/shots/${p.slice(7)}` : p));
  assert.equal(deeper.text, '<img src="logo.png"><img src="../../assets/a.png">');
});

test('stylesheets and module scripts are rewritten as well; an import stays relative', () => {
  assert.equal(rewriteLinks('@import "base.css"; a { background: url(i.png) }', 'css', 'css', 'css/theme').text,
    '@import "../base.css"; a { background: url(../i.png) }');
  assert.equal(rewriteLinks("import a from './a.js';", 'js', 'lib', 'lib/x', (p) => (p === 'lib/a.js' ? 'lib/x/a.js' : p)).text, "import a from './a.js';");
  assert.equal(linkKind('scene.HTML'), 'html');
  assert.equal(linkKind('clip.mp4'), null);
});
