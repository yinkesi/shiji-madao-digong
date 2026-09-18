import { chromium } from "playwright";
import { pathToFileURL } from "url";
import path from "path";
/* 用法：NODE_PATH=<全局 node_modules> node tests/bench_perf.mjs [页面]
 * 输出 FPS（垂直同步封顶值）与每帧渲染耗时/存档序列化耗时（真实余量）。 */
const file = process.argv[2] || "index.html";
const HERE = (await import("url")).fileURLToPath(import.meta.url);
void HERE;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(pathToFileURL(path.resolve(file)).href);
await page.waitForTimeout(400);
await page.click("#btn-new");
try { await page.waitForSelector("#prologue-screen:not(.hidden)", { timeout: 1200 }); await page.click("#pro-skip"); } catch {}
await page.waitForSelector("#setup-screen:not(.hidden)");
await page.click("#btn-start");
await page.waitForSelector("#game-screen:not(.hidden)");
await page.waitForTimeout(800);
// 让视野里多些东西：随机走 40 步
await page.evaluate(() => { for (let i = 0; i < 40; i++) { const [dx,dy] = [[1,0],[-1,0],[0,1],[0,-1]][Math.floor(Math.random()*4)]; MDG.Input.act({ t: "move", dx, dy }); } });
await page.waitForTimeout(300);
const fps = await page.evaluate(() => new Promise(res => {
  let n = 0; const t0 = performance.now();
  const step = () => { n++; if (n >= 180) res(Math.round(180 / ((performance.now() - t0) / 1000))); else requestAnimationFrame(step); };
  requestAnimationFrame(step);
}));
const saveMs = await page.evaluate(() => {
  const G = MDG.Main.game.G;
  const t0 = performance.now();
  for (let i = 0; i < 50; i++) MDG.Engine.serialize(G);
  return (performance.now() - t0) / 50;
});
const drawMs = await page.evaluate(() => {
  const G = MDG.Main.game.G;
  const t0 = performance.now();
  for (let i = 0; i < 300; i++) MDG.UI.draw(G, performance.now() + i);
  return (performance.now() - t0) / 300;
});
console.log(`${file}: FPS≈${fps} | 每帧渲染 draw ≈ ${drawMs.toFixed(2)}ms | 存档序列化 ≈ ${saveMs.toFixed(2)}ms`);
await browser.close();
