import {describe,expect,it} from 'vitest';
import {roleNavigation} from './navigation';
import type {PermissionContext} from '../stores/permission-store';
const ctx=(codes:string[]):PermissionContext=>({userId:'navigation-test',roles:codes.map(code=>({id:code,code,name:code})),permissions:[]});
describe('approved role navigation',()=>{
 const expected:Record<string,string[]>={PRINCIPAL:['dashboard','gallery','approval','connect'],STAFF:['dashboard','academic','gallery','team','finance','connect'],TEACHER:['dashboard','academic','attendance','learning','exams','gallery','team','connect'],STUDENT:['dashboard','academic','learning','exams','team','connect'],PARENT:['dashboard','learning','exams','team','finance','gallery','connect']};
 it.each(Object.keys(expected))('matches the requested %s workspace',role=>expect(roleNavigation(ctx([role])).map(i=>i.key)).toEqual(expected[role]));
 it('unites Staff and Teacher navigation in either role order',()=>{const expected=['dashboard','academic','attendance','learning','exams','gallery','team','finance','connect'];expect(roleNavigation(ctx(['STAFF','TEACHER'])).map(i=>i.key)).toEqual(expected);expect(roleNavigation(ctx(['TEACHER','STAFF'])).map(i=>i.key)).toEqual(expected);});
 it('honors disabled modules for dual-role users',()=>expect(roleNavigation(ctx(['STAFF','TEACHER']),{finance:false,exams:false,connect:false}).map(i=>i.key)).not.toEqual(expect.arrayContaining(['finance','exams','connect'])));
 it('waits for role context',()=>expect(roleNavigation(null)).toEqual([]));
});
