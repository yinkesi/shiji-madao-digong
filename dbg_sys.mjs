import { chromium } from "playwright";
import { pathToFileURL } from "url";
import path from "path";
const browser = await chromium.launch();
const page = await browser.newPage();
const errs = [];
page.on("pageerror", e => errs.push(String(e).slice(0, 200)));
page.on("dialog", d => { console.log("DIALOG:", d.type(), (d.message() || "").slice(0, 50)); d.accept("test"); });
await page.goto(pathToFileURL(path.resolve("index.html")).href);
await page.waitForTimeout(400);
await page.evaluate(() => {
  localStorage.setItem("shiji_digong_v1", JSON.stringify({ v: 1, wemai: 77, tree: { body: 1 }, runners: ["yinkesi", "wanzhen"], dex: {}, scrolls: 0, achieves: {}, flags: { prologueSeen: true }, stats: { runs: 3, wins: 1, bestFloor: 5 }, settings: { muted: false, diffV: "normal", runner: "yinkesi" } }));
});
await page.reload();
await page.waitForTimeout(400);
await page.click("#btn-new");
await page.waitForSelector("#setup-screen:not(.hidden)");
await page.click("#btn-start");
await page.waitForSelector("#game-screen:not(.hidden)");
await page.waitForTimeout(350);
await page.click("#btn-sys");
await page.waitForTimeout(250);
console.log("panel:", await page.evaluate(() => ({
  open: !document.getElementById("panel-mask").classList.contains("hidden"),
  title: document.getElementById("panel-title").textContent,
  btns: [...document.querySelectorAll("#panel-body .pbtn")].map(b => b.textContent)
})));
await browser.close();
console.log("errs:", errs);
