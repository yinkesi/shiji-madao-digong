import { chromium } from "playwright";
import { pathToFileURL } from "url";
import path from "path";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errs = [];
page.on("pageerror", e => errs.push(String(e).slice(0, 250)));
await page.goto(pathToFileURL(path.resolve("index.html")).href);
await page.waitForTimeout(300);
await page.click("#btn-new");
try { await page.waitForSelector("#prologue-screen:not(.hidden)", { timeout: 1200 }); await page.click("#pro-skip"); } catch {}
await page.waitForSelector("#setup-screen:not(.hidden)");
await page.click("#btn-start");
await page.waitForSelector("#game-screen:not(.hidden)");
await page.waitForTimeout(500);

// 1) 纯键盘走格（WASD）
const p0 = await page.evaluate(() => MDG.Main.game.G.player);
await page.keyboard.press("d"); await page.waitForTimeout(150);
let moved = false;
for (const key of ["d","s","a","w"]) {
  await page.keyboard.press(key); await page.waitForTimeout(150);
  const p = await page.evaluate(() => MDG.Main.game.G.player);
  if (p.x !== p0.x || p.y !== p0.y) { moved = true; break; }
}
console.log("1 WASD 走格:", moved ? "OK" : "FAIL");

// 2) J 交互：把玩家放到敌旁按 J 应触发攻击（桩敌）
const jres = await page.evaluate(() => {
  const G = MDG.Main.game.G;
  G.enemies = [];
  G.enemies.push({ uid: "kj", chId: "mob", name: "桩", glyph: "桩", color: "#333", side: "e",
    x: G.player.x + 1, y: G.player.y, hp: 10, maxHp: 10, dmg: 0, saw: 0, moveRange: 1,
    passive: null, skills: [], st: { stun: 0, disarm: 0, poison: 0, shield: 0, emp: 0, grudge: 0, buffKnife: 0 },
    boss: false, elite: false, mob: true, aggro: true, dead: false, lethalUsed: false, firstHitTaken: false });
  const hp0 = G.enemies[0].hp;
  MDG.Input.act({ t: "move", dx: 1, dy: 0 }); // 直接 API 模拟 J（同 doMove 路径）
  return { hit: G.enemies[0].hp < hp0 };
});
console.log("2 J 撞击=攻击:", jres.hit ? "OK" : "FAIL");

// 3) U 血祭（面对面朝敌按 U）
await page.evaluate(() => { MDG.Main.game.G.player.skills[0].cdLeft = 0; });
const hpBefore = await page.evaluate(() => MDG.Main.game.G.player.hp);
await page.keyboard.press("u"); await page.waitForTimeout(200);
const hpAfter = await page.evaluate(() => MDG.Main.game.G.player.hp);
console.log("3 U 血祭:", hpAfter < hpBefore ? "OK（损半血）" : "FAIL hp " + hpBefore + "->" + hpAfter);

// 4) Tab 光标：呼出→移动→确认交互
await page.keyboard.press("Tab"); await page.waitForTimeout(150);
const c1 = await page.evaluate(() => MDG.Input.cursorActive() && MDG.Input.cursorPos());
await page.keyboard.press("ArrowRight"); await page.waitForTimeout(100);
const c2 = await page.evaluate(() => MDG.Input.cursorPos());
await page.keyboard.press("Escape"); await page.waitForTimeout(100);
const c3 = await page.evaluate(() => MDG.Input.cursorActive());
console.log("4 Tab 光标:", (c1 && c2 && (c2[0] !== c1[0] || c2[1] !== c1[1]) && !c3) ? "OK" : "FAIL " + JSON.stringify([c1,c2,c3]));

// 5) 技能栏标注 U/I/O/P
const keys = await page.evaluate(() => [...document.querySelectorAll("#skillbar .skill .key")].map(e => e.textContent));
console.log("5 技能栏键位:", JSON.stringify(keys), keys[0] === "U" ? "OK" : "FAIL");

// 6) 目标提示条存在且有内容
const obj = await page.evaluate(() => ({ vis: !!document.getElementById("objective-bar") && document.getElementById("objective-bar").offsetParent !== null, txt: document.getElementById("obj-text").textContent.slice(0, 20) }));
console.log("6 目标提示条:", obj.vis && obj.txt ? "OK「" + obj.txt + "…」" : "FAIL");

