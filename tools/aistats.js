// Dev-only crowd/AI telemetry for bot runs: `const a = await import('/tools/aistats.js'); a.run(3600)` after the harness.
// Counts enemy shots (grunt vs commander), blows landed on the pilot, where grunts stand relative to the pilot, and how
// many enemies each of the pilot's attacks connects with.
const game = window.game;

export function run(frames = 3600, opts = {}) {
  const s = { gruntShots: 0, cmdShots: 0, npcShots: 0, hitsTaken: 0, bulletHits: 0, melee: 0, rings: [0, 0, 0, 0, 0, 0, 0], samples: 0, moves: {}, frames };
  const pj = game.projectiles;
  const bullet = pj.enemyBullet;
  // grunt and commander shots at pilots, and soldiers' bursts at the allied GMs (npc, no aim line, harmless to pilots)
  pj.enemyBullet = function (from, dir, mul = 1, opts) { if (opts?.npc) s.npcShots++; else if (mul === 1) s.gruntShots++; else s.cmdShots++; return bullet.call(this, from, dir, mul, opts); };
  const hero = game.hero;
  const take = hero.takeHit;
  hero.takeHit = function (dmg, x, z, big, kind) {
    const r = take.call(this, dmg, x, z, big, kind);
    if (r) { s.hitsTaken++; if (kind === 'bullet') s.bulletHits++; else s.melee++; }
    return r;
  };
  const strike = game.combat.heroStrike;
  game.combat.heroStrike = function (h, spec, id) {
    const n = strike.call(this, h, spec, id);
    const m = (s.moves[h.moveName] ||= { swings: new Set(), hits: 0, whiffIds: new Set(), hitIds: new Set() });
    m.swings.add(id);
    if (n) { m.hits += n; m.hitIds.add(id); }
    return n;
  };
  const edges = [3, 5, 7, 9, 12, 16, Infinity];
  let i = 0;
  const res = window.bot(frames, {
    ...opts,
    stop: () => {
      if (++i % 30 === 0) {
        const p = game.hero.pos;
        for (const e of game.crowd.list) {
          if (e.state === 'drop' || e.state === 'dying') continue;
          const d = Math.hypot(e.x - p.x, e.z - p.z);
          if (d > 20) continue;
          s.rings[edges.findIndex((x) => d < x)]++;
        }
        s.samples++;
      }
      return opts.stop ? opts.stop() : false;
    },
  });
  pj.enemyBullet = bullet;
  hero.takeHit = take;
  game.combat.heroStrike = strike;
  const min = frames / 3600;
  const moves = {};
  for (const [k, m] of Object.entries(s.moves)) moves[k] = `${m.hitIds.size}/${m.swings.size} connect, ${(m.hits / Math.max(1, m.swings.size)).toFixed(1)} per swing`;
  return {
    state: res,
    perMin: { gruntShots: +(s.gruntShots / min).toFixed(1), cmdShots: +(s.cmdShots / min).toFixed(1), npcShots: +(s.npcShots / min).toFixed(1), hitsTaken: +(s.hitsTaken / min).toFixed(1), bulletHits: +(s.bulletHits / min).toFixed(1), meleeHits: +(s.melee / min).toFixed(1) },
    gruntsWithin: Object.fromEntries(['<3', '3-5', '5-7', '7-9', '9-12', '12-16', '16-20'].map((k, j) => [k, +(s.rings[j] / Math.max(1, s.samples)).toFixed(1)])),
    moves,
  };
}
