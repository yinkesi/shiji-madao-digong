import { loadCore, makeT, placeEnemy } from './harness.mjs';
const ctx = loadCore();
const { Engine, Rewards, Navigation, Grid, DATA, Run } = ctx.MDG;
const t = makeT('progression');
function fresh() {
  return Engine.newRunState({ seed: 'reward-route', runnerId: 'yinkesi', diffV: 'normal', meta: {} });
}
{
  const G = fresh();
  Rewards.offer(G);
  t.eq(G.relicChoices.length, 3, '三张候选');
  t.eq(new Set(G.relicChoices).size, 3, '候选互不重复');
  const initial = JSON.stringify(G.relicChoices), state = G.rs.a;
  const round = G.round, hp = G.player.hp;
  Run.saveRun(G);
  const loaded = Run.loadRun();
  t.eq(JSON.stringify(loaded.relicChoices), initial, '读档保留已生成候选');
  t.eq(loaded.rs.a, state, '读档不重抽随机');
  Engine.act(loaded, {t:'relic',id:'not-offered'});
  t.eq(loaded.relics.length, 0, '拒绝非法奖励');
  t.eq(loaded.rs.a, state, '非法选择不耗随机');
  const chosen = loaded.relicChoices[1];
  Engine.act(loaded, {t:'relic',id:chosen});
  t.ok(loaded.relics.includes(chosen), '玩家选择实际入账');
  t.eq(loaded.round, round, '选择不推进回合');
  t.eq(loaded.player.hp, hp, '选择不会受到回合伤害');
  Engine.act(loaded, {t:'relic',id:chosen});
  t.eq(loaded.relics.length, 1, '不能重复领取');
  Rewards.offer(loaded);
  t.ok(!loaded.relicChoices.includes(chosen), '以后不提供已拥有卡');
}
{
  const G=fresh();
  Rewards.offer(G); const choices=JSON.stringify(G.relicChoices);
  Rewards.offer(G);
  t.eq(G.relicDrafts,2,'暂存两份奖励');
  t.eq(JSON.stringify(G.relicChoices),choices,'新奖励不冲掉当前选择');
  Engine.act(G,{t:'relic',id:G.relicChoices[0]});
  t.eq(G.relicDrafts,1,'领取后留下下一份');
  t.eq(G.relicChoices.length,3,'下一份正常生成');
}
{
  const G=fresh(); G.relics=Object.keys(DATA.RELICS);
  const money=G.money;
  Rewards.offer(G);
  t.eq(G.money,money+12,'收齐卡后奖励折钱');
  t.eq(G.relicDrafts,0,'折钱不残留死面板');
}
{
  const G=fresh(); G.relics=Object.keys(DATA.RELICS).filter(id=>id!=='insight');
  Rewards.offer(G);
  t.eq(G.relicChoices.length,1,'仅剩一张卡也可领取');
  Engine.act(G,{t:'relic',id:'insight'});
  t.eq(G.relicChoices.length,0,'领取末张正常收尾');
}
{
  const G=fresh(); G.enemies=[]; G.relics=['counterguard','insight'];
  const foe=placeEnemy(ctx,G,'mob',G.player.x+1,G.player.y,{aggro:true});
  foe.hp=foe.maxHp=99;foe.telegraph=true;foe.windupAt=(G.combatTime||0)-650;
  G.player.skills[0].cdLeft=3;
  Engine.strike(G,G.player,foe,'knife',{dmg:2});
  t.eq(G.player.st.shield,1,'弹反卡补一盾');
  t.eq(G.player.skills[0].cdLeft,2,'悟刀卡额外减一技能冷却');
  G.player.st.shield=5;foe.telegraph=true;foe.windupAt=(G.combatTime||0)-650;
  Engine.strike(G,G.player,foe,'knife',{dmg:2});
  t.eq(G.player.st.shield,5,'不叠超过上限也不削已有护盾');
}
{
  const G=fresh(); G.enemies=[];G.map=Grid.makeMap(7,5);G.explored={};
  G.player.x=1;G.player.y=2;
  for(let y=1;y<4;y++) for(let x=1;x<6;x++) {Grid.set(G.map,x,y,Grid.FLOOR);G.explored[x+','+y]=1;}
  Grid.set(G.map,3,2,Grid.TRAP);
  const route=Navigation.safePath(G,1,2,5,2);
  t.ok(route && route.length>4,'宁可绕路不踩陷阱');
  t.ok(route.every(([x,y])=>Grid.at(G.map,x,y)!==Grid.TRAP),'全程无陷阱');
  t.eq(Navigation.safePath(G,1,2,3,2),null,'长距点击陷阱也拒绝');
  delete G.explored['5,2'];
  t.eq(Navigation.safePath(G,1,2,5,2),null,'不穿迷雾自动寻路');
  G.explored['5,2']=1;
  Grid.set(G.map,3,1,Grid.WALL);Grid.set(G.map,3,3,Grid.WALL);
  t.eq(Navigation.safePath(G,1,2,5,2),null,'唯一通路有陷阱时停止');
  Grid.set(G.map,3,2,Grid.FLOOR);Grid.set(G.map,5,2,Grid.CHEST);
  t.ok(Navigation.safePath(G,1,2,5,2),'可自动走向已知互动目标');
}
process.exit(t.done());