// 7) 面板键盘导航：B 开行囊 → Enter（第一行即饭团）用掉
await page.evaluate(() => { MDG.Main.game.G.player.hp = 10; });
await page.keyboard.press("b"); await page.waitForTimeout(250);
const panelOpen = await page.evaluate(() => !document.getElementById("panel-mask").classList.contains("hidden"));
const sel0 = await page.evaluate(() => { const r = document.querySelector("#panel-body .row"); return r && r.style.borderColor !== ""; });
await page.keyboard.press("Enter"); await page.waitForTimeout(300);
const hpB = await page.evaluate(() => MDG.Main.game.G.player.hp);
const panelStill = await page.evaluate(() => !document.getElementById("panel-mask").classList.contains("hidden"));
if (panelStill) await page.keyboard.press("Escape");
console.log("7 面板键盘:", panelOpen && hpB > 10 ? "OK（Enter 用了饭团 hp=" + hpB + "）" : (panelOpen ? "PARTIAL（面板开但未用，hp=" + hpB + "，首行高亮=" + sel0 + "）" : "FAIL"));

// 8) H 帮助
await page.keyboard.press("h"); await page.waitForTimeout(200);
const helpTxt = await page.evaluate(() => document.getElementById("panel-body").textContent.slice(0, 30));
await page.keyboard.press("Escape");
console.log("8 H 帮助:", helpTxt.includes("目标") ? "OK" : "FAIL「" + helpTxt + "」");

// 8.5) J 纯攻击：面前无目标不移动；有敌才出手
{
  // 朝左走一步（facing=左），面前即刚离开的空地 → J 必须不移动
  const p0 = await page.evaluate(() => { MDG.Main.game.G.enemies = []; return { x: MDG.Main.game.G.player.x, y: MDG.Main.game.G.player.y }; });
  await page.keyboard.press("a"); await page.waitForTimeout(200);
  const p1 = await page.evaluate(() => ({ x: MDG.Main.game.G.player.x, y: MDG.Main.game.G.player.y }));
  await page.keyboard.press("j"); await page.waitForTimeout(200);
  const p2 = await page.evaluate(() => ({ x: MDG.Main.game.G.player.x, y: MDG.Main.game.G.player.y, facing: MDG.Input.facing() }));
  console.log("8a J 空挥不动:", (p2.x === p1.x && p2.y === p1.y && p2.facing[0] === -1) ? "OK" : "FAIL " + JSON.stringify([p1, p2]));
  // 面前放个敌，按 J 应攻击且玩家不动
  const r = await page.evaluate(() => {
    const G = MDG.Main.game.G;
    G.enemies = [];
    const foe = { uid: "kj2", chId: "mob", name: "桩", glyph: "桩", color: "#333", side: "e",
      x: G.player.x - 1, y: G.player.y, hp: 30, maxHp: 30, dmg: 0, saw: 0, moveRange: 1, passive: null, skills: [],
      st: { stun: 0, disarm: 0, poison: 0, shield: 0, emp: 0, grudge: 0, buffKnife: 0 },
      boss: false, elite: false, mob: true, aggro: false, dead: false, lethalUsed: false, firstHitTaken: false,
      telegraph: false, _parried: false, parryCd: 0 };
    G.enemies.push(foe);
    return { hp0: foe.hp, x0: G.player.x, y0: G.player.y, facingLeft: MDG.Input.facing()[0] === -1 };
  });
  await page.keyboard.press("j"); await page.waitForTimeout(250);
  const r2 = await page.evaluate(() => {
    const G = MDG.Main.game.G;
    const foe = G.enemies.find(u => u.uid === "kj2");
    return { dmg: foe ? 30 - foe.hp : 99, px: G.player.x, py: G.player.y };
  });
  console.log("8b J 有敌才打:", (r.facingLeft && r2.dmg >= 2 && r2.px === r.x0 && r2.py === r.y0) ? "OK（伤" + r2.dmg + "，未移动）" : "FAIL " + JSON.stringify([r, r2]));
}

// 8c) toast 去重：连按 J 空挥三次，同文提示只保留一条
{
  await page.keyboard.press("j"); await page.waitForTimeout(80);
  await page.keyboard.press("j"); await page.waitForTimeout(80);
  await page.keyboard.press("j"); await page.waitForTimeout(150);
  const dup = await page.evaluate(() => {
    const texts = [...document.querySelectorAll("#toasts .toast")].map(t => t.dataset.text);
    const same = texts.filter(t => t && t.includes("挥刀落空"));
    return { total: texts.length, sameN: same.length };
  });
  console.log("8c toast 去重:", dup.sameN <= 1 && dup.total <= 3 ? "OK（同文 " + dup.sameN + " 条，总 " + dup.total + " 条）" : "FAIL " + JSON.stringify(dup));
}

