import { resolve, relative, isAbsolute, dirname, sep } from "node:path";
import { lstat, realpath } from "@toonflow/file";
import { timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";
import {admitNativeCaller,withNativeCaller} from '@/embedded/native';

export const embedded = process.env.STUDYBUDDY_EMBEDDED === "1";
let guestAuthorization = "";
let admittedOrigin = "";
let workspaceRoots: string[] = [];
const admittedApi = /^\/api\/(?:studybuddy\/info|settings\/(?:get|save|systemprompt|personalization\/(?:get|save))|workspaces\/(?:list|check|selectdirectory|files\/(?:list|read|write|mkdir|rename|remove|copy|importimage))|assets\/(?:list|read|save|mkdir|rename|remove)|ai\/(?:models|generate|media\/(?:models|generate|tasks|resume))|agent(?:\/(?:create|list|get|message|rename|skills|mentionsource|canvasresult|answer))?|singleagent\/(?:create|run|control|toolresult|answer)|ffmpeg\/(?:status|progress|events|execute)|tools\/(?:get|client|renderers|save|setenabled)|nodes\/(?:get|files|save|setenabled)|ext\/(?:list|read|save|setenabled)|skills\/(?:get|list|read|save|create|order|move|setenabled))$/;
export async function configurePolicy(authorization: string, roots: string[]) {
  if (!/^[a-f0-9]{64}$/.test(authorization) || !roots.length) throw new Error("AIGC_BOOTSTRAP_INVALID");
  guestAuthorization = authorization;
  workspaceRoots = await Promise.all(roots.map(async root => { await denyLinks(root); return realpath(root); }));
}
export function setAdmittedOrigin(origin: string) { admittedOrigin = origin; }
export const authorize: RequestHandler = (req, res, next) => {
  const provided = req.get("x-studybuddy-aigc-guest") ?? "";
  if (!/^[a-f0-9]{64}$/.test(provided) || !guestAuthorization
    || !timingSafeEqual(Buffer.from(provided), Buffer.from(guestAuthorization))) {
    res.status(401).json({ code: 401, data: null, message: "AIGC_AUTH_REQUIRED" }); return;
  }
  if (!admittedOrigin || req.get("host") !== new URL(admittedOrigin).host
    || (req.get("origin") !== undefined && req.get("origin") !== admittedOrigin)) {
    res.status(403).json({ code: 403, data: null, message: "AIGC_ORIGIN_DENIED" }); return;
  }
  let path: string;
  try { path = decodeURIComponent(req.path).toLowerCase().replace(/\/+$/, "") || "/"; }
  catch { res.status(403).json({ code: 403, data: null, message: "AIGC_OPERATION_UNAVAILABLE" }); return; }
  const nativeControl = process.env.STUDYBUDDY_NATIVE_AIGC === "1"
    && /^\/api\/(?:mcp\/control\/(?:events|state|result)|browser\/(?:stream|input)|native\/(?:(?:project|chats|archive|surface|reference|referencesource)|temporary\/(?:create|run|control|toolresult)))$/.test(path);
  const oldChat = process.env.STUDYBUDDY_NATIVE_AIGC === "1" && /^\/api\/(?:agent|singleagent)(?:\/|$)/.test(path);
  if (oldChat || /^\/(?:mcp|a2a)(?:\/|$)/.test(path) || /^\/api(?:\/|$)/.test(path) && !admittedApi.test(path) && !nativeControl) {
    res.status(403).json({ code: 403, data: null, message: "AIGC_OPERATION_UNAVAILABLE" }); return;
  }
  res.set("Cache-Control", "no-store");
  const grant=req.get('x-studybuddy-capability-grant');
  if(grant!==undefined){
    try{const caller=admitNativeCaller(grant);withNativeCaller(caller,()=>next());}
    catch{res.status(403).json({code:403,data:null,message:'AIGC_CALLER_REVOKED'});}return;
  }
  next();
};
export async function denyLinks(path: string) {
  let current = resolve(path);
  for (;;) {
    const info = await lstat(current).catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return null; throw error; });
    if (info?.isSymbolicLink()) throw Object.assign(new Error("AIGC_WORKSPACE_DENIED"), { status: 403 });
    const parent = dirname(current); if (parent === current) return; current = parent;
  }
}
export async function admitWorkspace(path: string) {
  await denyLinks(path);
  const target = await realpath(path);
  if (!workspaceRoots.some(root => {
    const offset = relative(root, target);
    return offset !== ".." && !offset.startsWith(`..${sep}`) && !isAbsolute(offset);
  })) throw Object.assign(new Error("AIGC_WORKSPACE_DENIED"), { status: 403 });
  return target;
}
export function rejectMedia(type: string): never {
  const code = type === "video" ? "AIGC_VIDEO_MODEL_NOT_CONFIGURED" : type === "image" ? "AIGC_IMAGE_UNAVAILABLE" : "AIGC_AUDIO_UNAVAILABLE";
  throw Object.assign(new Error(code), { code, status: 409 });
}
