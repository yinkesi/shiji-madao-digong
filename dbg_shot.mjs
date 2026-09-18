import { chromium } from "playwright";
import { pathToFileURL } from "url";
import path from "path";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errs = [];
page.on("pageerror", e => errs.push(String(e).slice(0, 200)));
await page.goto(pathToFileURL(path.resolve("index.html")).href);
await page.waitForTimeout(300);
await page.click("#btn-new");
try { await page.waitForSelector("#prologue-screen:not(.hidden)", { timeout: 1200 }); await page.click("#pro-skip"); } catch {}
await page.waitForSelector("#setup-screen:not(.hidden)");
await page.click("#btn-start");
await page.waitForSelector("#game-screen:not(.hidden)");
await page.waitForTimeout(800);
await page.evaluate(() => { for (let i = 0; i < 30; i++) { const [dx,dy] = [[1,0],[-1,0],[0,1],[0,-1]][Math.floor(Math.random()*4)]; MDG.Input.act({ t: "move", dx, dy }); } });
await page.waitForTimeout(500);
await page.screenshot({ path: "testshots/refactor-game.png" });
// 走到灶间/开箱看看脏重绘
await page.evaluate(() => { for (let i = 0; i < 60; i++) { const [dx,dy] = [[1,0],[-1,0],[0,1],[0,-1]][Math.floor(Math.random()*4)]; MDG.Input.act({ t: "move", dx, dy }); } });
await page.waitForTimeout(400);
await page.screenshot({ path: "testshots/refactor-game2.png" });
console.log("errors:", errs.length ? errs : "无");
await browser.close();
