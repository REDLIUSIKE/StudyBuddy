import { describe, expect, it } from 'vitest';
import { parseIdentitySaveRequest,parseIdentityRankingQuery,parseIdentityRankingPage } from './identity.js';

const id = '10000000-0000-4000-8000-000000000001';
const high = { kind: 'student', stage: 'high_school', realName: '测试学生', grade: '2026级', school: { id } };
describe('editable account identity', () => {
  it('accepts Express query dictionaries but rejects duplicate and unknown query values',()=>{
    expect(parseIdentityRankingQuery(Object.assign(Object.create(null),{board:'CITY',scope:'PROVINCE',scopeId:'530000'}))).toMatchObject({board:'CITY',period:'DAY'});
    expect(()=>parseIdentityRankingQuery({board:['SCHOOL','PROVINCE']})).toThrow();
    expect(()=>parseIdentityRankingQuery({admin:'true'})).toThrow();
  });
  it('keeps arbitrary-precision token totals and rejects numeric totals',()=>{
    const item={rank:1,id,name:'学校',totalTokens:'9007199254740993',affiliation:null,educationStage:'high_school'};
    const page={items:[item],currentUser:null,hasMore:false,computedAt:'2026-10-15T00:00:00Z'};
    expect(parseIdentityRankingPage(page).items[0]?.totalTokens).toBe('9007199254740993');
    expect(()=>parseIdentityRankingPage({...page,items:[{...item,totalTokens:9007199254740993}]})).toThrow();
  });
  it('accepts high-school students without college, program or location', () => {
    expect(parseIdentitySaveRequest({ expectedRevision: 0, profile: high })).toEqual({ expectedRevision: 0, profile: high });
  });
  it('rejects province and city data on every student profile', () => {
    expect(() => parseIdentitySaveRequest({expectedRevision: 1, profile: {...high, provinceCode: '530000', cityCode: '530100'}})).toThrow('IDENTITY_PROFILE_INVALID');
  });
  it('requires college and program for higher education and accepts ordinary edits', () => {
    expect(() => parseIdentitySaveRequest({expectedRevision:1,profile:{...high,stage:'higher_education'}})).toThrow();
    const profile={...high,stage:'higher_education',college:{candidateName:'计算机学院'},program:{candidateName:'计算机科学与技术'}};
    expect(parseIdentitySaveRequest({expectedRevision:7,profile}).expectedRevision).toBe(7);
  });
  it('allows community identity with only a province and city, rejecting student fields', () => {
    const profile={kind:'community',provinceCode:'530000',cityCode:'530100'};
    expect(parseIdentitySaveRequest({expectedRevision:3,profile}).profile).toEqual(profile);
    expect(() => parseIdentitySaveRequest({expectedRevision:3,profile:{...profile,school:{id}}})).toThrow();
  });
  it('rejects malformed revisions, unknown fields and noncanonical identifiers', () => {
    for(const expectedRevision of [-1,1.2,'1',Number.MAX_SAFE_INTEGER+1]) expect(() => parseIdentitySaveRequest({expectedRevision,profile:high})).toThrow();
    expect(() => parseIdentitySaveRequest({expectedRevision:0,profile:{...high,school:{id:'not-a-school'}}})).toThrow();
    expect(() => parseIdentitySaveRequest({expectedRevision:0,profile:high,isAdmin:true})).toThrow();
  });
});
