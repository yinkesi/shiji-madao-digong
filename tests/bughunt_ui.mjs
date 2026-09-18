/* bug 猎手 · 三：UI 实玩扫查（Playwright）
 * 真人式操作：面板、热键、续行、焚稿、静音——抓页面错误与逻辑漏洞。 */
import { chromium } from "playwright";
import { fileURLToPath, pathToFileURL } from "url";
import path from "path";
import fs from "fs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const url = pathToFileURL(path.join(HERE, "..", "index.html")).href;
fs.mkdirSync(path.join(HERE, "..", "testshots"), { recursive: true });

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("  ✗ [确凿] " + m); } else { pass--; fail++; console.log("  ✓ [无恙] " + m); } };
// 这里 ok(c=true)=发现bug。为省事：c 为真表示「bug 存在」。

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("pageerror", e => errors.push("PAGEERROR: " + String(e).slice(0, 200)));
page.on("console", m => { if (m.type() === "error") errors.push("CONSOLE: " + m.text().slice(0, 200)); });

/* 预置 50 文脉，验证标题页修炼购买 */
await page.addInitScript(() => {
  localStorage.setItem("shiji_digong_v1", JSON.stringify({ v: 1, wemai: 50, tree: {}, runners: ["yinkesi"], dex: {}, scrolls: 0, achieves: {}, stats: { runs: 0, wins: 0, bestFloor: 0 }, settings: { muted: false, diffV: "normal", runner: "yinkesi" } }));
});
await page.goto(url);
await page.waitForTimeout(400);

/* U-1 标题页修炼购买是否崩（applyMetaBonuses 在 G=null 时） */
await page.click("#btn-cult");
await page.waitForTimeout(200);
const buyBtns = await page.locator("#panel-body .pbtn").all();
const errBefore = errors.length;
if (buyBtns.length) {
  await buyBtns[0].click(); // 买第一个可购节点
  await page.waitForTimeout(250);
}
const crashed = errors.length > errBefore;
ok(crashed, "U-1 标题页修炼购买报错（applyMetaBonuses 摸空 G）" + (crashed ? " → " + errors[errBefore] : ""));
await page.screenshot({ path: path.join(HERE, "..", "testshots", "b1-cult-title.png") });
await page.keyboard.press("Escape");

/* U-2 修炼购买后面板文脉数字是否刷新 */
const wemaiShown = await page.evaluate(() => document.getElementById("panel-title").textContent);
ok(!wemaiShown.includes("50") || crashed, "U-2 购买后面板标题文脉数未即时刷新（显示仍含 50）→ " + wemaiShown);
// 关面板后标题屏的文脉数是否陈旧
const tWemai = await page.textContent("#t-wemai");
ok(tWemai.trim() === "50", "U-3 回题名后标题屏文脉数陈旧（仍显示 " + tWemai + "，实际已购扣）");

/* U-4 入宫 → 注入 10 技 → 技能栏溢出与热键缺失 */
await page.click("#btn-new");
await page.click("#btn-start");
await page.waitForSelector("#game-screen:not(.hidden)");
await page.waitForTimeout(300);
await page.evaluate(() => {
  const G = MDG.Main.game.G;
  ["wanzhen", "dage", "shenren", "xiannv", "luhao", "xiaochuan", "guyin", "zichen", "shaoming", "wenbin"].forEach(id => {
    const sk = MDG.DATA.CH(id).skill;
    if (sk) { G.player.skills.push(Object.assign({ cdLeft: 0 }, sk)); }
  });
  MDG.HUD.refreshSkillbar();
});
const skillN = await page.locator("#skillbar .skill").count();
const barW = await page.evaluate(() => document.getElementById("skillbar").scrollWidth);
const vw = await page.evaluate(() => innerWidth);
ok(skillN > 10, "U-4 技能栏塞入 " + (skillN - 1) + " 技+待机");
ok(barW > vw, "U-5 技能栏横向溢出屏幕（" + barW + " > " + vw + "），右端技点不到");
const keyLabels = await page.evaluate(() => [...document.querySelectorAll("#skillbar .skill .key")].map(e => e.textContent));
ok(keyLabels.filter(k => /^[0-9]$/.test(k)).length > 9, "U-6 热键标号超过 9（数字键够不着）");
await page.screenshot({ path: path.join(HERE, "..", "testshots", "b2-skillbar.png") });

