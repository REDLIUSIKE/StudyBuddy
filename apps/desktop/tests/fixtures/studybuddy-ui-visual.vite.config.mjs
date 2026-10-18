/** Local-only visual fixture; the production desktop and its account are not started or modified. */
import { defineConfig } from 'vite'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
const root = fileURLToPath(new URL('../../../../', import.meta.url))
const web = resolve(root, '../StudyBuddy-UAT-Builds/harness-skill-web-fix-20261011')
export default defineConfig({
  root,
  resolve: { alias: {
    '@studybuddy/contracts': resolve(web, 'packages/contracts/dist/index.js'),
    '@studybuddy/skill-center-ui': resolve(web, 'packages/skill-center-ui/src/index.ts'),
    '@deepseek-ai/dsh-client-ui-primitives': resolve(root, 'packages/client/ui-primitives/src/index.ts'),
    'react-dom': resolve(web, 'apps/web/node_modules/react-dom'),
    react: resolve(web, 'apps/web/node_modules/react'),
  } },
  server: { host: '127.0.0.1', port: 14295, strictPort: true, fs: { allow: [root, web] } },
  plugins: [{ name: 'controlled-visual-route', configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (!req.url?.startsWith('/leaderboards') && !req.url?.startsWith('/skills')) return next()
      void server.transformIndexHtml(req.url, readFileSync(new URL('./studybuddy-ui-visual.html', import.meta.url), 'utf8') + '<style>html,body{margin:0;background:white;color:#15243a;font-family:Arial,"Microsoft YaHei",sans-serif}body{--dsw-alias-bg-base:#fff;--dsw-alias-bg-layer-2:#f6f8fa;--dsw-alias-settings-card-fill:#fff;--dsw-alias-settings-card-stroke:#e3e8ee;--dsw-alias-label-primary:#15243a;--dsw-alias-label-secondary:#6b7583;--dsw-font-family:Arial,"Microsoft YaHei",sans-serif}.visual-icons{display:flex;gap:16px;position:fixed;right:8px;bottom:8px;z-index:50;padding:8px;background:#fff}.visual-cards{padding:32px;max-width:320px}</style>').then(html => { res.setHeader('Content-Type', 'text/html'); res.end(html) }).catch(next)
    })
  } }],
})
