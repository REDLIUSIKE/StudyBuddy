import { it,expect } from 'vitest'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { NativeAccountClient } from '../src/studybuddy/native-account-client.ts'
const scope={ accountId:'owner-a',generation:1 }
it('original install progress can be queried and cancelled while the start reply is pending',async()=>{
  const client=new NativeAccountClient({ start:async()=>spawn(process.execPath,[fileURLToPath(new URL('./fixtures/studybuddy-native-install-control.mjs',import.meta.url))],{ stdio:'pipe',windowsHide:true }) })
  client.useSession({ scope,accessToken:'synthetic-private-access' })
  try{
    await client.invoke(scope,'getConfigurationViews',[])
    await expect(client.invoke(scope,'getNativeToolCatalog',[])).rejects.toMatchObject({ code:'NATIVE_CONNECTION_RATE_LIMITED',message:'连接服务请求过于频繁，请重试原操作。',requestId:'fixture-request-123',availableAt:'2026-10-11T00:00:00Z' })
    let started:()=>void=()=>{}
    const beginning=new Promise<void>((resolve)=>{started=resolve})
    client.subscribeInstallEvents(scope,()=>started())
    const plan={ schemaVersion:1,catalogVersion:'fixture',inventoryId:'fixture',selectedComponentIds:[],items:[],totalDownloadBytes:0,totalRequiredDiskBytes:0,blockers:[] }
    const write=client.invoke(scope,'startInstall',['synthetic-private-grant',plan]);void write.catch(()=>{})
    await beginning
    const reading=client.invoke(scope,'getInstallRun',['run-12345678-12345678-12345678'])
    let timer:ReturnType<typeof setTimeout>|undefined
    try{await expect(Promise.race([reading,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('install query queued behind the install writer')),700)})])).resolves.toMatchObject({ phase:'installing' })}finally{if(timer)clearTimeout(timer)}
    await expect(client.invoke(scope,'cancelInstall',['run-12345678-12345678-12345678'])).resolves.toMatchObject({ phase:'cancelled' })
    await expect(write).resolves.toMatchObject({ phase:'cancelled' })
  }finally{await client.dispose()}
})
