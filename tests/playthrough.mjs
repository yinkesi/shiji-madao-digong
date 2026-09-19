/* 全流程实玩：浏览器 UI 通道从入宫打到收卷（含尾声漫画与结算）。
 * 用法：NODE_PATH=<全局 node_modules> node tests/playthrough.mjs
 * 策略：弹反优先/血祭纪律/灶间歇息/绕陷阱/商店补给/残血拉扯。 */
import { chromium } from "playwright";
import { fileURLToPath, pathToFileURL } from "url";
import path from "path";
import fs from "fs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const url = pathToFileURL(path.join(HERE, "..", "index.html")).href;
fs.mkdirSync(path.join(HERE, "..", "testshots"), { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("pageerror", e => errors.push(String(e).slice(0, 200)));
page.on("console", m => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });

await page.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });
await page.goto(url);
await page.waitForTimeout(400);

/* 入宫（首次带序章） */
await page.click("#btn-new");
try { await page.waitForSelector("#prologue-screen:not(.hidden)", { timeout: 1500 }); await page.click("#pro-skip"); } catch (e) {}
await page.waitForSelector("#setup-screen:not(.hidden)");
await page.evaluate(() => {
  const forced = new URLSearchParams(location.search).get("seed");
  if (forced) { const orig = MDG.Run.newRun.bind(MDG.Run); MDG.Run.newRun = (o) => orig(Object.assign({ seed: forced }, o)); }
});
await page.click("#btn-start");
await page.waitForSelector("#game-screen:not(.hidden)");
await page.waitForTimeout(500);

