// Complete practice with actual Tab/Enter input, including when the API is offline.
import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import {loadTool} from './toolchain.mjs';
import {serveExport} from './static-server.mjs';
const module=await loadTool('playwright'),{chromium}=module.default??module;
const server=await serveExport(),browser=await chromium.launch({headless:true});
const report={at:new Date().toISOString(),input:'Tab and Enter only',network:'API requests deliberately aborted',keyPresses:0};
try {
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 await context.route('https://api.squeekchain.com/**',r=>r.abort('failed'));
 const page=await context.newPage();await page.goto(server.url);
 async function activate(label,aria=false){
   for(let i=0;i<150;i++){
     const active=await page.evaluate(({label,aria})=>{
       const el=document.activeElement;
       return el instanceof HTMLButtonElement&&!el.disabled&&(aria?el.getAttribute('aria-label'):el.textContent.replace(/\s+/g,' ').trim())===label;
     },{label,aria});
     if(active){await page.keyboard.press('Enter');report.keyPresses++;return;}
     await page.keyboard.press('Tab');report.keyPresses++;
   }
   throw new Error(`Keyboard could not reach ${label}`);
 }
 await activate('Play practice');
 for(let turn=1;turn<=6;turn++){
   await page.waitForFunction(()=>document.querySelector('.end-turn')&&!document.querySelector('.end-turn').disabled);
   for(const room of ['heat','water','repair'])await activate('Increase '+room,true);
   await activate('End turn '+turn);
 }
 await page.locator('.result.won').waitFor();
 const save=await page.evaluate(()=>JSON.parse(localStorage.getItem('burrow-power:save:v1')));
 assert.equal(save.runs.practice.completed,6);assert.equal(save.profiles.practice.wins,1);
 report.result='passed';report.completedTurns=6;report.focusedResult=await page.evaluate(()=>document.activeElement?.id==='result-heading');
 await mkdir('test/scratch/keyboard-check',{recursive:true});
 await page.screenshot({path:'test/scratch/keyboard-check/result.png',fullPage:true});
 console.log(JSON.stringify(report));await context.close();
}catch(e){report.result='failed';report.error=e.message;console.error(e.message);process.exitCode=1;}
finally{await writeFile('artifacts/keyboard-results.json',JSON.stringify(report,null,2)+'\n');await browser.close();await server.close();}
