import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const browser=await chromium.launch();
try {
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(pathToFileURL(path.resolve(process.argv[2]||'index.html')).href);
 await page.screenshot({path:'testshots/design-title.png'});
 await page.click('#btn-new');await page.click('#pro-skip');await page.click('#btn-start');
 await page.waitForTimeout(3000);
 await page.screenshot({path:'testshots/design-game.png'});
 for(const width of [1440,1024,768,320]) {
  await page.setViewportSize({width,height:900});
  await page.click('#btn-bag');
  await page.waitForTimeout(220);
  assert.equal(await page.evaluate(()=>document.activeElement.id),'panel-close');
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.evaluate(()=>!!document.activeElement.closest('#panel')),true);
  const bounds=await page.locator('#panel').boundingBox();
  assert.ok(bounds.x>=0 && bounds.x+bounds.width<=width,'panel fits viewport');
  await page.screenshot({path:`testshots/design-panel-${width}.png`});
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'btn-bag');
  const hud=await page.locator('#hud-top').boundingBox();
  assert.ok(hud.x>=0 && hud.x+hud.width<=width,'HUD fits viewport');
 }
 await page.setViewportSize({width:1280,height:800});
 for(let i=0;i<5;i++){await page.click('#btn-bag');await page.keyboard.press('Escape');}
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.click('#btn-bag');
 assert.ok(parseFloat(await page.locator('#panel').evaluate(el=>getComputedStyle(el).transitionDuration))<.01);
 await page.keyboard.press('Escape');
 assert.equal(await page.evaluate(()=>MDG.HUD.panelOpen()),false);
 assert.deepEqual(errors,[]);
 console.log('✓ design-ui: 4 viewport sizes, focus return/trap, interrupted toggles, reduced motion, clean console');
} finally {await browser.close();}