/* 注入分片游玩策略（一次定义，反复调用） */
await page.evaluate(() => {
  const MD = window.MDG;
  const manh = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  window.__living = (G) => MD.Engine.livingEnemies(G).filter(u => u.chId !== "tree");
  window.__walkTo = (G, tx, ty) => {
    const p = G.player;
    let s = MD.Grid.stepToward(G.map, p.x, p.y, tx, ty, (x, y) =>
      (!!MD.Engine.unitAt(G, x, y) && !(x === tx && y === ty)) ||
      [MD.Grid.CHEST, MD.Grid.SHOP, MD.Grid.TRAP].includes(MD.Grid.at(G.map, x, y)));
    if (!s) s = MD.Grid.stepToward(G.map, p.x, p.y, tx, ty, (x, y) => !!MD.Engine.unitAt(G, x, y)); // 无路可绕则硬走（宁可踩陷阱）
    if (!s) s = MD.Grid.stepToward(G.map, p.x, p.y, tx, ty, null); // 最后兜底：撞开挡路者（攻击/开箱）
    if (s) { MD.Input.act({ t: "move", dx: s[0] - p.x, dy: s[1] - p.y }); return true; }
    MD.Input.act({ t: "wait", auto: true });
    return false;
  };
  window.__chunk = function () {
    const notes = [];
    let turns = 0;
    let stuckN = 0, stuckPos = null, stuckInfo = null;
    const trace = [];
    const rolling = [];
    let diag = null;
    while (turns < 300) {
      const G = MD.Main.game.G;
      if (!G || G.over || MD.Main.game.overShown) break;
      const p = G.player;
      const skey = p.x + "," + p.y;
      if (skey === stuckPos) {
        stuckN++;
        if (stuckN === 60 && !stuckInfo) {
          const Gr = MD.Grid;
          stuckInfo = {
            pos: skey, hp: p.hp, emp: p.st.emp, disarm: p.st.disarm, camp: G.campUsed,
            adj: MD.Grid.DIRS.map(([dx, dy]) => ({ d: dx + "," + dy, t: Gr.at(G.map, p.x + dx, p.y + dy), u: !!MD.Engine.unitAt(G, p.x + dx, p.y + dy) })),
            enemies: MD.Engine.livingEnemies(G).filter(u => u.chId !== "tree").map(u => ({ n: u.name, a: u.aggro, d: manh(u, p), t: Gr.at(G.map, u.x, u.y) })).slice(0, 8)
          };
        }
        if (stuckN > 60) {
          const opts = MD.Grid.DIRS.filter(([dx, dy]) => {
            const nx = p.x + dx, ny = p.y + dy;
            if (!MD.Grid.inB(G.map, nx, ny)) return false;
            const tt = MD.Grid.at(G.map, nx, ny);
            if (tt === MD.Grid.WALL || tt === MD.Grid.TREE) return false;
            const u = MD.Engine.unitAt(G, nx, ny);
            if (u) return u.side === "e";
            return true;
          });
          if (opts.length) { const [dx, dy] = opts[turns % opts.length]; MD.Input.act({ t: "move", dx, dy }); turns++; continue; }
        }
      } else { stuckN = 0; stuckPos = skey; }
      if (turns === 160) diag = {
        enemies: MD.Engine.livingEnemies(G).filter(u => u.chId !== "tree").map(u => ({ n: u.name, a: u.aggro, d: manh(u, p), p: u.x + "," + u.y, t: MD.Grid.at(G.map, u.x, u.y), saw: u.saw, dead: u.dead })),
        camp: G.campUsed, money: G.money, food: G.items.filter(i => i.id === "fantuan" || i.id === "mantou").length,
        shop: (() => { let s = null; for (let y = 0; y < G.map.h && !s; y++) for (let x = 0; x < G.map.w && !s; x++) if (MD.Grid.at(G.map, x, y) === MD.Grid.SHOP) s = x + "," + y; return s; })(),
        stairsOpen: MD.Engine.stairsOpenNow(G)
      };
      turns++;
      const foes = window.__living(G);
      const hunters = foes.filter(u => u.aggro).sort((a, b) => manh(a, p) - manh(b, p));
      const foodN = () => G.items.filter(i => i.id === "fantuan" || i.id === "mantou").reduce((a, b) => a + b.n, 0);
      if (turns % 25 === 0) trace.push("t" + turns + " hp" + p.hp + " 敌" + foes.length + "(追" + hunters.length + ") 食" + foodN() + " 灶" + G.campUsed + " 钱" + G.money + " emp" + p.st.emp);
      for (const e of G.ev) if (e.t === "log") rolling.push(e.text);
      /* 面板（商店）处理：买馒头到 3 个 */
      if (MD.HUD.panelOpen()) {
        const row = [...document.querySelectorAll("#panel-body .row")].find(r => r.textContent.includes("馒头") || r.textContent.includes("鸡腿"));
        const btn = row && row.querySelector("button");
        if (btn && !btn.disabled && foodN() < 3 && G.money >= 12) { btn.click(); continue; }
        MD.HUD.closePanel(); continue;
      }
      /* 0. 梯开且清场 → 视血量决定下行（残血先歇灶/吃，绝不硬下） */
      if (MD.Engine.stairsOpenNow(G) && foes.length === 0) {
        const st = G.map.stairs;
        const cf0 = (() => { for (let y = 0; y < G.map.h; y++) for (let x = 0; x < G.map.w; x++) if (MD.Grid.at(G.map, x, y) === MD.Grid.CAMPFIRE && !G.campUsed) return [x, y]; return null; })();
        if (p.hp < p.maxHp * 0.55 && cf0) { /* 落到灶间分支歇满再下 */ }
        else if (p.hp < p.maxHp * 0.55 && foodN() > 0) { const ii = G.items.findIndex(i => i.id === "fantuan" || i.id === "mantou"); MD.Input.act({ t: "item", ii }); continue; }
        else {
          if (manh(st, p) === 1) { MD.Input.act({ t: "move", dx: st[0] - p.x, dy: st[1] - p.y }); continue; }
          window.__walkTo(G, st[0], st[1]); continue;
        }
      }
      /* 1. 重伤先吃 */
      if (p.hp <= p.maxHp * 0.62 && foodN() > 0) {
        const ii = G.items.findIndex(i => i.id === "fantuan" || i.id === "mantou");
        if (ii >= 0) { MD.Input.act({ t: "item", ii }); continue; }
      }
      const teleAdj = foes.find(u => u.telegraph && manh(u, p) === 1);
      const bigNear = foes.find(u => !u.mob && manh(u, p) <= 6);
      /* 2. 黑棒 buffs */
      const hi = G.items.findIndex(i => i.id === "heibang");
      if (hi >= 0 && p.st.buffKnife === 0 && bigNear && manh(bigNear, p) <= 4) { MD.Input.act({ t: "item", ii: hi }); continue; }
      /* 3. 血祭（对大人物/亮刀邻敌；以道代血则更随意） */
      const wantBlood = p.st.emp === 0 && p.skills[0].cdLeft === 0 && (bigNear || teleAdj) &&
        (G.relics.includes("bloodfree") || p.hp >= p.maxHp * 0.62);
      if (wantBlood && (teleAdj || (bigNear && manh(bigNear, p) <= 4))) { MD.Input.act({ t: "skill", si: 0 }); continue; }
      /* 4. 贴身：优先弹反，否则打最薄；被两名【追兵】围且非弹反窗口 → 先拉开（分其阵）
            （睡眠者不是威胁——只数 aggro，否则会对无害的路人无限乒乓） */
      const adjFoes = foes.filter(u => manh(u, p) === 1);
      const adjHunters = adjFoes.filter(u => u.aggro);
      if (adjFoes.length) {
        const tgt = teleAdj || adjFoes.sort((a, b) => a.hp - b.hp)[0];
        /* 弹反节奏：对镇守无红框时不满 65% 血 → 脱离等窗口（硬换血必输） */
        const effDmg = tgt.dmg * ((tgt.passive && tgt.passive.knifeMul) || 1);
        if (!teleAdj && tgt.boss && effDmg >= 4 && p.hp <= p.maxHp * 0.65) {
          let best = null, bs = -1e9;
          for (const [dx, dy] of MD.Grid.DIRS) {
            const nx = p.x + dx, ny = p.y + dy;
            if (!MD.Grid.inB(G.map, nx, ny) || !MD.Grid.walkable(G.map, nx, ny) || MD.Engine.unitAt(G, nx, ny)) continue;
            const tv = MD.Grid.at(G.map, nx, ny);
            if ([MD.Grid.CHEST, MD.Grid.SHOP, MD.Grid.TRAP].includes(tv)) continue;
            let sc = manh(tgt, { x: nx, y: ny }) * 10;
            if (!MD.Grid.los(G.map, tgt.x, tgt.y, nx, ny)) sc += 40;
            if (sc > bs) { bs = sc; best = [dx, dy]; }
          }
          if (best) { MD.Input.act({ t: "move", dx: best[0], dy: best[1] }); continue; }
        }
        if (!teleAdj && adjHunters.length >= 2 && p.hp <= p.maxHp * 0.72) {
          let best = null, bs = -1e9;
          for (const [dx, dy] of MD.Grid.DIRS) {
            const nx = p.x + dx, ny = p.y + dy;
            if (!MD.Grid.inB(G.map, nx, ny) || !MD.Grid.walkable(G.map, nx, ny) || MD.Engine.unitAt(G, nx, ny)) continue;
            const tv = MD.Grid.at(G.map, nx, ny);
            if ([MD.Grid.CHEST, MD.Grid.SHOP, MD.Grid.TRAP].includes(tv)) continue;
            const sc = adjFoes.filter(u => Math.abs(u.x - nx) + Math.abs(u.y - ny) === 1).length;
            if (-sc > bs) { bs = -sc; best = [dx, dy]; }
          }
          if (best !== null && bs < 0) { MD.Input.act({ t: "move", dx: best[0], dy: best[1] }); continue; }
        }
        MD.Input.act({ t: "move", dx: tgt.x - p.x, dy: tgt.y - p.y });
        continue;
      }
      /* 5. 技能轰炸 */
      let casted = false;
      for (let si = 1; si < p.skills.length && !casted; si++) {
        const sk = p.skills[si];
        if (sk.cdLeft > 0) continue;
        if (sk.kind === "unit" && sk.range) {
          const tgt = foes.filter(u => manh(u, p) <= sk.range).sort((a, b) => a.hp - b.hp)[0];
          if (tgt) { MD.Input.act({ t: "skill", si, tx: tgt.x, ty: tgt.y }); casted = true; }
        } else if (sk.kind === "burst") {
          if (foes.some(u => manh(u, p) <= sk.range)) { MD.Input.act({ t: "skill", si }); casted = true; }
        } else if (sk.kind === "global") {
          if (foes.length >= 2 || foes.some(u => !u.mob)) { MD.Input.act({ t: "skill", si }); casted = true; }
        } else if (sk.kind === "self") {
          if (p.hp < p.maxHp * 0.72) { MD.Input.act({ t: "skill", si }); casted = true; }
        }
      }
      if (casted) continue;
      /* 6. 灶间：受伤就风筝回家（引敌长途跋涉，甩不掉就路上解决） */
      let cf = null;
      for (let y = 0; y < G.map.h && !cf; y++) for (let x = 0; x < G.map.w && !cf; x++)
        if (MD.Grid.at(G.map, x, y) === MD.Grid.CAMPFIRE && !G.campUsed) cf = [x, y];
      const onlyBossLeft = foes.length > 0 && foes.every(u => u.boss);
      if (cf && (onlyBossLeft ? p.hp < p.maxHp * 0.97 : p.hp < p.maxHp * 0.45) && (!hunters.length || hunters.every(h => manh(h, p) >= 6))) {
        if (manh(cf, p) === 1) { MD.Input.act({ t: "move", dx: cf[0] - p.x, dy: cf[1] - p.y }); continue; }
        window.__walkTo(G, cf[0], cf[1]); continue;
      }
      /* 7. 残血拉扯 */
      if (p.hp <= p.maxHp * 0.35 && hunters.length && manh(hunters[0], p) <= 5) {
        let best = null, bs = -1e9;
        for (const [dx, dy] of MD.Grid.DIRS) {
          const nx = p.x + dx, ny = p.y + dy;
          if (!MD.Grid.inB(G.map, nx, ny) || !MD.Grid.walkable(G.map, nx, ny) || MD.Engine.unitAt(G, nx, ny)) continue;
          const tv = MD.Grid.at(G.map, nx, ny);
          if ([MD.Grid.CHEST, MD.Grid.SHOP, MD.Grid.TRAP].includes(tv)) continue;
          const ref = hunters[0] || adjHunters[0] || tgt;
          let sc = Math.min(...foes.map(u => manh(u, { x: nx, y: ny }))) * 10;
          if (ref && !MD.Grid.los(G.map, ref.x, ref.y, nx, ny)) sc += 40; /* 断视线→甩尾 */
          if (G.floorDef.rule === "cans" && foes.some(u => u.x === nx || u.y === ny)) sc -= 15;
          if (sc > bs) { bs = sc; best = [dx, dy]; }
        }
        if (best) { MD.Input.act({ t: "move", dx: best[0], dy: best[1] }); continue; }
        MD.Input.act({ t: "wait" }); continue;
      }
      /* 8. 缺粮且有钱 → 找小卖部 */
      const shopPos = (() => { let s = null; for (let y = 0; y < G.map.h && !s; y++) for (let x = 0; x < G.map.w && !s; x++) if (MD.Grid.at(G.map, x, y) === MD.Grid.SHOP) s = [x, y]; return s; })();
      if (shopPos && foodN() === 0 && G.money >= 12 && !hunters.length && manh(shopPos, p) <= 9) {
        if (manh(shopPos, p) === 1) { MD.Input.act({ t: "move", dx: shopPos[0] - p.x, dy: shopPos[1] - p.y }); continue; }
        window.__walkTo(G, shopPos[0], shopPos[1]); continue;
      }
      /* 9. 顺手开箱（≤6，无追兵） */
      let ch = null, chD = 99;
      for (let y = 0; y < G.map.h && !ch; y++) for (let x = 0; x < G.map.w; x++) {
        if (MD.Grid.at(G.map, x, y) === MD.Grid.CHEST) {
          const d = manh({ x, y }, p);
          if (d <= 6 && d < chD) { ch = [x, y]; chD = d; }
        }
      }
      if (ch && !hunters.length) {
        if (chD === 1) { MD.Input.act({ t: "move", dx: ch[0] - p.x, dy: ch[1] - p.y }); continue; }
        window.__walkTo(G, ch[0], ch[1]); continue;
      }
      /* 10. 目标：镇守永远最后打；打镇守前残血先回灶间（风筝） */
      const nonBoss = foes.filter(u => !u.boss);
      const bosses = foes.filter(u => u.boss);
      if (bosses.length) {
        let cf2 = null;
        for (let y = 0; y < G.map.h && !cf2; y++) for (let x = 0; x < G.map.w && !cf2; x++)
          if (MD.Grid.at(G.map, x, y) === MD.Grid.CAMPFIRE && !G.campUsed) cf2 = [x, y];
        if (cf2 && p.hp < p.maxHp * (nonBoss.length ? 0.6 : 0.97)) {
          if (manh(cf2, p) === 1) { MD.Input.act({ t: "move", dx: cf2[0] - p.x, dy: cf2[1] - p.y }); continue; }
          window.__walkTo(G, cf2[0], cf2[1]); continue;
        }
      }
      let tgt;
      if (nonBoss.length) {
        const hunt = nonBoss.filter(u => u.aggro).sort((a, b) => manh(a, p) - manh(b, p));
        const sleep = nonBoss.filter(u => !u.aggro).sort((a, b) => manh(a, p) - manh(b, p));
        tgt = (p.hp <= p.maxHp * 0.7 && sleep.length) ? sleep[0] : (hunt[0] || sleep[0] || nonBoss[0]);
      } else {
        tgt = bosses.sort((a, b) => manh(a, p) - manh(b, p))[0];
      }
      if (!tgt) { MD.Input.act({ t: "wait", auto: true }); continue; }
      window.__walkTo(G, tgt.x, tgt.y);
    }
    const G = MD.Main.game.G;
    return {
      turns, rounds: G ? G.round : 0, pos: G ? G.player.x + "," + G.player.y : "?", floorIdx: G ? G.floorIdx : -1, hp: G ? G.player.hp : 0, maxHp: G ? G.player.maxHp : 0,
      money: G ? G.money : 0, kills: G ? G.kills : 0, food: G ? G.items.filter(i => i.id === "fantuan" || i.id === "mantou").reduce((a, b) => a + b.n, 0) : 0,
      learned: G ? Object.keys(G.learned).length : 0, relics: G ? G.relics.join(",") : "",
      over: MD.Main.game.overShown, won: G ? G.won : false,
      enemies: G ? window.__living(G).length : 0,
      stuck: stuckInfo, trace,
      rolling: rolling.slice(-14),
      alive: G ? MD.Engine.livingEnemies(G).filter(u => u.chId !== "tree").map(u => u.name + "(" + u.hp + "/" + u.maxHp + (u.aggro ? ",追" : "") + ")") : [], diag,
      logs: G ? (G.ev || []).filter(e => e.t === "log").slice(-8).map(e => e.text) : []
    };
  };
});

