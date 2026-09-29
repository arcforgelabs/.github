import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { it, expect, vi } from 'vitest';
const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
const read = p => parse(readFileSync(p,'utf8'));
const workflow=read('.github/workflows/maintainer-command-reactions.yml');
const script=workflow.jobs.react.steps[0].with.script;
it('preserves upstream reaction script',()=>{
 expect(script).toBe(read('vendor/openclaw/.github/workflows/maintainer-command-reactions.yml').jobs.react.steps[0].with.script);
});
it.each([
 ['/land','write',true,true],['/land extra','admin',true,true],
 ['/land','read',true,false],['/land','write',false,false],
 ['/autoclose reason','maintain',false,true],['prose /land','write',true,false],
 ['/landing','write',true,false],['text\n/merge','write',true,true],
])('command %s, role %s, PR %s reacts %s',async(body,permission,pr,react)=>{
 process.env.MAINTAINER_COMMAND_REACTIONS='/autoclose,/clawsweeper autoclose,/clawsweeper automerge,/merge,/land,/landpr';
 const create=vi.fn();
 const github={rest:{repos:{getCollaboratorPermissionLevel:vi.fn(async()=>({data:{permission}}))},reactions:{createForIssueComment:create}}};
 const context={repo:{owner:'arcforgelabs',repo:'test'},payload:{comment:{id:1,body,user:{login:'sam'}},issue:{number:2,...(pr?{pull_request:{}}:{})}}};
 await new AsyncFunction('github','context','core',script)(github,context,{info:vi.fn(),warning:vi.fn()});
 expect(create).toHaveBeenCalledTimes(react?1:0);
});
