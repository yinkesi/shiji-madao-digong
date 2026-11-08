/* 截九层全景，找贴图与地形不符处 */
import { chromium } from "playwright";
import { pathToFileURL } from "url";
import path from "path";
import { fileURLToPath } from "url";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errs = [];
page.on("pageerror", e => errs.push(String(e).slice(0, 200)));
await page.goto(pathToFileURL(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "index.html")).href);
await page.waitForTimeout(300);
await page.click("#btn-new");
try { await page.waitForSelector("#prologue-screen:not(.hidden)", { timeout: 1200 }); await page.click("#pro-skip"); } catch {}
await page.waitForSelector("#setup-screen:not(.hidden)");
await page.click("#btn-start");
await page.waitForSelector("#game-screen:not(.hidden)");
await page.waitForTimeout(300);
for (const f of [0, 2, 4, 6, 7, 8]) {
  await page.evaluate((fi) => {
    const G = MDG.Main.game.G;
    MDG.Engine.enterFloor(G, fi);
    // 全图探索（测试视野）
    for (let y = 0; y < G.map.h; y++) for (let x = 0; x < G.map.w; x++) G.explored[x + "," + y] = 1;
    MDG.UI.updateFov(G);
    MDG.HUD.refreshHUD(); MDG.HUD.refreshSkillbar(); MDG.HUD.refreshObjective();
  }, f);
  await page.waitForTimeout(700);
  await page.screenshot({ path: "testshots/terrain-f" + (f + 1) + ".png" });
}
console.log("errs:", errs.length ? errs : "无");
await browser.close();