/* 分片推进 */
let floorSeen = 0;
for (let c = 0; c < 80; c++) {
  const st = await page.evaluate(() => window.__chunk());
  console.log(`  [chunk ${c}] 层${st.floorIdx + 1} 轮~${st.rounds || "?"} 血${st.hp} 斩${st.kills} 敌${st.enemies} 位${st.pos}` + (st.stuck ? " STUCK:" + JSON.stringify(st.stuck).slice(0, 600) : ""));
  if (c <= 2 && st.trace) st.trace.forEach(l => console.log("    T " + l));
  if (c === 10) { console.log("    D " + JSON.stringify(st.diag)); if (st.trace) st.trace.forEach(l => console.log("    T " + l)); }
  if (st.floorIdx > floorSeen) {
    floorSeen = st.floorIdx;
    await page.screenshot({ path: path.join(HERE, "..", "testshots", `flow-floor${st.floorIdx + 1}.png`) });
    console.log(`  ▼ 第${st.floorIdx + 1}层 血${st.hp}/${st.maxHp} 钱${st.money} 斩${st.kills} 录技${st.learned} 卡[${st.relics}]`);
  }
  if (st.over) {
    console.log(`  ■ 终局：${st.won ? "收卷！" : "折于第" + (st.floorIdx + 1) + "层"} 斩${st.kills} 录技${st.learned} 卡[${st.relics}]`);
    (st.alive || []).forEach(a => console.log("    存活: " + a));
    (st.rolling || []).forEach(l => console.log("    · " + l));
    break;
  }
}

