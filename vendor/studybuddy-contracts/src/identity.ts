import type { AcademicEntitySelection, AcademicProgramSelection } from './academic.js';
import { parseAcademicProfileLockRequest } from './academic.js';

export type IdentityStage = 'high_school' | 'higher_education';
export type IdentityEntity = Readonly<{ id: string; name: string; status: 'verified' | 'pending' }>;
export type IdentityProfile =
  | Readonly<{ kind: 'student'; stage: 'high_school'; realName: string; grade: string; school: IdentityEntity }>
  | Readonly<{ kind: 'student'; stage: 'higher_education'; realName: string; grade: string; school: IdentityEntity; college: IdentityEntity; program: IdentityEntity }>
  | Readonly<{ kind: 'community'; province: Readonly<{code:string;name:string}>; city: Readonly<{code:string;name:string}> }>;
export type IdentityProfileView = Readonly<{ profile: IdentityProfile | null; revision: number; updatedAt: string | null }>;
export type IdentitySaveProfile =
  | Readonly<{kind:'student';stage:'high_school';realName:string;grade:string;school:AcademicEntitySelection}>
  | Readonly<{kind:'student';stage:'higher_education';realName:string;grade:string;school:AcademicEntitySelection;college:AcademicEntitySelection;program:AcademicProgramSelection}>
  | Readonly<{kind:'community';provinceCode:string;cityCode:string}>;
export type IdentitySaveRequest = Readonly<{expectedRevision:number;profile:IdentitySaveProfile}>;
export type IdentityDirectoryItem = IdentityEntity & Readonly<{stage?:IdentityStage}>;
export type IdentityRegion = Readonly<{code:string;name:string;parentCode:string|null}>;
export type IdentityBoard = 'SCHOOL'|'STUDENT'|'COLLEGE'|'PROGRAM'|'PROVINCE'|'CITY'|'COMMUNITY';
export type IdentityBoardScope = 'NATION'|'SCHOOL'|'COLLEGE'|'PROGRAM'|'PROVINCE'|'CITY';
export type IdentityRankingQuery = Readonly<{period:'DAY'|'WEEK'|'MONTH'|'ALL_TIME';board:IdentityBoard;scope:IdentityBoardScope;scopeId:string;offset:number;limit:number}>;
export type IdentityRankingItem = Readonly<{rank:number;id:string;name:string;totalTokens:string;affiliation:string|null;educationStage:IdentityStage|null}>;
export type IdentityRankingPage = Readonly<{items:readonly IdentityRankingItem[];currentUser:IdentityRankingItem|null;hasMore:boolean;computedAt:string}>;

/** Parse one complete identity replacement; revision zero creates the first generic identity. */
export function parseIdentitySaveRequest(value: unknown): IdentitySaveRequest {
  try {
    const outer = exact(value, ['expectedRevision','profile']);
    if (!Number.isSafeInteger(outer.expectedRevision) || (outer.expectedRevision as number) < 0) invalid();
    const profile = object(outer.profile);
    if (profile.kind === 'community') {
      exact(profile,['kind','provinceCode','cityCode']);
      return {expectedRevision:outer.expectedRevision as number,profile:{kind:'community',provinceCode:regionCode(profile.provinceCode),cityCode:regionCode(profile.cityCode)}};
    }
    if (profile.kind !== 'student' || !['high_school','higher_education'].includes(String(profile.stage))) invalid();
    const fields=['kind','stage','realName','grade','school'];
    if(profile.stage==='higher_education')fields.push('college','program');
    exact(profile,fields);
    const realName=text(profile.realName,120);
    const grade=text(profile.grade,32);
    if(!/^(19|20)\d{2}级$/u.test(grade))invalid();
    if(profile.stage==='high_school')return {expectedRevision:outer.expectedRevision as number,profile:{kind:'student',stage:'high_school',realName,grade,school:selection(profile.school)}};
    const academic=parseAcademicProfileLockRequest({realName,grade,school:profile.school,college:profile.college,program:profile.program});
    return {expectedRevision:outer.expectedRevision as number,profile:{kind:'student',stage:'higher_education',...academic}};
  } catch { return invalid(); }
}

