/** The new account root is consumed by official registry/filesystem/tool plugins through the real Loader. */
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { provideWorkingDirectoryFixture } from '@deepseek-ai/dsh-agent-loop-testkit'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import * as SkillFileSystem from '@deepseek-ai/dsh-skill-filesystem'
import * as ToolSkill from '@deepseek-ai/dsh-tool-skill'
it('loads migrated Skill bytes from the exact account DSH_HOME without an alternate model/tool loop', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'studybuddy-skill-loader-')), ctx = new Context(),
    accountHome = join(temporary, 'harness', 'synthetic-account'), project = join(temporary, 'project'),
    skillPath = join(accountHome, 'skills', 'campus-guide', 'SKILL.md')
  const modules = new Map<string, object>([
    ['@deepseek-ai/dsh-system-prompt', SystemPrompt], ['@deepseek-ai/dsh-tools', ToolRuntime],
    ['@deepseek-ai/dsh-agent', AgentRegistry], ['@deepseek-ai/dsh-skill', SkillRegistry],
    ['@deepseek-ai/dsh-skill-filesystem', SkillFileSystem], ['@deepseek-ai/dsh-tool-skill', ToolSkill],
  ])
  const packages = ['core/system-prompt', 'core/tools', 'core/agent', 'skill/skill', 'skill/skill-filesystem', 'skill/tool-skill']
  try {
    await mkdir(join(accountHome, 'skills', 'campus-guide'), { recursive: true }); await mkdir(project)
    await writeFile(skillPath, '---\nname: campus-guide\ndescription: Original campus guidance\n---\n\nRead the exact campus policy before answering.\n')
    provideWorkingDirectoryFixture(ctx, project)
    ctx.baseUrl = pathToFileURL(temporary).href + '/'
    await ctx.plugin(SystemPrompt); await ctx.plugin(ToolRuntime); await ctx.plugin(AgentRegistry)
    await ctx.plugin(Loader)
    ctx.loader.builtins.include = Include
    ctx.loader.internal = {
      version: 'v2', import: async (name) => { const module = modules.get(name); if (!module) throw Error('UNEXPECTED_MODULE'); return module },
      loadCache: new Map(), register: () => { throw Error('UNEXPECTED_HOOK') }, getOrCreateModuleJob: () => { throw Error('UNEXPECTED_JOB') }, resolveSync: () => { throw Error('UNEXPECTED_RESOLUTION') }, load: () => { throw Error('UNEXPECTED_LOAD') },
    }
    for (let index = 0; index < packages.length; index++) {
      const text = await readFile(join('packages', packages[index]!, 'package.json'), 'utf8'), manifest = JSON.parse(text) as { name: string },
        directory = join(temporary, 'node_modules', manifest.name)
      await mkdir(directory, { recursive: true }); await writeFile(join(directory, 'package.json'), text)
    }
    const config = join(temporary, 'cordis.yml')
    await writeFile(config, [
      '- id: skill-registry\n  name: "@deepseek-ai/dsh-skill"',
      '- id: skill-filesystem\n  name: "@deepseek-ai/dsh-skill-filesystem"\n  config:',
      '    dshHome: ' + JSON.stringify(accountHome), '    agentsHome: ' + JSON.stringify(join(temporary, '.agents')), '    watch: false',
      '- id: tool-skill\n  name: "@deepseek-ai/dsh-tool-skill"',
    ].join('\n') + '\n')
    await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(config).href } }); await ctx.loader.await()
    const catalog = await ctx.skills.list()
    expect(catalog.find(row => row.name === 'campus-guide')?.description).toBe('Original campus guidance')
    const result = await ctx.tools.execute({ signal: new AbortController().signal, callId: ToolCallId('migrated-campus-guide'), name: 'skill', arguments: { name: 'campus-guide' } })
    expect(result.isError).toBe(false)
    const block = result.content.find(row => row.type === 'text')
    if (block?.type !== 'text') throw Error('EXPECTED_ORIGINAL_SKILL_TEXT')
    expect(block.text).toContain('Read the exact campus policy before answering.')
    expect(block.text).toContain('campus-guide')
  } finally { await ctx.fiber.dispose(); await rm(temporary, { recursive: true, force: true }) }
})
