/** Independent service credentials for one admitted StudyBuddy account. */
import fs from 'node:fs';
import { atomicJson } from '../atomic-json.ts';
import { assertResearchPath } from './project-storage.ts';
const fields = {
  exaApiKey: { id: 'exa', env: 'EXA_API_KEY' },
  modalTokenId: { id: 'modalTokenId', env: 'MODAL_TOKEN_ID' },
  modalTokenSecret: { id: 'modalTokenSecret', env: 'MODAL_TOKEN_SECRET' },
  paperclipApiKey: { id: 'paperclip', env: 'PAPERCLIP_API_KEY' },
  autodlToken: { id: 'autodl', env: 'AUTODL_TOKEN' },
  metasoApiKey: { id: 'metaso', env: 'METASO_API_KEY' },
  bochaApiKey: { id: 'bocha', env: 'BOCHA_API_KEY' },
} as const;
export type ServiceCredentialField = keyof typeof fields;
type Field = ServiceCredentialField;
type Values = Partial<Record<Field, string>>;
export interface ServiceSelection { compute:'modal'|'autodl'; academic:'paperclip'|'metaso'; web:'exa'|'bocha' }
const defaults:ServiceSelection={compute:'modal',academic:'paperclip',web:'exa'};
function selection(input:unknown, base:ServiceSelection):ServiceSelection {
  if(!input || typeof input!=='object' || Array.isArray(input) || Object.keys(input).length===0) return invalid('RESEARCH_SERVICE_SELECTION_INVALID');
  const allowed={compute:['modal','autodl'],academic:['paperclip','metaso'],web:['exa','bocha']};
  const result={...base};
  for(const [key,item] of Object.entries(input)) {
    if(!Object.hasOwn(allowed,key) || typeof item!=='string' || !allowed[key as keyof ServiceSelection].includes(item)) return invalid('RESEARCH_SERVICE_SELECTION_INVALID');
    (result as Record<string,string>)[key]=item;
  }
  return result;
}
export interface NativeServiceCredentialOptions {
  file: string;
  current(): boolean;
  validateModal(id: string, secret: string): Promise<void>;
  validatePaperclip(key: string): Promise<void>;
}
function invalid(code: string): never { throw Object.assign(Error(code), { statusCode: 400 }); }
function value(raw: unknown): string | undefined {
  if (raw === null || raw === '') return undefined;
  if (typeof raw !== 'string' || raw.length > 8192 || /[\r\n\u0000]/.test(raw) || raw.trim().length < 8) return invalid('RESEARCH_SERVICE_VALUE_INVALID');
  return raw.trim();
}
/** No model/provider keys, repository .env writes, ambient credential discovery or account fallback. */
export class NativeServiceCredentials {
  private values: Values = {};
  private selected:ServiceSelection={...defaults};
  private tail: Promise<unknown> = Promise.resolve();
  constructor(private readonly options: NativeServiceCredentialOptions) {
    assertResearchPath(options.file);
    let raw: unknown;
    try { raw = JSON.parse(fs.readFileSync(options.file, 'utf8')); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    if (raw !== undefined) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !('schemaVersion' in raw) || ![1,2].includes(raw.schemaVersion as number) || !('values' in raw) || Object.keys(raw).length !== (raw.schemaVersion===1?2:3)) throw Error('RESEARCH_SERVICE_STORE_INVALID');
      if(raw.schemaVersion===2) {
        if(!('selection' in raw) || !raw.selection || typeof raw.selection!=='object' || Object.keys(raw.selection).length!==3) throw Error('RESEARCH_SERVICE_STORE_INVALID');
        this.selected=selection(raw.selection,defaults);
      }
      const stored = raw.values;
      if (!stored || typeof stored !== 'object' || Array.isArray(stored)) throw Error('RESEARCH_SERVICE_STORE_INVALID');
      for (const [field, rawValue] of Object.entries(stored)) {
        if (!Object.hasOwn(fields, field)) throw Error('RESEARCH_SERVICE_STORE_INVALID');
        const parsed = value(rawValue); if (!parsed) throw Error('RESEARCH_SERVICE_STORE_INVALID'); this.values[field as Field] = parsed;
      }
      if (Boolean(this.values.modalTokenId) !== Boolean(this.values.modalTokenSecret)) throw Error('RESEARCH_SERVICE_STORE_INVALID');
    }
  }
  status(): Record<string, { set: boolean; masked: string | null }> {
    this.requireCurrent();
    return Object.fromEntries(Object.entries(fields).map(([field, spec]) => {
      const saved = this.values[field as Field];
      return [spec.id, { set: !!saved, masked: saved ? saved.length <= 8 ? '••••' : `${saved.slice(0, 4)}…${saved.slice(-4)}` : null }];
    }));
  }
  selection():ServiceSelection {this.requireCurrent();return {...this.selected};}
  /** Private adapter use only. Never returned by a public route or included in tool output. */
  secret(field:Field):string {this.requireCurrent();const saved=this.values[field];if(!saved) throw Object.assign(Error('RESEARCH_SERVICE_CREDENTIAL_REQUIRED'),{statusCode:422});return saved;}
  select(input:unknown):Promise<ServiceSelection> {
    const operation=this.tail.then(()=>{this.requireCurrent();const candidate=selection(input,this.selected);this.persist(this.values,candidate);this.selected=candidate;return this.selection();});
    this.tail=operation.catch(()=>{});return operation;
  }
  /** Apply only the account's independent service keys to its owned child process. */
  applyEnvironment(): void {
    this.requireCurrent();
    for (const [field, spec] of Object.entries(fields)) {
      const saved = this.values[field as Field];
      if (saved === undefined) delete process.env[spec.env]; else process.env[spec.env] = saved;
    }
  }
  update(input: unknown): Promise<ReturnType<NativeServiceCredentials['status']>> {
    const operation = this.tail.then(async () => {
      this.requireCurrent();
      if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length === 0 || Object.keys(input).some(field => !Object.hasOwn(fields, field))) return invalid('RESEARCH_SERVICE_FIELD_INVALID');
      const candidate = { ...this.values };
      for (const [field, raw] of Object.entries(input)) {
        const parsed = value(raw); if (parsed === undefined) delete candidate[field as Field]; else candidate[field as Field] = parsed;
      }
      if (Boolean(candidate.modalTokenId) !== Boolean(candidate.modalTokenSecret)) return invalid('RESEARCH_MODAL_PAIR_REQUIRED');
      if ((Object.hasOwn(input, 'modalTokenId') || Object.hasOwn(input, 'modalTokenSecret')) && candidate.modalTokenId && candidate.modalTokenSecret) await this.options.validateModal(candidate.modalTokenId, candidate.modalTokenSecret);
      if (Object.hasOwn(input, 'paperclipApiKey') && candidate.paperclipApiKey) await this.options.validatePaperclip(candidate.paperclipApiKey);
      this.requireCurrent(); assertResearchPath(this.options.file);
      this.persist(candidate,this.selected);
      this.values = candidate; this.applyEnvironment(); return this.status();
    });
    this.tail = operation.catch(() => {}); return operation;
  }
  private persist(values:Values,selected:ServiceSelection):void {this.requireCurrent();assertResearchPath(this.options.file);atomicJson(this.options.file,{schemaVersion:2,values,selection:selected});}
  private requireCurrent(): void { if (!this.options.current()) throw Object.assign(Error('RESEARCH_CONTEXT_REVOKED'), { statusCode: 403 }); }
}