/** Validate the server-owned identity summary before rendering it. */
export function parseIdentityProfileView(value:unknown):IdentityProfileView {
  try {
    const row=exact(value,['profile','revision','updatedAt']);
    if(!Number.isSafeInteger(row.revision)||(row.revision as number)<0)invalid();
    if(row.profile===null){if(row.revision!==0||row.updatedAt!==null)invalid();return {profile:null,revision:0,updatedAt:null};}
    if(typeof row.updatedAt!=='string'||!Number.isFinite(Date.parse(row.updatedAt)))invalid();
    const source=object(row.profile);
    let profile:IdentityProfile;
    if(source.kind==='community'){
      exact(source,['kind','province','city']);
      const region=(value:unknown)=>{const r=exact(value,['code','name']);return {code:regionCode(r.code),name:text(r.name,160)};};
      profile={kind:'community',province:region(source.province),city:region(source.city)};
    }else{
      const keys=['kind','stage','realName','grade','school'];
      if(source.stage==='higher_education')keys.push('college','program');
      exact(source,keys);
      if(source.kind!=='student'||!['high_school','higher_education'].includes(String(source.stage)))invalid();
      const realName=text(source.realName,120),grade=text(source.grade,32);
      if(!/^(19|20)\d{2}级$/u.test(grade))invalid();
      const base={kind:'student' as const,realName,grade,school:entity(source.school)};
      profile=source.stage==='high_school'?{...base,stage:'high_school'}:{...base,stage:'higher_education',college:entity(source.college),program:entity(source.program)};
    }
    return {profile,revision:row.revision as number,updatedAt:row.updatedAt as string};
  }catch{return invalid();}
}

export function parseIdentityRankingQuery(value:unknown):IdentityRankingQuery {
  const q=queryObject(value);
  if(Reflect.ownKeys(q).some(k=>typeof k!=='string'||!['period','board','scope','scopeId','offset','limit'].includes(k)))invalid();
  const period=q.period??'DAY',board=q.board??'SCHOOL',scope=q.scope??'NATION';
  if(!['DAY','WEEK','MONTH','ALL_TIME'].includes(String(period)))invalid();
  const combinations:Record<string,readonly string[]>={NATION:['SCHOOL','STUDENT','PROVINCE','COMMUNITY'],SCHOOL:['COLLEGE','STUDENT'],COLLEGE:['PROGRAM','STUDENT'],PROGRAM:['STUDENT'],PROVINCE:['CITY','COMMUNITY'],CITY:['COMMUNITY']};
  if(!Object.hasOwn(combinations,String(scope))||!combinations[String(scope)]!.includes(String(board)))invalid();
  const scopeId=scope==='NATION'?(q.scopeId===undefined||q.scopeId==='NATION'?'NATION':invalid()):scope==='PROVINCE'||scope==='CITY'?regionCode(q.scopeId):uuid(q.scopeId);
  const integer=(v:unknown,fallback:number,max:number)=>{if(v===undefined)return fallback;if(typeof v!=='string'||!/^(0|[1-9]\d*)$/.test(v)||Number(v)>max)invalid();return Number(v);};
  const limit=integer(q.limit,50,100);if(limit<1)invalid();
  return {period:period as IdentityRankingQuery['period'],board:board as IdentityBoard,scope:scope as IdentityBoardScope,scopeId,offset:integer(q.offset,0,10000),limit};
}

