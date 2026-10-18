import {expect,it} from 'vitest'
import {assertBusinessSender,cloudRequest} from '../src/studybuddy/business-api.ts'

it('rejects a welcome page, subframe, guest or unauthenticated business sender',()=>{
  const own={ownerId:1,senderId:1,mainFrameId:2,frameId:2,url:'dsh-app://app/',authenticated:true}
  expect(()=>assertBusinessSender(own)).not.toThrow()
  for(const bad of [{url:'dsh-app://shell/welcome.html'},{frameId:3},{senderId:4},{authenticated:false}])expect(()=>assertBusinessSender({...own,...bad})).toThrow('BUSINESS_SENDER_DENIED')
})
it('only resolves fixed cloud operations and retains order idempotency',()=>{
  expect(cloudRequest('getRechargeOrder',['sbrc_'+'a'.repeat(43)])).toEqual({path:'/recharge/orders/sbrc_'+'a'.repeat(43)})
  expect(cloudRequest('createRechargeOrder',['recharge-20',[],'11111111-1111-4111-8111-111111111111'])).toEqual({path:'/recharge/orders',body:{tierCode:'recharge-20',couponIds:[],idempotencyKey:'11111111-1111-4111-8111-111111111111'}})
  expect(()=>cloudRequest('https://evil.example',[])).toThrow('BUSINESS_OPERATION_DENIED')
  expect(()=>cloudRequest('getRechargeOrder',['../me'])).toThrow('BUSINESS_ARGS_INVALID')
})
