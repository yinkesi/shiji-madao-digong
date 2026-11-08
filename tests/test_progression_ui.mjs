import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const browser=await chromium.launch();
try {
  const page=await browser.newPage({viewport:{width:1280,height:800}});
  const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(pathToFileURL(path.resolve(process.argv[2]||'index.html')).href);
  await page.click('#btn-new');await page.click('#pro-skip');await page.click('#btn-start');
  await page.evaluate(()=>{
    const G=MDG.Main.game.G, p=G.player, boss=G.enemies.find(e=>e.boss);
    G.enemies=[boss];boss.x=p.x+1;boss.y=p.y;boss.hp=1;
    MDG.Grid.set(G.map,boss.x,boss.y,MDG.Grid.FLOOR);
    MDG.UI.updateFov(G);
  });
  await page.keyboard.press('d');
  await page.waitForSelector('#panel-mask:not(.hidden)');
  assert.match(await page.textContent('#panel-title'),/刀卡择一/);
  assert.equal(await page.locator('#panel-body button').count(),3);
  const before=await page.evaluate(()=>({round:MDG.Main.game.G.round,choices:MDG.Main.game.G.relicChoices}));
  await page.waitForTimeout(1200);
  assert.equal(await page.evaluate(()=>MDG.Main.game.G.round),before.round,'选择期间世界暂停');
  await page.screenshot({path:'testshots/relic-choice.png'});
  await page.keyboard.press('Escape');
  await page.keyboard.press('b');
  await page.getByRole('button',{name:'领取刀卡',exact:true}).click();
  assert.equal(await page.locator('#panel-body button').count(),3,'行囊可重新领取');
  await page.reload();await page.click('#btn-resume');
  await page.waitForSelector('#panel-mask:not(.hidden)');
  assert.deepEqual(await page.evaluate(()=>MDG.Main.game.G.relicChoices),before.choices,'读档不换候选');
  await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');
  const selected=await page.evaluate(()=>({round:MDG.Main.game.G.round,relics:MDG.Main.game.G.relics,pending:MDG.Main.game.G.relicDrafts}));
  assert.equal(selected.round,before.round,'领取不耗回合');
  assert.deepEqual(selected.relics,[before.choices[1]],'键盘选择第二张');
  assert.equal(selected.pending,0);
  await page.evaluate(()=>{
    const G=MDG.Main.game.G,p=G.player,Gr=MDG.Grid;
    Gr.set(G.map,p.x+2,p.y,Gr.TRAP);
    G.map.trapKinds={...G.map.trapKinds,[p.x+2+','+p.y]:'poison'};
    G.explored[p.x+2+','+p.y]=1;
  });
  await page.keyboard.press('Tab');
  assert.match(await page.textContent('#obj-text'),/毒沼.*中毒3/,'Tab 查看陷阱具体规则');
  await page.waitForTimeout(1100);
  assert.equal(await page.evaluate(()=>MDG.Main.game.G.round),before.round,'查看时不自动推进');
  await page.keyboard.press('Tab');
  const point=await page.evaluate(()=>{
    const G=MDG.Main.game.G,c=MDG.UI.getCam(),T=MDG.UI.TILE,cv=document.getElementById('cv');
    return {x:cv.clientWidth/2-c.x+(G.player.x+2.5)*T,y:cv.clientHeight/2-c.y+(G.player.y+.5)*T};
  });
  await page.mouse.click(point.x,point.y);
  assert.match(await page.textContent('#toasts'),/安全路线/,'自动行走拒绝危险目标');
  assert.deepEqual(errors,[]);
  console.log('✓ progression-ui: 镇守三选一、暂停、行囊领取、读档、键盘选择、查陷阱、安全点击全部通过');
} finally {await browser.close();}
