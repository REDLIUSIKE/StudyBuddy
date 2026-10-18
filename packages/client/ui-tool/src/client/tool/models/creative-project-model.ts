/** Presentation metadata grants no authority: the shell sends only this opaque ID back to Main. */
export function creativeProjectAction(meta:unknown):{id:string}|null{
 if(!meta||typeof meta!=='object'||Array.isArray(meta))return null
 const row=meta as Record<string,unknown>,action=row.projectAction,target=row.target
 if(!action||typeof action!=='object'||Array.isArray(action)||Object.keys(action).join(',')!=='id'||!target||typeof target!=='object'||Array.isArray(target))return null
 const id=Reflect.get(action,'id'),moduleId=Reflect.get(target,'moduleId'),projectRef=Reflect.get(target,'projectRef')
 return typeof id==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id)&&typeof moduleId==='string'&&/^[a-z][a-z0-9_-]{0,63}$/.test(moduleId)&&typeof projectRef==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/.test(projectRef)?{id}:null
}
