/* ============================================================
 * 实验史记 · 马刀地宫 —— 数据卷
 * 据音克思《实验史记》改编 · 角色卡沿用前作《马刀行》的 id/字/色/被动/技，
 * 数值整体换算到「地宫尺度」；九层地宫、刀卡遗物、行囊、修炼树皆在此。
 * 核心层文件：不碰 DOM，Node 可直测。挂载：MDG.DATA
 * ============================================================ */
(function (ROOT) {
  "use strict";

  /* ---------------- 人物 ----------------
   * runner: 可点将入宫；elite/boss: 地宫中的游荡精英/镇守。
   * passive 效果键与引擎 hasPassive 判定对接（与前作同一路数）。
   * skill 主动技：kind unit=单体 range 内 / burst=range 内全体 / self=自身 /
   *        global=全场敌人 / blink=闪现贴脸；数值 dmg/push/stun/heal/poison/seal。
   * saw(目力): 惊动半径；每层常数里另有玩家视野。
   */
  const CHARS = {
    yinkesi: {
      id: "yinkesi", name: "音克思", hao: "史官", glyph: "史", color: "#c9a45f",
      hp: 18, dmg: 2, runner: true,
      passive: { name: "录技", desc: "首次斩杀有名之角色，录其技入刀谱（仅史官可得）。" },
      skill: { id: "xueji", name: "血祭", kind: "self", cd: 5,
        desc: "损当前半血（至少留1），接下来两次伤害翻倍。", blood: 2 },
      quote: "既毕业，无复有刀者。然地下九层，刀声未绝。",
      bio: "史官入宫，为《实验史记》收最后一卷。刀起刀落，皆是青春。"
    },
    /* ---- 学子（杂兵）与树 ---- */
    mob: { id: "mob", name: "实验学子", hao: "路人", glyph: "生", color: "#8c8577",
      hp: 4, dmg: 1, mob: true, saw: 5,
      passive: { name: "无", desc: "无。" }, quote: "凡马刀，规则至简，而引人入胜。", bio: "地宫里游荡的旧日同窗。" },
    tree: { id: "tree", name: "树", hao: "崇国所种", glyph: "木", color: "#4c6b3c",
      hp: 1, dmg: 0, mob: true, saw: 0,
      passive: { name: "树木皆死", desc: "堵路，一击即碎。" }, quote: "多种树木。树木皆死。", bio: "崇国走，复入二中，多种树木。" },
    /* ---- 可点将 / 精英 / 镇守 ---- */
    wanzhen: { id: "wanzhen", name: "万震", hao: "六班之首", glyph: "震", color: "#6a8577",
      hp: 10, dmg: 2, runner: true, saw: 7,
      passive: { name: "潜心至学", desc: "免疫晕眩。（潜心至学，无多事）" },
      skill: { id: "shuxue", name: "数学之首", kind: "unit", range: 2, dmg: 2, cd: 3,
        desc: "距二内一敌受2伤。（六班数学之首也）" },
      quote: "万震者，六班数学之首也，潜心至学，无多事。", bio: "TGO成员。地宫第一层之镇守——初执马刀，先问他。" },
    dage: { id: "dage", name: "贾瀚元", hao: "大哥", glyph: "哥", color: "#c06a2c",
      hp: 18, dmg: 2, runner: true, saw: 7,
      passive: { name: "城墙之梦", desc: "立于墙边时刀击+1。（梦破败城墙，苔藓覆其上）", wallBonus: 1 },
      skill: { id: "hushoushuang", name: "护手霜之赠", kind: "unit", range: 3, dmg: 1, stun: 1, cd: 3,
        desc: "距三内一敌受1伤且晕一回合。（此乃吾心意也）" },
      quote: "大哥者，贾瀚元也。", bio: "实验三异能者之首。第二层异能之窟的镇守。" },
    shenren: { id: "shenren", name: "江润翔", hao: "神人", glyph: "神", color: "#7a6ba0",
      hp: 10, dmg: 2, saw: 7,
      passive: { name: "鲍鱼之肆", desc: "回合结束时相邻敌人各损1血。（置脏鞋袜与脸盆，久之皆发酵）", poisonAura: 1 },
      skill: { id: "mingxinpic", name: "原神明信片", kind: "unit", range: 2, stun: 1, cd: 3,
        desc: "距二内一敌晕一回合。（购原神明信片以贻之）" },
      quote: "其声阴柔若太监。", bio: "异能之窟的游荡精英之一。" },
    xiannv: { id: "xiannv", name: "姜付艳", hao: "仙女", glyph: "仙", color: "#b0486e",
      hp: 10, dmg: 2, saw: 7,
      passive: { name: "晨读之声", desc: "免疫晕眩。（吾声响，乃吾勤奋专注也）", immuneStun: true },
      skill: { id: "nuchigun", name: "怒斥滚", kind: "unit", range: 3, dmg: 2, push: 1, cd: 2,
        desc: "距三内一敌受2伤并击退一格。（滚。——声极尖锐，远亦及之）" },
      quote: "仙致于学，常走而饭，走而诵。", bio: "异能之窟的游荡精英之一。" },
    luhao: { id: "luhao", name: "刘鲁豪", hao: "道", glyph: "豪", color: "#4a6d9c",
      hp: 24, dmg: 3, runner: true, saw: 7,
      passive: { name: "大腹如斗", desc: "刀击伤害翻倍。（道之所在，刀下加倍奉还）", knifeMul: 2 },
      skill: { id: "jincxiu", name: "锦绣昼行", kind: "unit", range: 3, dmg: 2, stun: 1, cd: 3,
        desc: "距三内一敌受2伤且晕一回合。（恋爱而不让人知，如锦绣夜行）" },
      quote: "恋爱而不让人知，如锦绣夜行，谁知之者！", bio: "道德帮之道。三国刀廊的镇守。" },
    xiaochuan: { id: "xiaochuan", name: "颜小川", hao: "德艺", glyph: "川", color: "#2e8b74",
      hp: 12, dmg: 2, saw: 7,
      passive: { name: "卧薪尝胆", desc: "每次受伤后，下一次伤害+1。（报期末之耻，一举夺魁）", grudgeStack: 1, grudgeCap: 2 },
      skill: { id: "wangba", name: "王霸之气", kind: "unit", range: 2, dmg: 1, seal: 1, cd: 3,
        desc: "距二内一敌受1伤且封技一回合。（烨然有王霸之气也）" },
      quote: "夫川，流而不息，水准而不盈。", bio: "道德帮之德艺兼修者。三国刀廊的游荡精英。" },
    guyin: { id: "guyin", name: "顾一", hao: "只因", glyph: "因", color: "#333333",
      hp: 13, dmg: 2, saw: 7,
      passive: { name: "皇太子", desc: "每场一次，受致命伤时保留1血。（其父任二十班班主任）", lethalKeep: 1 },
      skill: { id: "kunquan", name: "坤拳九式", kind: "unit", range: 1, dmg: 3, cd: 2,
        desc: "相邻一敌受3伤。（误伤己手，遂废此招；今稍加收敛）" },
      quote: "尝以俚歌鸡你太美闻于班中。", bio: "自创坤拳九式。协会堂的游荡精英。" },
    yiran: { id: "yiran", name: "隋奕然", hao: "小蛙", glyph: "蛙", color: "#5a8c46",
      hp: 11, dmg: 2, saw: 7,
      passive: { name: "魔方宗师", desc: "每回合首次受伤-1。（技艺炉火纯青）", firstHitReduce: 1 },
      skill: { id: "paidupi", name: "拍肚皮", kind: "unit", range: 1, dmg: 2, heal: 1, cd: 2,
        desc: "相邻一敌受2伤，自愈1血。（见鲁豪腹大如斗，乃拍之）" },
      quote: "何只有凯宇一男也！", bio: "梦晨谓之神青蛙。协会堂的游荡精英。" },
    zichen: { id: "zichen", name: "王子琛", hao: "武", glyph: "琛", color: "#7d4a6b",
      hp: 22, dmg: 2, runner: true, saw: 7, boss: true,
      passive: { name: "班长之威", desc: "相邻敌人对琛伤害-1，至少为1。（号令两班，政由琛出）", auraReduce: 1 },
      skill: { id: "qiyi", name: "体育课起义", kind: "global", dmg: 1, stun: 1, cd: 4,
        desc: "所有敌人受1伤且晕一回合。（夺其话筒：马上解散！）" },
      quote: "子琛者，大事可与焉。", bio: "故六班班长。协会堂的镇守——半血之时，其二心腹必至。" },
    lifan: { id: "lifan", name: "李帆", hao: "李疯", glyph: "帆", color: "#3f7d8c",
      hp: 12, dmg: 2, saw: 7,
      passive: { name: "课代表夺权", desc: "技能冷却-1。（假英语课代表之职权，聚众阴谋）", cdCut: 1 },
      skill: { id: "sayyou", name: "Say You Say Me", kind: "burst", range: 2, stun: 1, cd: 3, stunChance: 0.5,
        desc: "距二内所有敌人五成机率晕一回合。（上台笑场者三）" },
      quote: "初中时举华意志于班，自为戈。", bio: "马刀七班刀之创者。合流渊的游荡精英。" },
    limo: { id: "limo", name: "李默", hao: "羚羊", glyph: "羚", color: "#8f8f5c",
      hp: 10, dmg: 2, saw: 8, moveRange: 2,
      passive: { name: "巡征", desc: "一次移动可走两格。（每吃饭必疾往，状类羚羊）", moveRange: 2 },
      skill: { id: "zhengshi", name: "争食", kind: "unit", range: 2, dmg: 1, heal: 1, cd: 2,
        desc: "距二内一敌受1伤并自愈1血。（每有小零食，默必先索而食之）" },
      quote: "吾之高中，多以为一场游戏一场梦。", bio: "好重点班，常于二楼徘徊。合流渊的游荡精英。" },
    touge: { id: "touge", name: "陈修逸", hao: "头哥", glyph: "头", color: "#5e7d4f",
      hp: 22, dmg: 2, runner: true, saw: 7,
      passive: { name: "球棍意念", desc: "免疫击退。（与球棍意念合一，官知止而神欲行）", immuneKnock: true },
      skill: { id: "sanxiu", name: "三溴化氮", kind: "burst", range: 1, dmg: 2, poison: 2, cd: 3,
        desc: "周身所有敌人受2伤并中毒二回合。（鲜有败绩；体味绝类鸩毒）" },
      quote: "其头甚圜，发短不盈寸，绝类卤蛋。", bio: "三次为捉，四次换家。合流渊的镇守——莫贴其身。" },
    weibing: { id: "weibing", name: "为兵", hao: "老班", glyph: "兵", color: "#5d5d5d",
      hp: 13, dmg: 2, saw: 9,
      passive: { name: "监控之眼", desc: "其攻击无视闪避与减伤。（以监控视之，大怒，破门而入）", pierce: true },
      skill: { id: "pomen", name: "破门而入", kind: "blink", dmg: 1, seal: 1, cd: 3,
        desc: "瞬至一敌相邻，击之并封其一回合。（遽扑之，夺其魔方）" },
      quote: "尔等安有如修逸折正二十面体者乎？", bio: "禁令厅的门钥在其身上——缴之，梯方开。" },
    xiangdong: { id: "xiangdong", name: "吴相东", hao: "潜逃者", glyph: "东", color: "#555577",
      hp: 10, dmg: 2, saw: 7,
      passive: { name: "潜逃", desc: "四分之一机率闪避。（不告而离校，卒潜逃回家）", dodge: 0.25 },
      skill: { id: "jibudiyi", name: "级部第一", kind: "unit", range: 3, dmg: 2, cd: 4,
        desc: "距三内一敌受2伤。（或退步，辄取级部第一）" },
      quote: "每逢考试，必潜携手机。", bio: "实验之奇人。禁令厅的游荡精英。" },
    qinfa: { id: "qinfa", name: "钦法", hao: "主任", glyph: "法", color: "#3d4a5c",
      hp: 20, dmg: 2, runner: true, saw: 8,
      passive: { name: "穷追猛打", desc: "对半血以下敌人伤害+1。（头哥复为所逮者再）", execBonus: 1 },
      skill: { id: "dangchang", name: "当场抓获", kind: "unit", range: 3, seal: 1, cd: 3,
        desc: "距三内一敌封技一回合。（此何课也？自习。）" },
      quote: "汝乃何人？——此何课也？", bio: "级部主任，深恶看闲书者。禁令厅的镇守。" },
    wenbin: { id: "wenbin", name: "于汶斌", hao: "狗白菜", glyph: "斌", color: "#6d8c3f",
      hp: 12, dmg: 2, saw: 7,
      passive: { name: "秒之", desc: "刀击有三成机率双倍。（wonder究一题十四课，汶斌秒之）", critChance: 0.3, critMul: 2 },
      skill: { id: "tanhuang", name: "弹簧纸箭", kind: "unit", range: 4, dmg: 2, cd: 2,
        desc: "距四内一敌受2伤。（以弹簧串联笔杆，射程数米）" },
      quote: "以面如白菜，故号曰狗白菜。", bio: "教主也。神算之间的游荡精英。" },
    wonder: { id: "wonder", name: "王元昊", hao: "wonder", glyph: "问", color: "#8c5a3c",
      hp: 26, dmg: 3, runner: true, saw: 8,
      passive: { name: "马刀之神", desc: "血祭后，接下来三次伤害翻倍。（常人仅两次）", bloodCharges: 3 },
      skill: { id: "gbc", name: "GBC算不算", kind: "unit", range: 3, dmg: 2, evenBonus: 1, cd: 2,
        desc: "距三内一敌受2伤，其血量为偶则+1。（每有新题辄曰：GBC，算不算）" },
      quote: "究所有自然数之和为负十二分之一。", bio: "TGO之首，马刀之神。神算之间的镇守；终焉之庭，他还在。" },
    chongguo: { id: "chongguo", name: "王崇国", hao: "校长", glyph: "国", color: "#2f3d2f",
      hp: 30, dmg: 3, saw: 7, boss: true,
      passive: { name: "弃车保帅", desc: "每场一次，致命伤时保留1血并回3血。（事败，辄弃车保帅以自全）", lethalKeep: 3 },
      skills: [
        { id: "pingzhicheng", name: "评职称", kind: "global", seal: 1, cd: 3,
          desc: "所有敌人封技一回合。（不为班主任者不得评职称）" },
        { id: "zhongshu", name: "种树", kind: "summon", cd: 3,
          desc: "召唤一株树。（多种树木，树木皆死）" }
      ],
      quote: "为师者，吾之属地也。", bio: "即墨实验之校长。崇国庭的镇守。" },
    shaoming: { id: "shaoming", name: "刘绍铭", hao: "铭", glyph: "铭", color: "#8a3b3b",
      hp: 12, dmg: 2, saw: 7,
      passive: { name: "不怒自威", desc: "对半血以下敌人伤害+1。（仪表堂堂，不怒自威）", execBonus: 1 },
      skill: { id: "xinhuitiao", name: "歆慧纸条", kind: "unit", range: 3, dmg: 3, cd: 2,
        desc: "距三内一敌受3伤。（纸条之多，少有过之者）" },
      quote: "急击勿失。", bio: "潮海之冠。终焉之庭的游荡精英。" },
    /* 二中四人（卷十五 · 党争遗魂，散于深层） */
    shengxiang: { id: "shengxiang", name: "谭晟翔", hao: "义", glyph: "翔", color: "#7a4f4f",
      hp: 8, dmg: 2, saw: 6,
      passive: { name: "能让不能明", desc: "无。（晟翔有义无勇）",
        skill: null }, quote: "吾皆为同学，无为如此！", bio: "于班德高望重。" },
    qiyue: { id: "qiyue", name: "鲁齐岳", hao: "痴", glyph: "岳", color: "#4f6e7a",
      hp: 8, dmg: 2, saw: 6,
      passive: { name: "有痴无断", desc: "无。（齐岳多情而少断）" },
      skill: { id: "zhitiao", name: "纸条投书", kind: "unit", range: 2, dmg: 2, cd: 3,
        desc: "距二内一敌受2伤。（子烨蔑之，弃其纸条如草芥）" },
      quote: "一妇人而已，和足挂之！", bio: "初好子烨，断后好连奇。" },
    ziye: { id: "ziye", name: "李子烨", hao: "媚", glyph: "烨", color: "#8c6a2f",
      hp: 8, dmg: 1, saw: 6,
      passive: { name: "有媚无诚", desc: "无。（子烨有媚无诚）" },
      skill: { id: "chanyan", name: "谗言", kind: "unit", range: 2, dmg: 1, seal: 1, cd: 3,
        desc: "距二内一敌受1伤且封技一回合。（乃阴谗言于连奇）" },
      quote: "子烨好评头论足，玲珑可爱。", bio: "九人联合发朋友圈以阴阳之。" },
    lianqi: { id: "lianqi", name: "岳连奇", hao: "断", glyph: "奇", color: "#5c5c8c",
      hp: 9, dmg: 2, saw: 6,
      passive: { name: "有断无柔", desc: "无。（连奇有断无柔）" },
      skill: { id: "erze", name: "二择", kind: "unit", range: 2, dmg: 2, cd: 3,
        desc: "距二内一敌受2伤。（予尔二择：a朋友，b陌路）" },
      quote: "高考且至，吾不欲吾二人难堪。", bio: "念齐岳成绩卓越，乃许其入派。" }
  };
  const CH = (id) => CHARS[id];

  /* ---------------- 难度 ----------------
     eHp/eDmg/saw 敌方倍修；sight 惊动半径加成；mul 文脉倍率。 */
  const DIFFS = [
    { v: "easy", n: "简单", eHp: 0.8, eDmg: -1, saw: 0, mul: 0.8, tip: "敌伤-1、血×0.8；文脉×0.8" },
    { v: "normal", n: "普通", eHp: 1.0, eDmg: 0, saw: 0, mul: 1.0, tip: "标准强度（默认）" },
    { v: "hard", n: "困难", eHp: 1.25, eDmg: 0, saw: 1, mul: 1.3, tip: "敌血×1.25、目力+1；文脉×1.3" },
    { v: "extreme", n: "极难", eHp: 1.5, eDmg: 1, saw: 2, mul: 1.6, tip: "敌血×1.5、伤+1；文脉×1.6" },
    { v: "nightmare", n: "噩梦", eHp: 2.0, eDmg: 1, saw: 2, mul: 2.2, tip: "敌血×2、伤+1、杂兵更多；文脉×2.2" }
  ];
  const DIFF_BY_V = {}; DIFFS.forEach(d => DIFF_BY_V[d.v] = d);

  /* ---------------- 九层地宫 ----------------
   * rule: 特则 id（引擎按 id 分发）；desc 给玩家看。
   * boss/elite/mobs: 生成配方。gate: 梯锁条件（默认镇守死则开）。
   * shop: 有小卖部否。 */
  const FLOORS = [
    { n: 1, name: "跑道之下", rule: null, ruleDesc: "", boss: "wanzhen", elites: [], mobs: 3,
      intro: "操场沉在地下第一层。跑道仍画着白线，只是再没有人跑。" },
    { n: 2, name: "异能之窟", rule: "dyad", ruleDesc: "情比金坚：相邻之敌，其伤加一——先分其阵", boss: "dage", elites: ["shenren", "xiannv"], mobs: 4,
      intro: "走廊坠入地底。三个人仍站成一排，像全校唯一会合唱的阵型。" },
    { n: 3, name: "三国刀廊", rule: "chaos", ruleDesc: "党争：敌人二成机率打错人——同门相争，各怀鬼胎", boss: "luhao", elites: ["xiaochuan"], mobs: 4,
      intro: "教室的课桌长进了土里。两把刀插在土中，像插着两面旗。" },
    { n: 4, name: "协会堂", rule: "uprising", ruleDesc: "起义：琛半血之时，其二心腹必至", boss: "zichen", elites: ["guyin", "yiran"], mobs: 4, shop: true,
      intro: "看台下那张折叠桌还在，纸上四个字：世界马刀协会。" },
    { n: 5, name: "合流渊", rule: "stench", ruleDesc: "鲍鱼之肆：回合结束，相邻者互相腐蚀各损1血——贴身即换血", boss: "touge", elites: ["lifan", "limo"], mobs: 5, shop: true,
      intro: "食堂的灯管在地底频闪。六班与七班之刀，在此合流。" },
    { n: 6, name: "禁令厅", rule: "suomen", ruleDesc: "锁门：击退之术失效；梯封两重——须斩钦法，并缴为兵之钥", boss: "qinfa", elites: ["weibing", "xiangdong"], mobs: 5, shop: true, gateExtra: ["weibing"],
      intro: "办公楼二层。门关着，窗也关着。走廊里没有任何声音。" },
    { n: 7, name: "神算之间", rule: "yansuan", ruleDesc: "验算：回合末，wonder 血量为偶则回2血——算好伤害，打成奇数", boss: "wonder", elites: ["wenbin", "wanzhen"], mobs: 5, shop: true,
      intro: "图书馆的顶灯只剩一盏。地上有一道粉笔题：人也是题。" },
    { n: 8, name: "崇国庭", rule: "zhongshu", ruleDesc: "种树不绝：每回合生树堵路（至多三株）——树亦可为汝挡刀", boss: "chongguo", elites: ["qinfa", "qiyue", "ziye"], mobs: 5, shop: true,
      intro: "校长室沉在最深处。桌上没有茶，只有一摞卷宗。" },
    { n: 9, name: "终焉之庭", rule: "cans", ruleDesc: "看台飞瓶：与敌同行或同列，回合初被砸1血——走位，别站线上", boss: "wonder", bossTag: "终焉", elites: ["dage", "shaoming"], mobs: 6,
      intro: "校门口的梧桐叶落在铁门上。看台上空无一人，他们永远在看。" }
  ];

  /* ---------------- 行囊 / 商摊 ---------------- */
  const ITEMS = {
    fantuan: { id: "fantuan", name: "饭团", price: 6, kind: "heal", val: 5, desc: "回复5血。（食堂之魂）" },
    mantou: { id: "mantou", name: "大馒头", price: 12, kind: "heal", val: 10, desc: "回复10血。（实而不华）" },
    hugoushuang: { id: "hugoushuang", name: "护手霜", price: 10, kind: "shield", val: 3, desc: "获得3点护盾。（之韫所赠）" },
    yumi: { id: "yumi", name: "玉米", price: 14, kind: "empower", val: 1, desc: "下次伤害翻倍。（幻想玉米为刃）" },
    shuihu: { id: "shuihu", name: "水壶", price: 10, kind: "cdclear", desc: "立即清空所有技能冷却。（嗜水如命）" },
    heibang: { id: "heibang", name: "黑棒", price: 15, kind: "buff", val: 12, desc: "十二回合内刀击+1。（不盈尺而威力无双）" },
    tuoluo: { id: "tuoluo", name: "陀螺·三溴化氮", price: 16, kind: "throw", range: 3, dmg: 2, stun: 1, desc: "掷出：距三内一敌受2伤并晕一回合。（鲜有败绩）" }
  };
  const SHOP_STOCK = ["fantuan", "mantou", "hugoushuang", "yumi", "shuihu", "heibang", "tuoluo"];

  /* ---------------- 刀卡（遗物，本轮有效） ---------------- */
  const RELICS = {
    firststrike: { id: "firststrike", name: "先手刀", desc: "每回合首次刀击+1。（早读查得严，唯快不破）" },
    shield3: { id: "shield3", name: "班主任的偏爱", desc: "每层开局获得3点护盾。（含笑素善大哥）" },
    bloodfree: { id: "bloodfree", name: "以道代血", desc: "血祭不再损血，只耗一息。（道之所在，血不轻洒）" },
    killheal: { id: "killheal", name: "庆功之宴", desc: "击破回复由2升为4。（大胜而归，理当加餐）" },
    cleave: { id: "cleave", name: "刀扫一片", desc: "刀击同时波及相邻的另一名敌人。（马刀本是横扫之术）" },
    reach: { id: "reach", name: "长杆马刀", desc: "刀击可及两格。（加长一寸，强出一分）" },
    nightwalk: { id: "nightwalk", name: "锦绣夜行", desc: "每层首次刀击+2。（恋爱而不让人知）" },
    grudge: { id: "grudge", name: "卧薪尝胆", desc: "受伤后下次刀击+1（至多叠2）。（一举夺魁）" }
  };

  /* ---------------- 修炼树（文脉） ---------------- */
  const META_TREE = [
    { id: "fist", name: "拳不离手", max: 3, cost: [8, 16, 28], desc: "刀击+1/级。（冬练三九）" },
    { id: "body", name: "体魄", max: 3, cost: [8, 16, 28], desc: "生命上限+4/级。（跑操不落）" },
    { id: "purse", name: "盘缠", max: 2, cost: [6, 12], desc: "开局零花钱+10/级。（压岁钱藏着）" },
    { id: "appetite", name: "饭量", max: 2, cost: [6, 12], desc: "食物回复+2/级。（食堂阿姨手不抖）" },
    { id: "hearth", name: "灶火", max: 1, cost: [10], desc: "灶间歇息另获3点护盾。（灶膛余温）" },
    { id: "blood", name: "血性", max: 1, cost: [15], desc: "血祭翻倍次数+1。（血祭血祭血血祭）" },
    { id: "guard", name: "护身", max: 1, cost: [10], desc: "入宫自带2点护盾。（班主任的偏爱·平替）" },
    { id: "royalty", name: "稿费", max: 2, cost: [10, 20], desc: "文脉获取+10%/级。（立言之利）" }
  ];

  /* ---------------- 成就 ---------------- */
  const ACHIEVES = [
    { id: "a_in", name: "初入宫", desc: "第一次踏入地宫。" },
    { id: "a_f3", name: "过三国刀廊", desc: "抵达第三层。" },
    { id: "a_f6", name: "破禁令", desc: "抵达第六层。" },
    { id: "a_win", name: "收卷", desc: "斩终焉之 wonder，为刀史收卷。" },
    { id: "a_elite3", name: "以刀会友", desc: "一轮内录技三名。" },
    { id: "a_scroll10", name: "史料十篇", desc: "图鉴史料累计十枚。" },
    { id: "a_allrunner", name: "人人有传", desc: "点将名册满八人。" },
    { id: "a_nm_win", name: "噩梦收卷", desc: "在噩梦难度收卷。（明知不可为而为之）" }
  ];

  ROOT.MDG = ROOT.MDG || {};
  ROOT.MDG.DATA = { CHARS, CH, DIFFS, DIFF_BY_V, FLOORS, ITEMS, SHOP_STOCK, RELICS, META_TREE, ACHIEVES };
})(typeof window !== "undefined" ? window : globalThis);
