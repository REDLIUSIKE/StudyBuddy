/** Read the existing native model directory; model ref strings are exact row keys, never parsed aliases. */
import type { NativeChannel } from './native-channel.ts';
export interface NativeModelRow { id: string; name: string; reasoning?: { efforts: { id: string; name: string }[]; defaultEffort?: string } }
export interface NativeModelGroup { id: string; name: string; models: NativeModelRow[] }
export class NativeModelDirectory {
  private groups: NativeModelGroup[] = [];
  constructor(private readonly channel: Pick<NativeChannel, 'current' | 'request'>) {}
  async refresh(projectId: string): Promise<{ groups: NativeModelGroup[] }> {
    if (!this.channel.current()) throw Error('RESEARCH_CONTEXT_REVOKED');
    const raw = await this.channel.request(projectId, 'model-catalog', null, new AbortController().signal);
    if (!this.channel.current()) { this.groups = []; throw Error('RESEARCH_CONTEXT_REVOKED'); }
    if (!raw || typeof raw !== 'object' || !('groups' in raw) || !Array.isArray(raw.groups) || raw.groups.length > 128) throw Error('RESEARCH_MODEL_CATALOG_INVALID');
    const groups: NativeModelGroup[] = [];
    for (const group of raw.groups) {
      if (!group || typeof group.id !== 'string' || !group.id || group.id.length > 256 || typeof group.name !== 'string' || !Array.isArray(group.models) || group.models.length > 4096) throw Error('RESEARCH_MODEL_CATALOG_INVALID');
      const models: NativeModelRow[] = group.models.map((row: unknown) => {
        if (!row || typeof row !== 'object' || !('id' in row) || typeof row.id !== 'string' || !row.id || row.id.length > 512 || !('name' in row) || typeof row.name !== 'string') throw Error('RESEARCH_MODEL_CATALOG_INVALID');
        const native:NativeModelRow={id:row.id,name:row.name};
        if('reasoning' in row&&row.reasoning!==undefined){
          const reasoning=row.reasoning as {efforts?:unknown;defaultEffort?:unknown}|null;
          if(!reasoning||typeof reasoning!=='object'||!Array.isArray(reasoning.efforts)||reasoning.efforts.length>64)throw Error('RESEARCH_MODEL_CATALOG_INVALID');
          const efforts=reasoning.efforts.map((effort:unknown)=>{if(!effort||typeof effort!=='object'||!('id'in effort)||typeof effort.id!=='string'||!effort.id||effort.id.length>128||!('name'in effort)||typeof effort.name!=='string'||effort.name.length>512)throw Error('RESEARCH_MODEL_CATALOG_INVALID');return {id:effort.id,name:effort.name};});
          if(new Set(efforts.map(effort=>effort.id)).size!==efforts.length||reasoning.defaultEffort!==undefined&&(typeof reasoning.defaultEffort!=='string'||!efforts.some(effort=>effort.id===reasoning.defaultEffort)))throw Error('RESEARCH_MODEL_CATALOG_INVALID');
          native.reasoning={efforts,...(typeof reasoning.defaultEffort==='string'?{defaultEffort:reasoning.defaultEffort}:{})};
        }
        return native;
      });
      groups.push({ id: group.id, name: group.name, models });
    }
    const rowKeys = groups.flatMap(group => group.models.map(model => `${group.id}/${model.id}`));
    if (new Set(rowKeys).size !== rowKeys.length || new Set(groups.map(group => group.id)).size !== groups.length || groups.some(group => new Set(group.models.map(model => model.id)).size !== group.models.length)) throw Error('RESEARCH_MODEL_CATALOG_INVALID');
    this.groups = groups; return { groups };
  }
  available(ref: string): boolean { return this.channel.current() && this.groups.some(group => group.models.some(model => `${group.id}/${model.id}` === ref)); }
  async require(projectId: string, ref: string): Promise<void> { await this.refresh(projectId); if (!this.available(ref)) throw Error('RESEARCH_MODEL_UNAVAILABLE'); }
}
