import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(pathToFileURL(path.resolve(process.argv[2] || 'index.html')).href);
  await page.click('#btn-new');
  await page.click('#pro-skip');
  await page.click('#btn-start');
  await page.evaluate(() => {
    const G = MDG.Main.game.G, Gr = MDG.Grid;
    const template = G.enemies.find(e => e.mob);
    G.map = Gr.makeMap(9, 7);
    for (let y=1;y<6;y++) for(let x=1;x<8;x++) Gr.set(G.map,x,y,Gr.FLOOR);
    G.map.stairs=[7,5]; G.map.spawn=[4,3];
    G.player.x=4; G.player.y=3; G.player.attackCd=1;
    G.enemies=[1,-1].map((dx,i)=>({ ...JSON.parse(JSON.stringify(template)), uid:'ui-'+i,
      x:4+dx,y:3,hp:30,maxHp:30,saw:0,aggro:true,atkWind:1,attackWarning:true,
      telegraph:i===1,parryCd:0,windupAt:(G.combatTime||0)-620 }));
    MDG.Engine.setTeleChance(0);
    MDG.UI.updateFov(G);
  });
  await page.keyboard.press('j');
  const first = await page.evaluate(() => {
    const G=MDG.Main.game.G;
    return {parried:G.ev.some(e=>e.t==='parry'&&e.x===3),left:G.enemies[1].hp,right:G.enemies[0].hp,cd:G.player.attackCd};
  });
  assert.ok(first.parried && first.left<30 && first.right===30 && first.cd>0, 'J 优先迎击身后红框，冷却不拦截');
  await page.evaluate(() => {
    const G=MDG.Main.game.G;
    G.enemies=G.enemies.slice(0,1);
    const e=G.enemies[0]; e.atkWind=0;e.attackWarning=false;e.telegraph=false;e.attackCd=0;
  });
  await page.keyboard.press('Space');
  const before = await page.evaluate(() => MDG.Main.game.G.round);
  await page.waitForTimeout(350);
  assert.equal(await page.evaluate(() => MDG.Main.game.G.round), before, '预警保留蓄力反应时间');
  await page.waitForTimeout(650);
  assert.ok(await page.evaluate(() => MDG.Main.game.G.round)>before, '预警不会永久冻结世界');
  assert.deepEqual(errors,[]);
  console.log('✓ tactics-ui: timing窗口优先、冷却迎击、短预警、自动推进、页面无错误');
} finally { await browser.close(); }
