import { loadCore } from "./harness.mjs";
const ctx = loadCore();
const { Gen, DATA, Grid } = ctx.MDG;
for (const def of DATA.FLOORS) {
  for (const seed of ["alpha","beta","gamma","delta","s-2026"]) {
    const { map, places } = Gen.genFloor(seed + "|" + def.n, def);
    if (!Gen.sane(map)) {
      // 找出不连通的特殊格
      const df = Grid.distField(map, map.spawn[0], map.spawn[1]);
      for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
        const t = Grid.at(map, x, y);
        if ([Grid.CAMPFIRE, Grid.SHOP, Grid.CHEST, Grid.SCROLL, Grid.TRAP].includes(t) && df[y*map.w+x] < 0)
          console.log("不连通:", def.name, seed, "格", x+","+y, "类型", t);
      }
    }
  }
}
console.log("done");
