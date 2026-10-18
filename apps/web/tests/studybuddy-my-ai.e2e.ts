/** Keyless real Loader/Slots composition; desktop carrier acceptance lives in the Electron lane. */
import {chromium} from 'playwright'
import {expect,it} from 'vitest'
import {launchWebScaffold} from './scaffold.ts'
it('exposes two My AI tabs and one balance action that opens the original payment presentation',async()=>{
  const scaffold=await launchWebScaffold(),browser=await chromium.launch()
  try{
    const page=await browser.newPage({viewport:{width:1280,height:820},locale:'zh-CN'})
    await page.addInitScript(()=>{Object.defineProperty(window,'studybuddy',{value:{status:async()=>({phase:'authenticated',scope:{accountId:'test-only-account',generation:1}}),subscribe:()=>()=>{},embedded:{acquire:async()=>{throw new Error('PROFILE_EMBED_UNAVAILABLE')},release:async()=>{},setTheme:async()=>{}},business:{invoke:async(method:string)=>{
      if(method==='getAiAccountSummary')return {availableBalance:'9.1234567',balance:'10.1234567',frozenBalance:'1',platformAccess:null}
      if(['getNativeUserModels','listNativeUserSources','listNativeUserModelRegistrations','listNativeConnectionUi','listRechargeTiers'].includes(method))return []
      if(['listRechargeCoupons','listReferralRecords'].includes(method))return {items:[],total:0,page:1,pageSize:20}
      if(method==='getReferralSummary')return {invitedCount:0,rewardAvailability:{status:'UNAVAILABLE',reason:'NO_AUTHORITATIVE_COUPON_LEDGER'}}
      if(method==='getActiveRechargeOrder')return null
      throw new Error('FIXTURE_WRITE_DENIED')
    }}}})})
    await page.goto(scaffold.authenticatedUrl)
    await page.getByRole('button',{name:'我的 AI',exact:true}).click()
    await page.getByRole('tab',{name:'自备模型',exact:true}).click()
    expect(await page.getByRole('tab',{name:'使用记录',exact:true}).count()).toBe(0)
    expect(await page.getByRole('button',{name:/^可用余额/}).count()).toBe(0)
    const wallet=page.getByRole('button',{name:/^余额/});expect(await wallet.count()).toBe(1)
    await expect.poll(()=>wallet.innerText()).toContain('9.1234567')
    await wallet.click();const dialog=page.getByRole('dialog',{name:'充值',exact:true});await dialog.waitFor()
    for(const label of ['充值金额','优惠券','邀请记录'])expect(await dialog.getByRole('tab',{name:label,exact:true}).count()).toBe(1)
    await dialog.getByRole('button',{name:'关闭',exact:true}).last().click()
    await page.getByRole('button',{name:'插件',exact:true}).click()
    await wallet.click();await dialog.waitFor();await dialog.getByRole('button',{name:'关闭',exact:true}).last().click()
  }finally{await browser.close();await scaffold.close()}
})
