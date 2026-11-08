import { loadCore, placeEnemy } from "./harness.mjs";
const ctx = loadCore();
const { Engine, Grid } = ctx.MDG;
Engine.setTeleChance(0);
for (let k = 0; k < 8; k++) {
  const G = Engine.newRunState({ seed: "atk-" + Math.floor(Math.random()*1e9), runnerId: "yinkesi", diffV: "normal", meta: {} });
  G.enemies = [];
  const [px0, py0] = [G.player.x, G.player.y];
  for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) Grid.set(G.map, px0+dx, py0+dy, Grid.FLOOR);
  const f = placeEnemy(ctx, G, "mob", px0+1, py0, { aggro: true });
  G.player.hp = 999;
  const hps = [G.player.hp];
  for (let i = 0; i < 3; i++) { Engine.act(G, { t: "wait" }); hps.push(G.player.hp); }
  const okCase = G.player.hp < 999 || f.dead;
  console.log(k, okCase ? "OK " : "X ", "foeWind:", JSON.stringify(hps), "foeAt:", [f.x, f.y], "pAt:", [px0, py0], "foeTile:", Grid.at(G.map, f.x, f.y), "wind:", f.atkWind, "stun:", f.st.stun);
}