export function parseIdentitySchools(value:unknown):{items:IdentityDirectoryItem[]}{
  const row=exact(value,['items']);if(!Array.isArray(row.items)||row.items.length>30)invalid();
  return {items:row.items.map(value=>{const item=exact(value,['id','name','status','stage']);if(item.stage!=='high_school'&&item.stage!=='higher_education')invalid();return {...entity({id:item.id,name:item.name,status:item.status}),stage:item.stage as IdentityStage};})};
}
export function parseIdentityRegions(value:unknown):{items:IdentityRegion[]}{
  const row=exact(value,['items']);if(!Array.isArray(row.items)||row.items.length>1000)invalid();
  return {items:row.items.map(value=>{const item=exact(value,['code','name','parentCode']);return {code:regionCode(item.code),name:text(item.name,160),parentCode:item.parentCode===null?null:regionCode(item.parentCode)};})};
}
export function parseIdentityRankingPage(value:unknown):IdentityRankingPage{
  const row=exact(value,['items','currentUser','hasMore','computedAt']);
  if(!Array.isArray(row.items)||row.items.length>100||typeof row.hasMore!=='boolean'||typeof row.computedAt!=='string'||!Number.isFinite(Date.parse(row.computedAt)))invalid();
  const item=(value:unknown):IdentityRankingItem=>{const r=exact(value,['rank','id','name','totalTokens','affiliation','educationStage']);if(!Number.isSafeInteger(r.rank)||(r.rank as number)<1||typeof r.id!=='string'||!( /^[1-8]\d{5}$/.test(r.id)||/^[0-9a-f-]{36}$/.test(r.id))||typeof r.totalTokens!=='string'||!/^[1-9]\d{0,38}$/.test(r.totalTokens)||(r.educationStage!==null&&r.educationStage!=='high_school'&&r.educationStage!=='higher_education'))invalid();return {rank:r.rank as number,id:r.id,name:text(r.name,160),totalTokens:r.totalTokens,affiliation:r.affiliation===null?null:text(r.affiliation,160),educationStage:r.educationStage as IdentityStage|null};};
  return {items:row.items.map(item),currentUser:row.currentUser===null?null:item(row.currentUser),hasMore:row.hasMore as boolean,computedAt:row.computedAt as string};
}

/** Express query dictionaries may have a null prototype. Values remain strictly validated. */
export function queryObject(value:unknown):Record<string,unknown>{if(typeof value!=='object'||value===null||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))invalid();return {...value as Record<string,unknown>};}

function object(value:unknown):Record<string,unknown>{if(typeof value!=='object'||value===null||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype)invalid();return value as Record<string,unknown>;}
function exact(value:unknown,keys:readonly string[]):Record<string,unknown>{const result=object(value);const actual=Reflect.ownKeys(result);if(actual.length!==keys.length||actual.some(k=>typeof k!=='string'||!keys.includes(k)))invalid();return result;}
function text(value:unknown,max:number):string{if(typeof value!=='string')invalid();const result=(value as string).normalize('NFKC').trim().replace(/\s+/gu,' ');const length=Array.from(result).reduce((bytes,char)=>{const cp=char.codePointAt(0)!;return bytes+(cp<=0x7f?1:cp<=0x7ff?2:cp<=0xffff?3:4);},0);if(length<1||length>max)invalid();return result;}
function uuid(value:unknown):string{if(typeof value!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value))invalid();return value as string;}
function regionCode(value:unknown):string{if(typeof value!=='string'||!/^[1-8]\d{5}$/.test(value))invalid();return value as string;}
function selection(value:unknown):AcademicEntitySelection{const s=object(value);if(Reflect.ownKeys(s).length!==1)invalid();if(Object.hasOwn(s,'id'))return {id:uuid(s.id)};if(Object.hasOwn(s,'candidateName'))return {candidateName:text(s.candidateName,160)};return invalid();}
function entity(value:unknown):IdentityEntity{const s=exact(value,['id','name','status']);if(s.status!=='verified'&&s.status!=='pending')invalid();return {id:uuid(s.id),name:text(s.name,160),status:s.status as IdentityEntity['status']};}
function invalid():never{throw new TypeError('IDENTITY_PROFILE_INVALID');}
