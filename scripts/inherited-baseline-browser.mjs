import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

// Read-only journeys through the local or published collection and its inherited baseline.
// LAB_BASE_URL selects the receiver; external baseline/return URLs are deliberately fixed.
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=(process.env.LAB_BASE_URL||'http://127.0.0.1:8789').replace(/\/$/,'');
const out=process.env.LAB_EVIDENCE_DIR||'/private/tmp/pw155-withdraw-evidence/local';
const canonical='https://lawrencerowland.github.io/gimmer-crag/apps/mountain-refuge-petri-wbs-demo/';
const canonicalReturn='https://lawrencerowland.github.io/gimmer-crag/app-index.html#app-20-comparison';
const legacy=base+'/apps/mountain-refuge-petri-wbs-demo/';
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,channel:process.env.LAB_BROWSER_CHANNEL||'chrome'});
const context=await browser.newContext({viewport:{width:1440,height:1000}});
const page=await context.newPage(),checks=[],failures=[],errors=[],networkFailures=[];
page.setDefaultTimeout(20000);page.setDefaultNavigationTimeout(45000);
page.on('pageerror',e=>errors.push({page:page.url(),message:String(e)}));
page.on('requestfailed',r=>networkFailures.push({url:r.url(),error:r.failure()?.errorText}));
async function check(name,fn){
  try{await fn();checks.push(name);console.log('PASS '+name);}
  catch(e){failures.push({name,error:String(e)});console.error('FAIL '+name+' — '+String(e));await page.screenshot({path:path.join(out,'failure-'+failures.length+'.png'),fullPage:true}).catch(()=>{});}
}
async function go(url){const response=await page.goto(url,{waitUntil:'domcontentloaded'});if(response)assert.ok(response.ok(),`${url}: HTTP ${response.status()}`);else assert.equal(page.url(),url,'A same-document navigation must retain the requested URL.');}
async function baselineReady(){await page.waitForURL(url=>url.origin+url.pathname===canonical,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.querySelector('#witnessStatus')?.textContent.includes('Full plans'));}
const noOverflow=async()=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'Document has horizontal overflow.');
const baselineLink='a[href="'+canonical+'#same-plan-witness"]';

