import {useEffect,useState} from 'react';
import {studioHost} from '@/lib/host';
import {useT} from '@/i18n';
import {SettingsGroup,SettingsPage} from './ui';

type Model={operation:string;modelId:string;label:string};
/** Read the same account catalog used by the native video tools; no local model or provider settings. */
export function NativeModelsSection(){
 const t=useT();
 const [models,setModels]=useState<Model[]|null>(null);
 const [failed,setFailed]=useState(false);
 useEffect(()=>{
  let alive=true;
  const read=studioHost?.managedServices?.models;
  if(!read){setFailed(true);return;}
  void read().then(rows=>{if(alive)setModels(rows);},()=>{if(alive)setFailed(true);});
  return()=>{alive=false;};
 },[]);
 return <SettingsPage>
  <p className="text-[14px] leading-relaxed text-[var(--text-muted)]">{t('nativeModels.chatHint')}</p>
  {failed?<p role="alert" className="text-[14px] text-[var(--err)]">{t('nativeModels.unavailable')}</p>
   :models===null?<p role="status" className="text-[14px] text-[var(--text-muted)]">{t('nativeModels.loading')}</p>
   :models.length===0?<p className="text-[14px] text-[var(--text-muted)]">{t('nativeModels.empty')}</p>
   :['image','video','tts','sfx','asr'].map(operation=>{
    const rows=models.filter(model=>model.operation===operation);
    return rows.length?<SettingsGroup key={operation} title={t(`nativeModels.${operation}`)}>
     {rows.map(model=><div key={model.modelId} className="flex min-w-0 items-center justify-between gap-4 py-3">
      <span className="text-[14px] text-[var(--text)]">{model.label}</span>
      <span className="select-text break-all text-right font-mono text-[12px] text-[var(--text-muted)]">{model.modelId}</span>
     </div>)}
    </SettingsGroup>:null;
   })}
 </SettingsPage>;
}
