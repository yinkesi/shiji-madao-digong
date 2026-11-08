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
 async function setup(){await page.evaluate(()=>{
  const G=MDG.Main.game.G,p=G.player,e=G.enemies.find(e=>e.chId==='mob');
  G.enemies=[e];e.x=p.x+1;e.y=p.y;e.hp=e.maxHp=40;e.aggro=true;e.skills=[];e.passive=null;
  e.attackCd=0;e.atkWind=0;e.telegraph=false;e.attackWarning=false;e.parryCd=0;e._parried=false;
  p.hp=20;p.attackCd=0;
  MDG.Grid.set(G.map,e.x,e.y,MDG.Grid.FLOOR);MDG.UI.updateFov(G);
 });await page.keyboard.press('Space');}
 await setup();await page.keyboard.press('j');
 assert.deepEqual(await page.evaluate(()=>({parry:MDG.Main.game.G.ev.some(e=>e.t==='parry'),hp:MDG.Main.game.G.player.hp})),{parry:false,hp:18},'early attack trades damage instead of parry');
 await setup();await page.keyboard.press('b');await page.waitForTimeout(80);
 const frozen=await page.evaluate(()=>MDG.Main.game.G.combatTime);
 await page.waitForTimeout(1000);
 assert.equal(await page.evaluate(()=>MDG.Main.game.G.combatTime),frozen,'menu freezes timing');
 await page.keyboard.press('Escape');
 await page.waitForFunction(()=>MDG.Engine.counterReady(MDG.Main.game.G,MDG.Main.game.G.enemies[0]),null,{polling:10});
 await page.keyboard.press('j');
 assert.equal(await page.evaluate(()=>MDG.Main.game.G.ev.some(e=>e.t==='parry')),true,'window survives pause/resume');
 await setup();
 for(let i=0;i<10;i++){await page.keyboard.press('z');await page.waitForTimeout(100);}
 assert.ok(await page.evaluate(()=>MDG.Main.game.G.player.hp<20),'irrelevant keys cannot delay the enemy indefinitely');
 await page.screenshot({path:'testshots/pressure-combat.png'});
 assert.deepEqual(errors,[]);
 console.log('✓ pressure-ui: early failure, timed success after pause, invalid-key exploit blocked');
} finally {await browser.close();}
