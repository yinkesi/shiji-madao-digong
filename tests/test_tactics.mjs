/* 冷却迎击与击退陷阱：真实行动和伤害入口的战术回归。 */
import { loadCore, makeT, placeEnemy } from './harness.mjs';
const ctx = loadCore();
const { Engine, Grid } = ctx.MDG;
const t = makeT('tactics');
function scene(kind = 'spike') {
  const G = Engine.newRunState({ seed: 'tactics', runnerId: 'yinkesi', diffV: 'normal', meta: {} });
  G.enemies = [];
  G.map = Grid.makeMap(9, 7);
  for (let y = 1; y < 6; y++) for (let x = 1; x < 8; x++) Grid.set(G.map, x, y, Grid.FLOOR);
  G.player.x = 2; G.player.y = 3;
  G.map.trapKinds = { '4,3': kind };
  Grid.set(G.map, 4, 3, Grid.TRAP);
  const foe = placeEnemy(ctx, G, 'mob', 3, 3, { aggro: true });
  foe.hp = foe.maxHp = 30;
  return { G, foe };
}
{
  const { G, foe } = scene();
  Engine.setTeleChance(1);
  Engine.act(G, { t: 'move', dx: 1, dy: 0 });
  t.ok(G.player.attackCd > 0 && foe.telegraph, '首刀后处于冷却，敌方亮刀');
  const hp = G.player.hp;
  const events = Engine.act(G, { t: 'move', dx: 1, dy: 0 });
  t.ok(events.some(e => e.t === 'parry'), '冷却中可迎击红框');
  t.eq(G.player.hp, hp, '弹反抵消敌方出刀');
  t.ok(G.player.attackCd > 0, '迎击后仍有收刀冷却');
  const after = foe.hp;
  Engine.act(G, { t: 'move', dx: 1, dy: 0 });
  t.eq(foe.hp, after, '没有新红框时不能连续攻击');
}
for (const kind of ['spike', 'poison', 'rock']) {
  const { G, foe } = scene(kind);
  Engine.strike(G, G.player, foe, 'skill', { dmg: 2, push: 1 });
  t.eq(foe.x, 4, kind + '：击退到陷阱');
  t.ok(G.ev.some(e => e.t === 'trap'), kind + '：落点触发陷阱');
  t.eq(foe.hp, kind === 'spike' ? 25 : kind === 'rock' ? 27 : 28, kind + '：直接伤害正确');
  t.eq(foe.st.poison, kind === 'poison' ? 3 : 0, kind + '：毒状态正确');
  t.eq(Grid.at(G.map, 4, 3), kind === 'poison' ? Grid.TRAP : Grid.FLOOR, kind + '：消耗规则正确');
}
{
  const { G, foe } = scene();
  foe.hp = 4;
  Engine.strike(G, G.player, foe, 'skill', { dmg: 2, push: 1 });
  t.ok(foe.dead, '陷阱补刀击杀');
  t.eq(G.ev.filter(e => e.t === 'die').length, 1, '陷阱补刀不重复死亡奖励');
}
{
  const { G, foe } = scene();
  G.floorDef = { ...G.floorDef, rule: 'suomen' };
  Engine.strike(G, G.player, foe, 'skill', { dmg: 2, push: 1 });
  t.eq(foe.x, 3, '锁门层仍禁止击退');
  t.ok(!G.ev.some(e => e.t === 'trap'), '没有移动不触发陷阱');
}
process.exit(t.done());