/* 终局验收 */
await page.waitForTimeout(1600); // 等 finishRun 与尾声
const epilogue = await page.evaluate(() => !document.getElementById("prologue-screen").classList.contains("hidden"));
console.log("尾声漫画:", epilogue ? "OK" : "未出现");
await page.screenshot({ path: path.join(HERE, "..", "testshots", "flow-epilogue.png") });
if (epilogue) await page.click("#pro-skip");
await page.waitForTimeout(400);
const endVisible = await page.evaluate(() => !document.getElementById("end-screen").classList.contains("hidden"));
console.log("结算屏:", endVisible ? "OK" : "FAIL");
await page.screenshot({ path: path.join(HERE, "..", "testshots", "flow-end.png") });
const meta = await page.evaluate(() => JSON.parse(localStorage.getItem("shiji_digong_v1") || "{}"));
console.log("文脉:", meta.wemai, "· 名册:", (meta.runners || []).length, "人 · 收卷:", meta.stats && meta.stats.wins, "· 成就:", Object.keys(meta.achieves || {}).length);
await page.click("#end-box .s-btns .t-btn:last-child"); // 回题名
await page.waitForTimeout(400);
const titleOk = await page.evaluate(() => !document.getElementById("title-screen").classList.contains("hidden"));
console.log("回题名:", titleOk ? "OK" : "FAIL");
console.log("页面错误:", errors.length ? errors.join(" | ") : "无");
await browser.close();
