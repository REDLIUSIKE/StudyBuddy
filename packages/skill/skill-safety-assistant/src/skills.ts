/** Packaged safety guidance contributes only to its native preset scope. */
import type { Context } from '@deepseek-ai/cordis'
import {readFileSync} from 'node:fs'
import {renderSkillContent,type SkillRegistration} from '@deepseek-ai/dsh-skill'
import {z} from 'zod'
import {SkillSafetyError} from './errors.ts'

const helperNames = ['skill-safety-guide'] as const
const metadata = z.object({name:z.enum(helperNames),description:z.string().min(1).max(500)}).strict()
function readPackagedHelpers(): SkillRegistration[] {
  return helperNames.map(name=>{
    const raw=readFileSync(new URL('../assets/'+name+'/SKILL.md',import.meta.url),'utf8')
    const frontmatter=/^---\r?\n([^]*?)\r?\n---(?:\r?\n|$)/u.exec(raw)
    if(!frontmatter?.[1]||Buffer.byteLength(frontmatter[1])>1024||Buffer.byteLength(raw)>32768)throw new SkillSafetyError('SKILL_SAFETY_RESOURCE_INVALID')
    // These owned assets use JSON, a YAML subset, for a bounded and unambiguous metadata parse.
    const parsed=metadata.parse(JSON.parse(frontmatter[1]))
    const content=raw.slice(frontmatter[0].length).trim()
    if(parsed.name!==name||!content)throw new SkillSafetyError('SKILL_SAFETY_RESOURCE_INVALID')
    return {...parsed,content,source:'bundled',provider:'studybuddy-skill-safety-packaged',invocation:{modelInvocable:false,userInvocable:false}}
  })
}
/** Register the owned packaged helpers. @param ctx - Dedicated preset context. */
export function registerSkillSafetySkills(ctx: Context): void {
  const helpers=readPackagedHelpers()
  for(const [index,helper] of helpers.entries()) {
    ctx.skills.register(helper)
    ctx.systemPrompt.context({name:'skill-safety:'+helper.name,order:1000+index,required:true,interpolate:false,
      text:renderSkillContent({...helper,provider:'studybuddy-skill-safety-packaged'})})
  }
}
/** Activate the owned helper contribution. @param ctx - Dedicated preset context. */
export function apply(ctx: Context): void { registerSkillSafetySkills(ctx) }
export const inject = ['skills', 'systemPrompt']
