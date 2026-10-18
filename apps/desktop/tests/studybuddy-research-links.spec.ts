import {expect,it} from 'vitest'
import {researchOfficialLink} from '../src/studybuddy/research-links.ts'
it('allows only the six exact service homepages without credentials, query or alternate origin',()=>{
  for(const url of ['https://modal.com/','https://www.autodl.com/','https://paperclip.gxl.ai/','https://metaso.cn/','https://exa.ai/','https://open.bochaai.com/'])expect(researchOfficialLink(url)).toBe(url)
  for(const url of ['https://modal.com/?key=secret','https://modal.com.evil.test/','https://u:p@metaso.cn/','file:///C:/secret','https://metaso.cn/#key','https://exa.ai/api'])expect(()=>researchOfficialLink(url)).toThrow('RESEARCH_EXTERNAL_LINK_DENIED')
})
