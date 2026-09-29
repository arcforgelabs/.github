import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { parse } from 'yaml';
import * as labelCap from '../vendor/openclaw/scripts/github/labeler-label-cap.mjs';
import { describe, it, expect, vi, beforeEach } from 'vitest';
const require = createRequire(import.meta.url);
const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
const workflow = parse(readFileSync('.github/workflows/labeler.yml', 'utf8'));
const upstream = parse(readFileSync('vendor/openclaw/.github/workflows/labeler.yml', 'utf8'));
const script = (job, name) => workflow.jobs[job].steps.find(s => s.name === name).with.script;
function mocks(files = [], labels = []) {
  const issues = Object.fromEntries(['getLabel','createLabel','removeLabel','addLabels','listLabelsOnIssue'].map(n => [n,vi.fn(async()=>({data:[]}))]));
  const pulls = { listFiles: vi.fn() };
  const github = {rest:{issues,pulls,teams:{getMembershipForUserInOrg:vi.fn(async()=>({data:{state:'active'}}))}},paginate:vi.fn(async(fn)=>fn===pulls.listFiles?files:labels)};
  const context = {repo:{owner:'arcforgelabs',repo:'test'},payload:{pull_request:{number:10,title:'Fix',user:{login:'maintainer'}}}};
  const core = {info:vi.fn(),warning:vi.fn()};
  return {github,context,core};
}
async function run(job,name,m) { await new AsyncFunction('github','context','core','require','importHelper',script(job,name).replaceAll('await import(', 'await importHelper('))(m.github,m.context,m.core,require,async () => labelCap); }
beforeEach(()=>{process.env.GITHUB_WORKSPACE=process.cwd();});
describe('faithful labeler behavior',()=>{
  it.each([[0,'XS'],[49,'XS'],[50,'S'],[199,'S'],[200,'M'],[499,'M'],[500,'L'],[999,'L'],[1000,'XL']])('sizes %i lines as %s',async(lines,size)=>{
    const m=mocks([{filename:'src/a.ts',additions:lines},{filename:'docs/a.md',additions:9000},{filename:'pnpm-lock.yaml',additions:9000}],[{name:'size: XL'},{name:'bug'}]);
    await run('label','Apply PR size label',m);
    expect(m.github.rest.issues.addLabels).toHaveBeenCalledWith(expect.objectContaining({labels:[`size: ${size}`]}));
    expect(m.github.rest.issues.removeLabel).not.toHaveBeenCalledWith(expect.objectContaining({name:'bug'}));
  });
  it('adds maintainer only for active team membership',async()=>{
    const m=mocks();
    await run('label','Apply maintainer or trusted-contributor label',m);
    expect(m.github.rest.issues.addLabels).toHaveBeenCalledWith(expect.objectContaining({labels:['maintainer']}));
    m.github.rest.issues.addLabels.mockClear();
    m.github.rest.teams.getMembershipForUserInOrg.mockRejectedValue({status:404});
    await run('label','Apply maintainer or trusted-contributor label',m);
    expect(m.github.rest.issues.addLabels).not.toHaveBeenCalled();
  });
  it('removes beta-blocker when the title no longer matches',async()=>{
    const m=mocks([],[{name:'beta-blocker'}]);
    await run('label','Apply beta-blocker title label',m);
    expect(m.github.rest.issues.removeLabel).toHaveBeenCalledWith(expect.objectContaining({name:'beta-blocker'}));
  });
  it('keeps upstream scripts unchanged except helper path and backfill input transport',()=>{
    for(const [job,config] of Object.entries(workflow.jobs)) for(const step of config.steps) {
      if(!step.with?.script || step.name==='Load optional area map') continue;
      const source=upstream.jobs[job].steps.find(s=>s.name===step.name).with.script;
      const normalized=step.with.script.replaceAll('/vendor/openclaw/scripts/','/scripts/').replace('  // Keep GitHub pagination offsets stable; the inner loop enforces maxCount.\n  const pageSize = perPage;', '  const remaining = maxCount - processed;\n  const pageSize = processAll ? perPage : Math.min(perPage, remaining);').replace('const inputs = { max_prs: process.env.LABELER_MAX_PRS, per_page: process.env.LABELER_PER_PAGE };','const inputs = context.payload.inputs ?? {};');
      expect(normalized).toBe(source);
    }
  });
  it('backfills 75 distinct PRs across fixed-size pages', async()=>{
    process.env.LABELER_MAX_PRS='75';
    process.env.LABELER_PER_PAGE='50';
    const m=mocks();
    const prs=Array.from({length:100},(_,i)=>({number:i+1,title:'Fix',user:{login:'sam'}}));
    m.github.rest.pulls.list=vi.fn(async({page,per_page})=>({data:prs.slice((page-1)*per_page,page*per_page)}));
    await run('backfill-pr-labels','Backfill PR labels',m);
    const sized=m.github.rest.issues.addLabels.mock.calls.map(([arg])=>arg).filter(arg=>arg.labels.includes('size: XS')).map(arg=>arg.issue_number);
    expect(sized).toEqual(Array.from({length:75},(_,i)=>i+1));
    expect(m.github.rest.pulls.list.mock.calls.map(([arg])=>arg.per_page)).toEqual([50,50]);
  });
  it('has no PR cap duplicate or untrusted checkout',()=>{
    for(const job of Object.values(workflow.jobs)) for(const step of job.steps){
      expect(step.name).not.toBe('Apply too-many-prs label');
      if(step.uses?.startsWith('actions/checkout@')) {
        expect(step.with.ref).toBe('${{ job.workflow_sha }}');
        expect(step.with.repository).toBe('${{ job.workflow_repository }}');
        expect(step.with['persist-credentials']).toBe(false);
      }
    }
  });
});
