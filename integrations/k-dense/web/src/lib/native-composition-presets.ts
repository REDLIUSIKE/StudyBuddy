/** Native model references are opaque exact catalog keys, never provider aliases. */
export interface NativeCompositionPreset {id:string;name:string;models:string[];judge:string}
export interface NativeCompositionPresets {schemaVersion:1;presets:NativeCompositionPreset[]}
export function parseNativeCompositionPresets(value:unknown):NativeCompositionPresets {
 const invalid=():never=>{throw Error('RESEARCH_COMPOSITION_PRESETS_INVALID')}
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==2||!('schemaVersion'in value)||value.schemaVersion!==1||!('presets'in value)||!Array.isArray(value.presets)||value.presets.length>64)return invalid()
 const seen=new Set<string>(),ref=(value:unknown):value is string=>typeof value==='string'&&!!value.trim()&&value.length<768&&!/[\u0000\r\n]/.test(value)
 const presets=value.presets.map(row=>{if(!row||typeof row!=='object'||Array.isArray(row)||Object.keys(row).length!==4||Object.keys(row).some(key=>!['id','name','models','judge'].includes(key))||typeof row.id!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(row.id)||seen.has(row.id)||typeof row.name!=='string'||!row.name.trim()||row.name.length>100||!Array.isArray(row.models)||row.models.length<1||row.models.length>8||!row.models.every(ref)||!ref(row.judge))return invalid();seen.add(row.id);return {id:row.id,name:row.name,models:[...row.models],judge:row.judge}})
 return {schemaVersion:1,presets}
}