// 8d) J 自动转向：面朝右、左侧有敌 → J 打左侧
{
  const r = await page.evaluate(() => {
    const G = MDG.Main.game.G;
    G.enemies = [];
    // 找一块左右都是可走地的位置
    const Gr = MDG.Grid;
    let spot = null;
    for (let y = 1; y < G.map.h - 1 && !spot; y++) for (let x = 1; x < G.map.w - 1 && !spot; x++) {
      if (Gr.at(G.map, x, y) !== Gr.FLOOR || Gr.at(G.map, x - 1, y) !== Gr.FLOOR || Gr.at(G.map, x + 1, y) !== Gr.FLOOR) continue;
      spot = [x, y];
    }
    if (!spot) return { found: false };
    G.player.x = spot[0]; G.player.y = spot[1];
    const foe = { uid: "kb", chId: "mob", name: "左敌", glyph: "左", color: "#333", side: "e",
      x: spot[0] - 1, y: spot[1], hp: 30, maxHp: 30, dmg: 0, saw: 0, moveRange: 1, passive: null, skills: [],
      st: { stun: 0, disarm: 0, poison: 0, shield: 0, emp: 0, grudge: 0, buffKnife: 0 },
      boss: false, elite: false, mob: true, aggro: false, dead: false, lethalUsed: false, firstHitTaken: false,
      telegraph: false, _parried: false, parryCd: 0 };
    G.enemies.push(foe);
    MDG.Input.__faceRight = null;
    return { found: true, hp0: foe.hp, facing: MDG.Input.facing() };
  });
  // 面朝右：先按 d 朝右走一格（走到空地，facing=右），再回来？——简化：直接清 enemies 后把玩家放好，facing 无法直接设——用一次向右移动设朝向
  // 上一步 evaluate 已把玩家放在左右皆空地：按 d（向右走，facing=右），敌在左侧新位置补放
  const r2 = await page.evaluate(() => {
    const G = MDG.Main.game.G;
    const foe = { uid: "kb2", chId: "mob", name: "左敌", glyph: "左", color: "#333", side: "e",
      x: G.player.x - 1, y: G.player.y, hp: 30, maxHp: 30, dmg: 0, saw: 0, moveRange: 1, passive: null, skills: [],
      st: { stun: 0, disarm: 0, poison: 0, shield: 0, emp: 0, grudge: 0, buffKnife: 0 },
      boss: false, elite: false, mob: true, aggro: false, dead: false, lethalUsed: false, firstHitTaken: false,
      telegraph: false, _parried: false, parryCd: 0 };
    G.enemies.push(foe);
    return { hp0: foe.hp };
  });
  await page.keyboard.press("d"); await page.waitForTimeout(220); // 面朝右走一步
  await page.evaluate(() => {
    const G = MDG.Main.game.G;
    const foe = { uid: "kb3", chId: "mob", name: "左敌", glyph: "左", color: "#333", side: "e",
      x: G.player.x - 1, y: G.player.y, hp: 30, maxHp: 30, dmg: 0, saw: 0, moveRange: 1, passive: null, skills: [],
      st: { stun: 0, disarm: 0, poison: 0, shield: 0, emp: 0, grudge: 0, buffKnife: 0 },
      boss: false, elite: false, mob: true, aggro: false, dead: false, lethalUsed: false, firstHitTaken: false,
      telegraph: false, _parried: false, parryCd: 0 };
    G.enemies.push(foe);
  });
  const before = await page.evaluate(() => ({ facing: MDG.Input.facing() }));
  await page.keyboard.press("j"); await page.waitForTimeout(250);
  const r3 = await page.evaluate(() => {
    const G = MDG.Main.game.G;
    const foe = G.enemies.find(u => u.uid === "kb3");
    const foe2 = G.enemies.find(u => u.uid === "kb2");
    return { dmg3: foe ? 30 - foe.hp : -1, dmg2: foe2 ? 30 - foe2.hp : -1, facing: MDG.Input.facing() };
  });
  console.log("8d J 自动转向:", (before.facing[0] === 1 && r3.dmg3 >= 2 && r3.facing[0] === -1) ? "OK（面朝右，转身打了左侧敌 " + r3.dmg3 + " 伤）" : "FAIL " + JSON.stringify([before, r3]));
}

// 9) 全程无页面错误
console.log("9 页面错误:", errs.length ? "FAIL " + errs.join(" | ") : "OK（无）");
await page.screenshot({ path: "testshots/keys-final.png" });
await browser.close();
