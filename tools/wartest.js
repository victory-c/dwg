// Dev-only war telemetry (war.js): `const w = await import('/tools/wartest.js')` in the console, after the harness.
//   w.skirmish(6)  two even squads, a GM and a Zaku one, left to fight it out far from the pilot: how long it lasts
//   w.campaign(10) the mission with the pilot parked out of the way (invulnerable) for 10 minutes of game time: who
//                  takes which field when, how many soldiers each side has, and what a frame of simulation costs
//   w.brawl(90)    the pilot parked in a fight beside a GM squad, against a Zeon squad with its squad leader (or an
//                  officer: `{ officer: 'denim' }`): whom Zeon's soldiers and commander pick as a foe, how often
//                  each side gets hit, and what a blow between the armies is worth
import { officerCfg, WAR } from '../src/game/stage.js';
const game = window.game;
const tick = () => { game.last = performance.now() - 1000 / 60; game.frame(); };
const quiet = (fn) => { const r = game.post.render; game.post.render = () => {}; try { return fn(); } finally { game.post.render = r; } };
const park = (x, z) => { const h = game.hero; h.pos.set(x, 0, z); h.vel.set(0, 0, 0); h.invuln = 1e9; h.hp = h.maxHp; if (h.state === 'intro') h.state = 'move'; };

export function skirmish(n = 6, secs = 600, { gmHp } = {}) {
  const g = game;
  g.start({ training: false });
  quiet(tick);
  g.crowd.clear(); g.allies.clear(); g.commanders.clear(); g.projectiles.clear();
  g.stage.phase = 'idle'; // no posts, no pods, no production: just the two squads
  const cfg = { fields: {}, allyCapture: true, recapture: true, budget: 999, fed: { ...WAR.fed, hp: gmHp ?? WAR.fed.hp }, zeon: { ...WAR.zeon } };
  g.war.begin(cfg);
  const zs = { x: -10, z: 60, engaged: false, n: 0 };
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; g.crowd.spawn(zs.x + Math.sin(a) * 3.5, zs.z + Math.cos(a) * 3.5, { gun: i === 0, squad: zs }); }
  g.war.fedSquad(10, 60, n, false);
  let t = 0, first = null;
  const log = [];
  quiet(() => {
    for (; t < secs; t++) {
      for (let k = 0; k < 60; k++) { park(150, -150); tick(); }
      if (t % 30 === 0) log.push([t, g.crowd.count, g.allies.count]);
      if (first === null && (g.crowd.count < n || g.allies.count < n)) first = t;
      if (!g.crowd.count || !g.allies.count) break;
    }
  });
  return { secs: t, firstKO: first, zaku: g.crowd.count, gm: g.allies.count, log };
}

// skipPlaza: go straight to the landing zones. at: where the pilot is parked. take: zones the pilot takes a minute in
// (their squad leader and half their garrison felled by the pilot), to watch Zeon try to take them back.
export function campaign(minutes = 10, { skipPlaza = true, at = [175, -175], every = 30, take = [] } = {}) {
  const g = game;
  g.start({ training: false });
  const rows = [];
  let simMs = 0, frames = 0;
  quiet(() => {
    for (let i = 0; i < 400 && g.hero.state === 'intro'; i++) tick();
    if (skipPlaza && g.stage.phase === 'plaza') {
      // as if the pilot had cleared the plaza: its Zeon garrison is gone
      for (const e of [...g.crowd.list]) if (Math.hypot(e.x, e.z) < 48) g.crowd.remove(e);
      g.stage.plazaKos = 999;
      g.stage.startBases();
    }
    for (let s = 0; s < minutes * 60; s++) {
      for (let k = 0; k < 60; k++) {
        park(at[0], at[1]);
        g.cutsceneT = 0;
        const a = performance.now();
        tick();
        simMs += performance.now() - a;
        frames++;
      }
      if (s === 60) {
        for (const lz of g.lz.list) {
          if (!take.includes(lz.name) || !lz.captain?.alive) continue;
          const near = g.crowd.list.filter((e) => Math.hypot(e.x - lz.x, e.z - lz.z) < 35);
          near.slice(0, near.length >> 1).forEach((e) => g.crowd.remove(e));
          lz.captain.damage(1e5, 6, 6, lz.x, lz.z, 0, { sp: true });
        }
      }
      if (s % every === 0) {
        const w = g.war;
        rows.push({
          t: s, phase: g.stage.phase, zeon: g.crowd.count, gm: g.allies.count,
          fields: w.fields.map((f) => `${f.name[0]}:${f.owner === 'fed' ? 'F' : f.owner === 'zeon' ? 'Z' : '-'}${f.owner === 'fed' ? (f.captain ? '+' : '0') : f.lz?.captain?.alive ? `+${Math.round(f.lz.captain.hp)}` : ''}/${f.own}v${f.hostile}`).join(' '),
          cols: w.columns.map((c) => `${c.team[0]}${c.n}>${c.target?.name[0] ?? '?'}${c.march ? '~' : ''}`).join(' '),
        });
      }
      if (g.mode !== 'play') break;
    }
  });
  return { rows, events: g.war.stats.events, stats: { ...g.war.stats, events: undefined }, msPerFrame: +(simMs / frames).toFixed(3), zones: g.stage.zonesTaken };
}

