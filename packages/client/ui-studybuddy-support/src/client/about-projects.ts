/** Major upstream project names, links and licenses for the compact credits. */

interface AboutProject {
  readonly name: string
  readonly url: string
  readonly license: string
}

export const COMMUNITY_QQ_GROUP = '120796873'

export const integratedProjects: readonly AboutProject[] = [
  { name: 'DeepSeek Harness', url: 'https://github.com/deepseek-ai/deepseek-harness', license: 'MIT' },
  { name: 'Cordis', url: 'https://github.com/cordiverse/cordis', license: 'MIT' },
  { name: 'Toonflow', url: 'https://github.com/HBAI-Ltd/Toonflow-app', license: 'MIT' },
  { name: 'K-Dense BYOK', url: 'https://github.com/K-Dense-AI/k-dense-byok', license: 'MIT' },
  { name: 'CC Switch', url: 'https://github.com/farion1231/cc-switch', license: 'MIT' },
]

export const referenceProjects: readonly AboutProject[] = [
  { name: 'Vercel Skills', url: 'https://github.com/vercel-labs/skills', license: 'MIT' },
  { name: 'ClawHub', url: 'https://github.com/openclaw/clawhub', license: 'MIT' },
]
