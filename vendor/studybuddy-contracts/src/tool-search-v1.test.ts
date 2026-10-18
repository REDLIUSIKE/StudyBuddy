import {describe,it,expect} from 'vitest';
import {parseToolSearchRequestV1,parseToolSearchResultV1} from './tool-search-v1.js';
const operationId='0a708d42-4226-4667-a968-30ad17beb381';
const request={operationId,textQuery:'Kimi documentation',maxResults:8};
const result={operationId,state:'completed',sources:[{url:'https://platform.kimi.com/docs',chunks:['source text']}],truncated:false,chargeCny:'0.015',resultExpiresAt:'2026-10-14T15:00:00.000Z'};
describe('strict independent search wire contract',()=>{
 it('retains source chunks and missing supplier title/date without synthesizing model fields',()=>{
   expect(parseToolSearchRequestV1(request)).toEqual(request);
   expect(parseToolSearchResultV1(result)).toEqual(result);
 })
 it('rejects invalid request identity, result bounds and unknown or accessor fields',()=>{
   for(const value of [{...request,operationId:'not a UUID'},{...request,maxResults:0},{...request,maxResults:9},{...request,maxResults:1.5},{...request,textQuery:' '},{...request,apiKey:'secret'}])expect(()=>parseToolSearchRequestV1(value)).toThrow();
   const value={...request};Object.defineProperty(value,'textQuery',{get(){throw new Error('getter must not run')}});expect(()=>parseToolSearchRequestV1(value)).toThrow();
 })
 it('accepts only exact decimal CNY strings, public HTTP(S) sources and bounded context',()=>{
   for(const chargeCny of [0.015,'0.01e1','01.015','-0.015','NaN','0.000000001'])expect(()=>parseToolSearchResultV1({...result,chargeCny})).toThrow();
   for(const url of ['file:///private','javascript:alert(1)','https://user:password@host/','data:text/plain,hello'])expect(()=>parseToolSearchResultV1({...result,sources:[{url,chunks:[]}]})).toThrow();
   expect(()=>parseToolSearchResultV1({...result,sources:[{url:'https://host/',chunks:['x'.repeat(65537)]}]})).toThrow();
 })
 it('distinguishes unknown, empty and expired states without turning a reservation into a charge',()=>{
   expect(parseToolSearchResultV1({...result,state:'unknown',sources:[],chargeCny:'0',resultExpiresAt:null}).state).toBe('unknown');
   expect(parseToolSearchResultV1({...result,state:'result_expired',sources:[]}).chargeCny).toBe('0.015');
   expect(()=>parseToolSearchResultV1({...result,state:'empty'})).toThrow();
   expect(()=>parseToolSearchResultV1({...result,state:'completed',sources:[]})).toThrow();
   expect(()=>parseToolSearchResultV1({...result,state:'dispatched',sources:[]})).toThrow();
 })
});
