/* 镇守刀卡选择：候选只生成一次，随局存档；选择本身不推进回合。 */
(function (ROOT) {
  'use strict';
  const MDG = ROOT.MDG;
  function prepare(G) {
    if (G.relicChoices && G.relicChoices.length) return;
    const pool = Object.keys(MDG.DATA.RELICS).filter(id => !G.relics.includes(id));
    if (!pool.length) {
      const money = (G.relicDrafts || 0) * 12;
      G.money += money;
      G.relicDrafts = 0;
      G.relicChoices = [];
      if (money) G.ev.push({ t: 'log', text: '刀卡已集齐，未选奖励折为' + money + '钱。' });
      return;
    }
    G.relicChoices = G.r.shuffle(pool).slice(0, 3);
    G.ev.push({ t: 'relicChoice' });
  }
  function offer(G) {
    G.relicDrafts = (G.relicDrafts || 0) + 1;
    prepare(G);
  }
  function choose(G, id) {
    if (!(G.relicDrafts > 0) || !(G.relicChoices || []).includes(id) || G.relics.includes(id)) return false;
    const def = MDG.DATA.RELICS[id];
    if (!def) return false;
    G.relics.push(id);
    G.relicDrafts--;
    G.relicChoices = [];
    G.ev.push({ t: 'relic', id, name: def.name });
    G.ev.push({ t: 'log', text: '选定刀卡「' + def.name + '」——' + def.desc });
    if (G.relicDrafts > 0) prepare(G);
    return true;
  }
  MDG.Rewards = { offer, choose };
})(typeof window !== 'undefined' ? window : globalThis);
