import { chromium } from "playwright";
import { pathToFileURL } from "url";
import path from "path";
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(pathToFileURL(path.resolve("index.html")).href);
await page.waitForTimeout(300);
await page.click("#btn-new");
try { await page.waitForSelector("#prologue-screen:not(.hidden)", { timeout: 1200 }); await page.click("#pro-skip"); } catch {}
await page.waitForSelector("#setup-screen:not(.hidden)");
await page.evaluate(() => { const orig = MDG.Run.newRun.bind(MDG.Run); MDG.Run.newRun = (o) => orig(Object.assign({ seed: "story-1" }, o)); });
await page.click("#btn-start");
await page.waitForSelector("#game-screen:not(.hidden)");
await page.waitForTimeout(300);
// 直接跑到卡死现场：加载已卡的存档？没有——重放 chunk 若干次后解剖
await page.evaluate(() => { window.__chunk && 0; });
// 简化：重写一份 mini chunk 循环 1500 轮后解剖
const info = await page.evaluate(() => {
  const MD = window.MDG;
  const manh = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  // 用与 playthrough 相同的策略跑 1500 轮
  for (let i = 0; i < 1500; i++) { if (window.__chunk) break; }
  return null;
});
// 没有现成函数——直接加载 playthrough 的策略太重；改为：反复调用 chunk 存在于页面？
console.log("skip — 改为直接调用 __chunk 后解剖");
await browser.close();