// zaku/gm: the squads' sizes. captain: a Zeon squad leader at its post beside the fight. officer: an officer or Char
// ('denim', 'gene', 'char') there instead. hits: the pilot lands a blow on the commander every two seconds, as a pilot
// duelling it would (it stays on the pilot while it does). at: how far the pilot is parked from the Zeon squad.
export function brawl(secs = 90, { zaku = 10, gm = 6, captain = true, officer = null, hits = false, at = 10 } = {}) {
  const g = game;
  g.start({ training: false });
  quiet(() => { for (let i = 0; i < 400 && g.hero.state === 'intro'; i++) tick(); });
  g.crowd.clear(); g.allies.clear(); g.commanders.clear(); g.projectiles.clear();
  g.stage.phase = 'idle'; // no posts, no pods, no production: just the fight
  g.war.begin(JSON.parse(JSON.stringify(WAR)));
  const px = 0, pz = 70 - at;
  park(px, pz);
  const zs = g.stage.garrison(0, 70, zaku, null);
  zs.engaged = true;
  g.war.fedSquad(5, pz - 4, gm, false);
  const cap = captain ? g.commanders.add({ ...officerCfg('captain'), x: 2, z: 74, home: { x: 2, z: 74 } }) : null;
  const off = officer ? g.commanders.add({ ...officerCfg(officer), x: -4, z: 68 }) : null;
  const boss = off || cap, bossHp0 = boss ? boss.hp : 0;
  const c = { pilotSwings: 0, pilotBullets: 0, gmBlows: 0, gmDmg: 0, zakuBlows: 0, zakuDmg: 0 };
  const take0 = g.hero.takeHit;
  g.hero.takeHit = function (dmg, x, z, heavy, kind) { if (kind === 'bullet') c.pilotBullets++; else c.pilotSwings++; return take0.call(this, dmg, x, z, heavy, kind); };
  const wrap = (crowd, key) => {
    const f = crowd.npcHit;
    crowd.npcHit = function (e, ...rest) { const hp0 = e.hp; const ok = f.call(this, e, ...rest); if (ok) { c[key + 'Blows']++; c[key + 'Dmg'] += hp0 - e.hp; } return ok; };
    return () => { crowd.npcHit = f; };
  };
  const unwrap = [wrap(g.allies, 'gm'), wrap(g.crowd, 'zaku')];
  const s = { n: 0, onPilot: 0, onGM: 0, press: 0, pressOnGM: 0, boss: 0, bossOnGM: 0 };
  const rows = [];
  quiet(() => {
    for (let t = 0; t < secs; t++) {
      for (let k = 0; k < 60; k++) {
        park(px, pz);
        g.cutsceneT = 0;
        if (hits && boss && boss.alive && k === 0 && t % 2 === 0) boss.damage(1, 0, 0, boss.pos.x, boss.pos.z + 3, 0, {});
        tick();
        if (k % 20) continue;
        for (const e of g.crowd.list) {
          if (e.state === 'drop' || e.state === 'dying') continue;
          s.n++;
          if (e.foe && e.foe.npc) { s.onGM++; if (e.press) s.pressOnGM++; } else if (e.foe) s.onPilot++;
          if (e.press) s.press++;
        }
        if (boss && boss.alive) { s.boss++; if (boss.npcTarget && boss.npcTarget.alive) s.bossOnGM++; }
      }
      if (t % 15 === 0 || t === secs - 1) rows.push({ t, zaku: g.crowd.count, gm: g.allies.count, boss: boss ? Math.round(boss.hp) : '-', gmHp: Math.round(g.allies.list.reduce((a, e) => a + e.hp, 0)), zakuHp: Math.round(g.crowd.list.reduce((a, e) => a + e.hp, 0)) });
    }
  });
  g.hero.takeHit = take0;
  for (const u of unwrap) u();
  const pct = (a, b) => (b ? +((100 * a) / b).toFixed(1) : 0), perMin = (v) => +((v / secs) * 60).toFixed(1);
  return {
    zakuFoe: { pilotPct: pct(s.onPilot, s.n), gmPct: pct(s.onGM, s.n), pressOnGMPct: pct(s.pressOnGM, s.press) },
    bossOnGMPct: pct(s.bossOnGM, s.boss),
    perMin: { swingsAtPilot: perMin(c.pilotSwings), bulletsAtPilot: perMin(c.pilotBullets), blowsOnGMs: perMin(c.gmBlows), gmHpLost: perMin(c.gmDmg), blowsOnZaku: perMin(c.zakuBlows), zakuHpLost: perMin(c.zakuDmg) },
    perBlow: { onGM: +(c.gmDmg / Math.max(1, c.gmBlows)).toFixed(2), onZaku: +(c.zakuDmg / Math.max(1, c.zakuBlows)).toFixed(2) },
    bossHpLost: boss ? +(bossHp0 - boss.hp).toFixed(1) : null,
    stats: { ...g.war.stats, events: undefined }, rows,
  };
}
