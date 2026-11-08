import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const browser=await chromium.launch();
try {
 const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(pathToFileURL(path.resolve(process.argv[2]||'index.html')).href);
 await page.click('#btn-new');await page.click('#pro-skip');await page.click('#btn-start');
 await page.evaluate(()=>{
  const G=MDG.Main.game.G,p=G.player,e=G.enemies.find(e=>!e.boss);
  G.enemies=[e];e.x=p.x+1;e.y=p.y;e.hp=e.maxHp=30;e.aggro=true;e.skills=[];e.passive=null;
  MDG.Grid.set(G.map,e.x,e.y,MDG.Grid.FLOOR);MDG.UI.updateFov(G);
  document.getElementById('floor-card').classList.add('hidden');
 });
 await page.keyboard.press('Space');
 assert.equal(await page.evaluate(()=>MDG.Main.game.G.enemies[0].attackWarning),true);
 await page.screenshot({path:'testshots/combat-windup.png'});
 await page.waitForFunction(()=>MDG.Engine.counterReady(MDG.Main.game.G,MDG.Main.game.G.enemies[0]),null,{polling:16});
 await page.keyboard.press('j');
 const parry=await page.evaluate(()=>{
  const G=MDG.Main.game.G;return {hp:G.player.hp,motion:MDG.CombatFX.pose(G.enemies[0],performance.now())};
 });
 assert.ok(parry.motion.flash>0,'keyboard parry produces enemy recoil');
 await page.screenshot({path:'testshots/combat-impact.png'});
 await page.waitForTimeout(550);
 assert.equal(await page.evaluate(()=>MDG.CombatFX.pose(MDG.Main.game.G.enemies[0],performance.now()).flash),0);
 // Let a prepared enemy attack land; do not counter it.
 for(let i=0;i<5;i++) {await page.keyboard.press('Space');await page.waitForTimeout(100);}
 assert.ok(await page.evaluate(hp=>MDG.Main.game.G.player.hp<hp,parry.hp),'waiting allows enemy damage');
 // Same-floor restart must repaint every tile, then cache normal frames.
 const repaint=await page.evaluate(()=>{
  const old=MDG.Terrain.drawTile;let count=0;MDG.Terrain.drawTile=(...a)=>{count++;return old(...a);};
  const G=MDG.Engine.newRunState({seed:'cache-regression',runnerId:'yinkesi',diffV:'normal',meta:{}});
  MDG.UI.updateFov(G);MDG.UI.draw(G,performance.now());const first=count;
  MDG.UI.draw(G,performance.now());MDG.Terrain.drawTile=old;
  return {first,total:count,expected:G.map.w*G.map.h};
 });
 assert.equal(repaint.first,repaint.expected);assert.equal(repaint.total,repaint.first);
 assert.deepEqual(errors,[]);
 console.log('✓ combat-ui: keyboard windup/parry/enemy strike, animation expiry, same-floor terrain cache');
} finally {await browser.close();}
