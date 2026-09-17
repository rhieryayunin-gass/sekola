// @vitest-environment node
import {expect,it} from 'vitest';
import {POST as setup} from './route';
import {POST as questions} from '../../questions/generate/route';
it('retires both generation endpoints',async()=>{expect((await setup()).status).toBe(410);expect((await questions()).status).toBe(410);});
