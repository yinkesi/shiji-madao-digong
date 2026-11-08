import assert from 'node:assert/strict';
import {loadCore,placeEnemy} from './harness.mjs';
const ctx=loadCore(),{Engine:E,Grid:Gr}=ctx.MDG;
function scene(){
 const G=E.newRunState({seed:'pressure',runnerId:'yinkesi',diffV:'normal',meta:{}});
 G.enemies=[];G.player.hp=100;
 Gr.set(G.map,G.player.x+1,G.player.y,Gr.FLOOR);
 const e=placeEnemy(ctx,G,'mob',G.player.x+1,G.player.y,{aggro:true});e.hp=e.maxHp=40;
 E.act(G,{t:'wait',atMs:0});return {G,e};
}
for(const [time,success] of [[0,false],[599,false],[600,true],[700,true],[779,true],[780,false],[900,false]]){
 const {G,e}=scene();const hp=G.player.hp;
 const events=E.act(G,{t:'move',dx:1,dy:0,atMs:time});
 assert.equal(events.some(v=>v.t==='parry'),success,`parry at ${time}ms`);
 assert.equal(G.player.hp,hp-(success?0:2),`damage at ${time}ms`);
}
{
 const {G,e}=scene();E.act(G,{t:'wait',atMs:820});const hp=G.player.hp;
 assert.ok(e.attackCd>0);E.act(G,{t:'wait',atMs:1600});
 assert.equal(G.player.hp,hp,'recovery must not hit');assert.ok(e.attackWarning,'prepare during recovery');
 E.act(G,{t:'wait',atMs:2420});assert.equal(G.player.hp,hp-2,'strike every two actions');
}
console.log('✓ combat-pressure: early/on-time/late, 180ms window, 2 damage, overlapping recovery/windup');