try{
  await check('root keeps the baseline outside higher-autonomy experiment cards',async()=>{
    await go(base+'/');
    assert.equal(await page.locator('.content '+baselineLink).count(),0);
    const text=await page.locator('#inherited-baseline').innerText();
    assert.match(text,/inherited baseline/i);assert.match(text,/human-steered/i);assert.match(text,/not a higher-autonomy experiment/i);
    assert.equal(await page.locator('#inherited-baseline '+baselineLink).count(),1);
    assert.ok(await page.locator('a[href="graph.html"]').count());assert.ok(await page.locator('a[href="multilayer_graph.html"]').count());
  });
  await check('landing has an unnumbered inherited baseline and both higher-autonomy labs',async()=>{
    await go(base+'/process-to-plan-lab/');
    const text=await page.locator('#inherited-baseline').innerText();
    assert.match(text,/inherited baseline/i);assert.doesNotMatch(text,/experiment\s*0?1/i);
    assert.equal(await page.locator('#inherited-baseline '+baselineLink).count(),1);
    assert.ok(await page.locator('a[href="../apps/causal-plan-lab/"]').count());
    assert.ok(await page.locator('a[href="../apps/process-contract-lab/"]').count());
    await page.screenshot({path:path.join(out,'landing-desktop.png'),fullPage:true});
  });
  for(const [label,route] of [['root','/'],['landing','/process-to-plan-lab/'],['causal lab','/apps/causal-plan-lab/'],['process contract lab','/apps/process-contract-lab/']]){
    await check(label+' inherited-baseline link reaches the canonical comparison',async()=>{
      await go(base+route);
      const link=page.locator(baselineLink).first();assert.match(await link.innerText(),/inherited baseline/i);
      await link.click();await baselineReady();assert.equal(page.url(),canonical+'#same-plan-witness');
      assert.match(await page.locator('#witnessStatus').innerText(),/Full plans match\. Both finish on day 36/);
    });
  }
  await check('canonical comparison returns to the broader collection at its inherited reference',async()=>{
    await go(canonical+'#same-plan-witness');await baselineReady();
    const link=page.locator('.pageNav a').first();assert.equal(await link.evaluate(a=>a.href),canonicalReturn);
    await link.click();await page.waitForURL(canonicalReturn,{waitUntil:'domcontentloaded'});
    await page.locator('#app-20-comparison').waitFor({state:'visible'});
    assert.equal(page.url(),canonicalReturn);
  });
  await check('canonical baseline comparison still computes equal complete baseline plans',async()=>{
    await go(canonical+'#same-plan-witness');await baselineReady();
    assert.equal(await page.locator('[data-witness="baseline"]').getAttribute('aria-pressed'),'true');
    assert.equal(await page.locator('#witnessFinishA').innerText(),'day 36');assert.equal(await page.locator('#witnessFinishB').innerText(),'day 36');
    const data=JSON.parse(await page.locator('#witnessJson').textContent());assert.equal(data.samePlan,true);
    assert.equal(data.planA.tasks.length,14);assert.deepEqual(data.planA,data.planB);
  });
  await check('canonical more-resources control separates finish 31 from 34',async()=>{
    await page.locator('[data-witness="capacity"]').click();
    assert.equal(await page.locator('[data-witness="capacity"]').getAttribute('aria-pressed'),'true');
    assert.equal(await page.locator('#witnessFinishA').innerText(),'day 31');assert.equal(await page.locator('#witnessFinishB').innerText(),'day 34');
    assert.match(await page.locator('#witnessStatus').innerText(),/Full plans differ/);
  });
  await check('canonical different-order control works by keyboard with equal finish dates',async()=>{
    await page.locator('[data-witness="preference"]').focus();await page.keyboard.press('Enter');
    assert.equal(await page.locator('[data-witness="preference"]').getAttribute('aria-pressed'),'true');
    assert.equal(await page.locator('#witnessFinishA').innerText(),'day 36');assert.equal(await page.locator('#witnessFinishB').innerText(),'day 36');
    const data=JSON.parse(await page.locator('#witnessJson').textContent());assert.equal(data.samePlan,false);assert.notDeepEqual(data.planA.tasks,data.planB.tasks);
  });
  await check('canonical restart and full-plan disclosure remain usable',async()=>{
    await page.locator('#journeyRestart').click();assert.equal(await page.locator('[data-witness="baseline"]').getAttribute('aria-pressed'),'true');
    await page.locator('#witnessDetails > summary').click();assert.equal(await page.locator('#witnessDetails').getAttribute('open'),'');
    assert.equal(await page.locator('#witnessPlanA tbody tr').count(),14);assert.equal(await page.locator('#witnessPlanB tbody tr').count(),14);
    await page.screenshot({path:path.join(out,'canonical-baseline-desktop.png'),fullPage:true});
  });
  await check('old local route redirects to the inherited baseline by default',async()=>{
    await page.goto(legacy,{waitUntil:'domcontentloaded'});await baselineReady();assert.equal(page.url(),canonical+'#same-plan-witness');
  });
  await check('old local route preserves query parameters when supplying the default anchor',async()=>{
    const query='?from=autonomous%20collection&case=roof%2Bwall';
    await page.goto(legacy+query,{waitUntil:'domcontentloaded'});await baselineReady();assert.equal(page.url(),canonical+query+'#same-plan-witness');
  });
  for(const anchor of ['same-plan-witness','schedule-lab','process-lab','netJson','model-notes']){
    await check('redirect preserves query and #'+anchor+' and reveals its disclosure ancestors',async()=>{
      const query='?from=withdrawn-copy&retained=1';
      await page.goto(legacy+query+'#'+anchor,{waitUntil:'domcontentloaded'});await baselineReady();
      assert.equal(page.url(),canonical+query+'#'+anchor);
      const target=page.locator('#'+anchor);await target.waitFor({state:'visible'});
      assert.equal(await target.evaluate(el=>{let p=el;while(p){if(p.matches('details')&&!p.open)return false;p=p.parentElement;}return true;}),true);
      if(anchor==='process-lab'){
        assert.equal(await page.locator('#workbench').getAttribute('open'),'');assert.equal(await page.locator('#manual-model').getAttribute('open'),'');
        await page.screenshot({path:path.join(out,'canonical-manual-anchor.png'),fullPage:false});
      }
    });
  }
  const nojs=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:844}}),fallback=await nojs.newPage();
  await check('no-JavaScript route retains canonical metadata and a visible external fallback',async()=>{
    const response=await fallback.goto(legacy,{waitUntil:'domcontentloaded'});assert.equal(response.status(),200);assert.equal(fallback.url(),legacy);
    assert.equal(await fallback.locator('link[rel="canonical"]').getAttribute('href'),canonical);
    assert.equal(await fallback.locator('meta[name="robots"]').getAttribute('content'),'noindex');
    const link=fallback.locator('#baseline-link');assert.equal(await link.isVisible(),true);assert.equal(await link.getAttribute('href'),canonical+'#same-plan-witness');
    assert.match(await fallback.locator('body').innerText(),/not a higher-autonomy experiment/);
    assert.ok(await fallback.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));
    await fallback.screenshot({path:path.join(out,'fallback-no-javascript-mobile.png'),fullPage:true});
  });
  await check('no-JavaScript fallback link reaches the canonical application',async()=>{
    await fallback.locator('#baseline-link').click();await fallback.waitForURL(canonical+'#same-plan-witness',{waitUntil:'domcontentloaded'});
    assert.ok((await fallback.title()).length>0);assert.equal(fallback.url(),canonical+'#same-plan-witness');
  });
  await nojs.close();
  await page.setViewportSize({width:390,height:844});
  for(const [label,route] of [['root','/'],['landing','/process-to-plan-lab/'],['causal lab','/apps/causal-plan-lab/'],['process contract lab','/apps/process-contract-lab/']]){
    await check('390px '+label+' keeps its inherited-baseline link usable without page overflow',async()=>{
      await go(base+route);await noOverflow();const link=page.locator(baselineLink).first();await link.scrollIntoViewIfNeeded();assert.equal(await link.isVisible(),true);
      await noOverflow();if(label==='landing')await page.screenshot({path:path.join(out,'landing-mobile-390.png'),fullPage:true});
    });
  }
  await check('390px canonical comparison controls and full plans still work',async()=>{
    await go(canonical+'#same-plan-witness');await baselineReady();await noOverflow();
    await page.locator('[data-witness="capacity"]').click();assert.equal(await page.locator('#witnessFinishA').innerText(),'day 31');
    await page.locator('[data-witness="preference"]').press('Space');assert.match(await page.locator('#witnessStatus').innerText(),/Full plans differ/);
    await page.locator('#witnessDetails > summary').click();assert.equal(await page.locator('#witnessPlanA tbody tr').count(),14);await noOverflow();
    await page.screenshot({path:path.join(out,'canonical-baseline-mobile-390.png'),fullPage:true});
  });
  await check('no uncaught browser exceptions in the verified journeys',async()=>assert.deepEqual(errors,[]));
}finally{
  const report={base,canonical,canonicalReturn,checkedAt:new Date().toISOString(),agentOperated:true,humanValidation:false,checks:checks.length,attempted:checks.length+failures.length,names:checks,failures,errors,networkFailures};
  await fs.writeFile(path.join(out,'inherited-baseline-browser-report.json'),JSON.stringify(report,null,2));
  await browser.close();console.log(JSON.stringify({checks:checks.length,failures:failures.length,errors:errors.length,out}));
}
if(failures.length)throw Error(`${failures.length} inherited-baseline journey checks failed; inspect the saved report.`);
