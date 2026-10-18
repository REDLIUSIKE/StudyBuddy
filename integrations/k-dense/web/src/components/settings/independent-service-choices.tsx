"use client";
import {useEffect,useState} from 'react';
import {apiFetch} from '@/lib/projects';
import {SettingsError} from './primitives';
import {nativeResearchRequest} from '@/lib/research-host';
import {runtimeProfile} from '@/lib/runtime-profile';
export type ServiceChoices={compute:'modal'|'autodl';academic:'paperclip'|'metaso';web:'exa'|'bocha'};
const rows=[{key:'compute',label:'科研计算服务',items:[['modal','Modal'],['autodl','AutoDL']]},{key:'academic',label:'学术检索服务',items:[['paperclip','Paperclip（GXL）'],['metaso','秘塔']]},{key:'web',label:'网页检索服务',items:[['exa','Exa'],['bocha','博查']]}] as const;
/** Switching a provider leaves every credential field mounted and preserves its draft. */
export function IndependentServiceChoices(){
 const [value,setValue]=useState<ServiceChoices|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
 useEffect(()=>{let alive=true;void apiFetch('/research/services').then(async response=>{if(!response.ok)throw Error('无法读取服务选择');const loaded=await response.json();if(!rows.every(row=>row.items.some(item=>item[0]===loaded[row.key])))throw Error('服务选择无效');if(alive)setValue(loaded);}).catch(cause=>{if(alive)setError(String(cause.message??cause));});return()=>{alive=false};},[]);
 const change=async(key:keyof ServiceChoices,next:string)=>{setBusy(true);setError(null);try{const response=await apiFetch('/research/services',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({[key]:next})});if(!response.ok)throw Error('保存服务选择失败');setValue(await response.json());}catch(cause){setError(cause instanceof Error?cause.message:String(cause));}finally{setBusy(false);}};
 return <div className="grid gap-3 rounded-md border p-3"><p className="text-xs text-muted-foreground">请自行注册、开通并充值。以下服务直接使用您的服务商账户结算，StudyBuddy 不统一扣费。大模型网关设置保持不变。</p>{rows.map(row=><label key={row.key} className="flex items-center justify-between gap-3 text-xs"><span>{row.label}</span><select aria-label={row.label} disabled={!value||busy} value={value?.[row.key]??''} onChange={event=>void change(row.key,event.target.value)} className="rounded-md border bg-background px-2 py-1">{!value&&<option value="">加载中…</option>}{row.items.map(item=><option key={item[0]} value={item[0]}>{item[1]}</option>)}</select></label>)}<SettingsError>{error}</SettingsError></div>;
}
export function OfficialServiceLink({href,service}:{href:string;service:string}){
 const [error,setError]=useState<string|null>(null);
 return <><a href={href} target="_blank" rel="noopener noreferrer" aria-label={`${service}：访问官网 ↗`} title="在系统默认浏览器打开" onClick={event=>{if(runtimeProfile()==='studybuddy'){event.preventDefault();setError(null);void nativeResearchRequest({kind:'open-service-site',url:href}).catch(()=>setError('无法打开系统浏览器，请重试'));}}} className="inline-flex w-fit items-center text-xs text-primary hover:underline">访问官网 ↗</a><SettingsError>{error}</SettingsError></>;
}
