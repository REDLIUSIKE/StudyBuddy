export const CAMPUS_PLAYBOOK_VERSION = "2026-10-11.v1" as const;
export const CAMPUS_PLAYBOOK_SUBMISSION_KINDS = ["FEEDBACK", "PLAN"] as const;
export const CAMPUS_PLAYBOOK_SUBMISSION_STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED"] as const;
export type CampusPlaybookSubmissionKind = typeof CAMPUS_PLAYBOOK_SUBMISSION_KINDS[number];
export type CampusPlaybookSubmissionStatus = typeof CAMPUS_PLAYBOOK_SUBMISSION_STATUSES[number];

export type CampusPlaybookSubmissionCreate=Readonly<{kind:CampusPlaybookSubmissionKind;entryId:string;sectionId:string;body:string}>;
export type CampusPlaybookSubmissionReceipt=Readonly<{id:string;publicCode:string;status:CampusPlaybookSubmissionStatus;createdAt:string}>;
export type CampusPlaybookSubmissionUpdate=Readonly<{status:CampusPlaybookSubmissionStatus;adminNote:string|null}>;
export type CampusPlaybookSubmissionView=Readonly<{id:string;publicCode:string;kind:CampusPlaybookSubmissionKind;status:CampusPlaybookSubmissionStatus;studyBuddyUserId:string;accountMasked:string;playbookVersion:string;groupId:string;groupTitle:string;entryId:string;entryTitle:string;sectionId:string;sectionTitle:string;body:string;adminNote:string|null;createdAt:string;updatedAt:string;resolvedAt:string|null}>;
export type CampusPlaybookSubmissionPage=Readonly<{items:readonly CampusPlaybookSubmissionView[];nextCursor:string|null}>;
export function parseCampusPlaybookSubmissionCreate(value:unknown):CampusPlaybookSubmissionCreate{const record=exact(value,["kind","entryId","sectionId","body"]);if(!one(record.kind,CAMPUS_PLAYBOOK_SUBMISSION_KINDS)||!identifier(record.entryId)||!identifier(record.sectionId))throw invalid();return{kind:record.kind,entryId:record.entryId,sectionId:record.sectionId,body:bodyText(record.body,4000)};}
export function parseCampusPlaybookSubmissionUpdate(value:unknown):CampusPlaybookSubmissionUpdate{const record=exact(value,["status","adminNote"]);if(!one(record.status,CAMPUS_PLAYBOOK_SUBMISSION_STATUSES))throw invalid();return{status:record.status,adminNote:record.adminNote===null?null:noteText(record.adminNote,4000)};}
function exact(value:unknown,keys:readonly string[]):Record<string,unknown>{if(typeof value!=="object"||value===null||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype)throw invalid();const record=value as Record<string,unknown>;const actual=Reflect.ownKeys(record);if(actual.length!==keys.length||actual.some((key)=>typeof key!=="string"||!keys.includes(key)))throw invalid();return record;}
function one<T extends string>(value:unknown,values:readonly T[]):value is T{return typeof value==="string"&&values.includes(value as T);}
function identifier(value:unknown):value is string{return typeof value==="string"&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);}
function bodyText(value:unknown,max:number):string{if(typeof value!=="string")throw invalid();const result=value.normalize("NFKC").trim();if(!result||result.length>max)throw invalid();return result;}
function noteText(value:unknown,max:number):string|null{if(typeof value!=="string")throw invalid();const result=value.normalize("NFKC").trim();if(result.length>max)throw invalid();return result||null;}
function invalid():TypeError{return new TypeError("CAMPUS_PLAYBOOK_SUBMISSION_INVALID");}