/* U-7 撞墙推进回合（UI 通道复现 B-01） */
const bump = await page.evaluate(() => {
  const G = MDG.Main.game.G;
  const p = G.player;
  // 找一面贴身墙
  let dir = null;
  for (const [dx, dy] of MDG.Grid.DIRS) if (MDG.Grid.at(G.map, p.x + dx, p.y + dy) === MDG.Grid.WALL) { dir = [dx, dy]; break; }
  if (!dir) return { found: false };
  G.enemies = [];
  const before = G.round;
  MDG.Input.act({ t: "move", dx: dir[0], dy: dir[1] });
  return { found: true, advanced: G.round === before + 1 };
});
ok(bump.found && bump.advanced, "U-7 UI 撞墙：回合照常推进（敌人白动）");

/* U-8 中途刷新 → 续行 */
await page.reload();
await page.waitForTimeout(500);
const resumeVisible = await page.isVisible("#btn-resume");
ok(!resumeVisible, "U-8 中途刷新后续行按钮消失（存档没认上）");
if (resumeVisible) {
  await page.click("#btn-resume");
  await page.waitForTimeout(400);
  ok(!(await page.isVisible("#game-screen")), "U-9 续行进不了游戏");
  const skillN2 = await page.locator("#skillbar .skill").count();
  ok(skillN2 !== skillN, "U-10 续行后技能栏数量变化（注入技没存上？" + skillN2 + " vs " + skillN + "）");
}

/* U-11 死亡 → 焚稿重开 → 续行按钮仍在（孤儿存档） */
await page.evaluate(() => {
  const G = MDG.Main.game.G;
  G.player.hp = 1;
  const st = G.map.stairs;
  // 放个必死局：直接把玩家血削到 1 后等毒? 无毒——直接斩玩家：造个必中巨伤敌
  G.enemies = [];
  G.enemies.push({ uid: "killer", chId: "mob", name: "刀", glyph: "刀", color: "#000", side: "e",
    x: G.player.x + 1, y: G.player.y, hp: 99, maxHp: 99, dmg: 99, saw: 0, moveRange: 1,
    passive: null, skills: [], st: { stun: 0, disarm: 0, poison: 0, shield: 0, emp: 0, grudge: 0, buffKnife: 0 },
    boss: false, elite: false, mob: true, aggro: true, dead: false, lethalUsed: false, firstHitTaken: false });
  MDG.Input.act({ t: "wait" });
});
await page.waitForTimeout(1300);
const dlg = page.waitForEvent("dialog", { timeout: 3000 }).then(d => { d.accept(); return true; }).catch(() => false);
await page.evaluate(() => { MDG.HUD.openSys(); });
// 点焚稿（第四个按钮）——用文本找
const fireBtn = await page.locator("#panel-body .pbtn", { hasText: "焚稿" }).first();
const fired = await dlg; // 先挂 dialog 监听再点
await fireBtn.click();
await page.waitForTimeout(1800); // 等 reload 完成
const resumed = await page.isVisible("#btn-resume");
ok(!fired, "U-11 焚稿确认弹窗没出来/没接受");
ok(resumed, "U-12 焚稿重开后「续行」按钮仍在（孤儿 run 存档未清）");
await page.screenshot({ path: path.join(HERE, "..", "testshots", "b3-after-fire.png") });

/* U-13 静音 M 持久化（回游戏才按得到 M；进不了就跳过） */
const canResume = await page.isVisible("#btn-resume").catch(() => false);
if (canResume) {
  await page.click("#btn-resume");
  await page.waitForTimeout(400);
  await page.keyboard.press("m");
} else {
  await page.keyboard.press("m");
}
await page.waitForTimeout(150);
const mutedSaved = await page.evaluate(() => JSON.parse(localStorage.getItem("shiji_digong_v1") || "{}").settings?.muted);
ok(mutedSaved !== true, "U-13 按 M 静音未写入存档");

/* 汇总页面错误（除已单列的 U-1） */
const otherErrors = errors.filter((e, i) => !(i === errBefore && crashed));
ok(otherErrors.length > 0, "U-14 另有页面错误 " + otherErrors.length + " 条" + (otherErrors.length ? "：示例 " + otherErrors[0] : ""));

await browser.close();
console.log(`\nUI 扫查：${pass} 确凿 / ${fail} 无恙`);
