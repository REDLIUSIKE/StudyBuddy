import {expect,it} from 'vitest'
import {connectAuthenticatedDesktopWelcome} from '../src/welcome-backend.ts'

it('uses the verified Main Host cookie on the clean origin without a second token exchange',async()=>{
  const calls:Array<{url:string;cookie:string|null;redirect:RequestRedirect|undefined}>=[]
  await connectAuthenticatedDesktopWelcome('http://127.0.0.1:4312/?token=synthetic-private-token','synthetic=private-cookie',async(url,init)=>{
    calls.push({url,cookie:new Headers(init?.headers).get('cookie'),redirect:init?.redirect})
    return new Response('ok')
  })
  expect(calls).toEqual([{url:'http://127.0.0.1:4312/',cookie:'synthetic=private-cookie',redirect:'error'}])
})
