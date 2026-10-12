// Grunt crowds: instanced rendering + lightweight squad AI. Two armies share it: Zeon's Zaku II (team 'zeon', the
// pilots' enemies) and the Federation's allied GMs (team 'fed', see war.js). Each soldier fights whatever it has
// picked as its foe: for Zeon the pilot its front rank is on, else a GM in its face or in reach; for a GM the nearest
// Zeon soldier or commander. An enemy soldier is handed to the attack code as a proxy with a pilot's shape (pos,
// alive, state, takeHit), and what a blow between the armies is worth is the war's call (War.scratch).
import * as THREE from 'three';
import { InstancedRig, Clip, makePose, poseFrom, lerpPose, P, RPITCH, RROLL, RYAW } from '../core/rig.js';
import { zakuDef, Z } from '../models/zaku.js';
import { gmDef, GM } from '../models/gm.js';
import { SpatialHash, rand, clamp, angleDamp, wrapAngle, damp } from '../core/util.js';
import { lensClear } from '../core/lensclear.js';
import { gait, gaitSpec, gaitState } from '../core/gait.js';

const MAX = 300;
const GRAV = 30;
const WALK = 3.7;
const AGGRO = 22; // a garrison squad engages when a pilot comes this close
const LEASH = 60; // ...and falls back to its post once every pilot is this far away
const GM_REACH = 14; // a Zaku behind the front rank takes on an allied GM this close (and nearer than the pilot)
const GM_FACE = 4.5; // ...and one of the front rank, a GM that has closed to this on it
const GM_DRAW = 24; // GMs fighting this close to a pilot draw Zaku off its front rank, one each, up to half of it
const BOSS_MELEE = 2; // GMs swinging at a Zeon officer at once; the rest keep a ring round him
const AIM_T = 1.05; // how long a gunner shows its aim line before the burst
const NPC_AIM_T = 0.6; // ...and how long it takes aim at another army's soldier (no line: that one isn't the pilot's)
const PACE = WALK * 0.42; // a soldier at its post mills about at this amble

// Each army's look and voice. eyeY: where a soldier's eye glints when it spots a pilot.
const TEAMS = {
  zeon: { def: () => zakuDef(), explode: [Z.DG, Z.LG, Z.J, 0x2b2e2a], eye: 0xff2f6e, eyeY: 2.95, swing: 'hawk', gun: 'mg' },
  fed: { def: () => gmDef(GM, 1), explode: [GM.W, GM.R, GM.GR, 0x2b2e35], eye: 0x86ff6e, eyeY: 3.5, swing: 'slash_fast', gun: 'spray' },
};
// Who a soldier with no foe is facing: nobody, far away.
const NOBODY = { npc: true, alive: false, state: 'intro', id: 0, pos: { x: 1e5, y: 0, z: 1e5 } };

const ZSTANCE = poseFrom({
  y: -0.05, torso: [0.06, 0, 0], head: [0, 0, 0],
  uArmR: [-0.25, 0, -0.18], fArmR: [-0.55, 0, 0], hand: [0.35, 0, 0],
  uArmL: [-0.1, 0, 0.18], fArmL: [-0.45, 0, 0],
  thighR: [-0.12, 0, -0.06], shinR: [0.22, 0, 0], thighL: [-0.08, 0, 0.06], shinL: [0.18, 0, 0],
});
const GUN_STANCE = poseFrom({
  uArmR: [-0.45, 0, -0.1], fArmR: [-1.0, 0, 0], hand: [1.1, 0, 0],
  uArmL: [-0.7, 0, -0.2], fArmL: [-1.1, 0, 0],
}, ZSTANCE);
const GUN_AIM = poseFrom({
  torso: [0, -0.25, 0], head: [0, 0.2, 0],
  uArmR: [-1.5, 0, 0.1], fArmR: [0, 0, 0], hand: [1.55, 0, 0],
  uArmL: [-1.35, 0, -0.45], fArmL: [-0.5, 0, 0],
  thighR: [-0.4, 0, -0.1], shinR: [0.5, 0, 0], thighL: [0.25, 0, 0.1], shinL: [0.1, 0, 0], y: -0.12,
}, ZSTANCE);
const WINDUP = new Clip([
  { t: 0, p: {} },
  { t: 0.5, p: { torso: [-0.25, -0.35, 0], uArmR: [-2.9, 0, -0.25], fArmR: [-0.5, 0, 0], hand: [0.1, 0, 0], uArmL: [-0.5, 0, 0.4], thighR: [0.2, 0, -0.1], thighL: [-0.4, 0, 0.1], shinL: [0.4, 0, 0], y: -0.08 } },
], ZSTANCE);
const STRIKE = new Clip([
  { t: 0, p: { torso: [-0.25, -0.35, 0], uArmR: [-2.9, 0, -0.25], fArmR: [-0.5, 0, 0], hand: [0.1, 0, 0], uArmL: [-0.5, 0, 0.4], thighR: [0.2, 0, -0.1], thighL: [-0.4, 0, 0.1], shinL: [0.4, 0, 0], y: -0.08 } },
  { t: 0.14, p: { torso: [0.5, 0.25, 0], uArmR: [-0.5, 0, -0.1], fArmR: [-0.1, 0, 0], hand: [0.6, 0, 0], uArmL: [0.2, 0, 0.3], thighR: [-0.7, 0, -0.1], shinR: [0.8, 0, 0], thighL: [0.4, 0, 0.1], shinL: [0.2, 0, 0], y: -0.3 }, e: 'snap' },
  { t: 0.6, p: { torso: [0.35, 0.15, 0], y: -0.22 } },
], ZSTANCE);
// Flinch variants (thrown back / twisted / doubled over), each mirrored: a struck line ripples instead of cloning.
const RECOILS = [
  { torso: [-0.78, 0, 0.06], head: [-0.75, 0, 0], uArmR: [-2.4, 0.2, -0.95], uArmL: [-2.3, -0.2, 1.0], fArmR: [-0.3, 0, 0], fArmL: [-0.3, 0, 0], thighR: [0.32, 0, -0.14], thighL: [-0.6, 0, 0.2], shinR: [0.2, 0, 0], shinL: [1.0, 0, 0], y: -0.12 },
  { torso: [-0.62, 0.55, 0.2], head: [-0.65, -0.35, 0.1], uArmR: [-2.85, 0, -0.35], uArmL: [-0.95, 0, 1.35], thighR: [0.4, 0, -0.18], thighL: [-0.35, 0, 0.3], shinR: [0.35, 0, 0], shinL: [0.7, 0, 0], y: -0.12 },
  { torso: [0.72, 0, 0.1], head: [0.2, 0.25, 0], uArmR: [-1.35, 0, -0.75], uArmL: [-1.25, 0, 0.8], thighR: [-0.55, 0, -0.2], thighL: [-0.2, 0, 0.18], shinR: [1.1, 0, 0], shinL: [0.8, 0, 0], y: -0.3 },
].flatMap((r) => { const a = poseFrom(r, ZSTANCE); return [a, mirrorPose(a)]; });

function mirrorPose(src) {
  const out = Float32Array.from(src);
  const swap = [['uArmR', 'uArmL'], ['fArmR', 'fArmL'], ['thighR', 'thighL'], ['shinR', 'shinL']];
  for (const [a, b] of swap) for (let k = 0; k < 3; k++) { out[P[a] * 3 + k] = src[P[b] * 3 + k]; out[P[b] * 3 + k] = src[P[a] * 3 + k]; }
  for (let i = 0; i < 13; i++) { out[i * 3 + 1] *= -1; out[i * 3 + 2] *= -1; }
  out[RROLL] *= -1; out[RYAW] *= -1;
  return out;
}
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const hash01 = (i, k) => { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };
const TAU = Math.PI * 2;
const AIRPOSE = poseFrom({ torso: [-0.4, 0, 0], head: [-0.5, 0, 0], uArmR: [-2.2, 0, -0.8], fArmR: [-0.3, 0, 0], uArmL: [-2.2, 0, 0.8], fArmL: [-0.3, 0, 0], thighR: [-0.6, 0, -0.2], shinR: [0.9, 0, 0], thighL: [-0.2, 0, 0.2], shinL: [0.5, 0, 0] }, ZSTANCE);
const DOWNPOSE = poseFrom({ pitch: -1.5, torso: [-0.1, 0, 0], head: [-0.3, 0.4, 0], uArmR: [-0.3, 0, -1.1], uArmL: [-0.2, 0, 1.2], thighR: [-0.5, 0, -0.2], shinR: [0.8, 0, 0], thighL: [0, 0, 0.2], shinL: [0.2, 0, 0], y: 0 }, ZSTANCE);
const GETUP = poseFrom({ pitch: 0, torso: [0.6, 0, 0], head: [-0.2, 0, 0], uArmR: [-0.6, 0, -0.4], uArmL: [-0.6, 0, 0.4], thighR: [-1.1, 0, -0.1], shinR: [1.6, 0, 0], thighL: [-0.4, 0, 0.2], shinL: [1.2, 0, 0], y: -0.55 }, ZSTANCE);
const SPAWN_POSE = poseFrom({ thighR: [-0.7, 0, -0.1], shinR: [1.1, 0, 0], thighL: [-0.2, 0, 0.1], shinL: [0.5, 0, 0], uArmR: [-0.3, 0, -0.6], uArmL: [-0.3, 0, 0.6] }, ZSTANCE);

const HIT_GOLD = [1.0, 0.6, 0.12], HIT_AMBER = [1.0, 0.4, 0.07], HIT_KILL = [1.2, 0.25, 0.12];
const CAPTAIN_TINT = [0.9, 1.0, 1.12]; // an allied squad leader reads a shade bluer than its men

// What a soldier looks like to the other army: the shape the attack code expects of a pilot.
function proxyOf(crowd, g) {
  return {
    npc: true, unit: g,
    get id() { return g.id; },
    pos: { get x() { return g.x; }, get y() { return g.y; }, get z() { return g.z; } },
    get alive() { return g.alive && g.hp > 0 && g.state !== 'dying'; },
    get state() { return g.state === 'drop' || g.state === 'held' ? 'intro' : 'idle'; },
    takeHit: (dmg, x, z, heavy, kind) => crowd.npcHit(g, dmg, x, z, heavy, kind === 'officer'),
  };
}

export class Crowd {
  constructor(game, team = 'zeon', max = MAX) {
    this.game = game;
    this.team = team;
    this.look = TEAMS[team];
    this.max = max;
    this.def = this.look.def();
    this.rig = new InstancedRig(this.def, max, game.scene);
    // the mech gait: a trudging walk that stretches into a run at the charge; gunners keep both hands on the gun
    this.gait = gaitSpec(this.def, WALK * 1.7, { stride: 1.4, impact: 0.045, sway: 0.045, lat: 0.04, lean: 0.24, arm: [0.12, 0.16], inertia: 0 });
    this.gaitGun = { ...this.gait, arm: [0, 0], carry: [0, 0, 0, 0, 0] };
    lensClear(this.rig.mat);
    this.list = [];
    this.pool = [];
    for (let i = 0; i < max; i++) this.pool.push(this.makeGrunt(i));
    this.grid = new SpatialHash(3);
    this.tmp = [];
    this.tmp2 = [];
    this.foes = null; // the other army's crowd (main.js pairs them up)
    this.meleeTokens = 0;
    this.gunTokens = 0;
    this.bossMelee = 0; // GMs in on a Zeon officer (BOSS_MELEE)
    this.gmNear = 0; // GMs beside the pilots (Zeon: assignPress counts them, and the front rank thins for them)
    this.maxMelee = 3;
    this.maxGun = 1;
    this.nextVolley = 0; // game time before which no gunner may start another aim (shooting is rare, as in Reborn)
    this.boomBudget = 0;
    this.feintUntil = 0;
    this.pressT = 0;
    this._cand = [];
    this._v = new THREE.Vector3();
    this._fw = new THREE.Vector3();
    this._rt = new THREE.Vector3();
    this._up = new THREE.Vector3();
    this._r = [0, 0];
    this.serial = 0;
  }

  makeGrunt(i) {
    const g = {
      i, alive: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, hp: 60, maxHp: 60,
      state: 'idle', t: 0, gs: gaitState(), gun: false, cd: 0, token: 0, flash: 0, paceT: 0, wx: null, wz: 0, pacing: false,
      hitIds: [0, 0, 0, 0], hitCursor: 0, ringA: 0, ringR: 6, spin: 0, pitch: 0, roll: 0, aimYaw: 0, aimY: 0,
      pose: makePose(), scale: 1, radius: 0.95, fade: 1, dieT: 0, spawnVy: 0, fired: 0, think: 0, lastHitT: -9,
      kind: 'grunt', height: 3.1, staggerAlt: false, aggro: rand(0.6, 1.2),
      squad: null, slotX: 0, slotZ: 0, press: false, outerR: 13,
      foe: null, foeId: 0, seekT: 0, byNpc: false, captain: false, npcAim: false,
    };
    g.proxy = proxyOf(this, g);
    return g;
  }

  get count() {
    return this.list.length;
  }

  // squad: { x, z, engaged, n, base?, post?, rally? } — garrisons hold their post around (x, z) until a pilot comes near.
  // Marching squads (war.js) also carry `march`, and their anchor (x, z) walks the route.
  spawn(x, z, { gun = false, drop = false, yaw = 0, hp = 50, squad = null, captain = false } = {}) {
    const g = this.pool.pop();
    if (!g) return null;
    g.alive = true;
    g.id = ++this.serial;
    g.x = x; g.z = z; g.y = drop ? rand(18, 30) : 0;
    g.vx = g.vz = 0;
    g.vy = drop ? -rand(10, 16) : 0;
    g.yaw = yaw;
    g.hp = g.maxHp = hp * (this.team === 'zeon' ? this.game.difficulty.enemyHp : 1);
    g.gun = gun;
    g.captain = captain;
    g.state = drop ? 'drop' : 'idle';
    g.t = 0;
    g.cd = gun ? rand(3, 8) : rand(0.5, 2.5);
    g.token = 0;
    g.flash = 0;
    g.fade = 1;
    g.pitch = g.roll = g.spin = 0;
    g.pitchRate = 0; g.pitchTarget = 0; g.shudder = 0; g.hitKind = 0; g.feint = false; g.bounced = false;
    g.hitIds.fill(0);
    g.ringA = rand(0, Math.PI * 2);
    // Reborn's mobs pack in around the pilot: the front rank at arm's length, the rest a body or two behind them
    // (1-3 suit heights), gunners on the rim of the crowd
    g.ringR = gun ? rand(9, 13) : rand(3.4, 5.4);
    g.outerR = rand(5.8, 9.6);
    g.press = false;
    g.squad = squad;
    if (squad) {
      squad.n++;
      g.slotX = x - squad.x;
      g.slotZ = z - squad.z;
    }
    g.think = rand(0, 0.5);
    g.seekT = rand(0, 0.4);
    g.foe = null;
    g.foeId = 0;
    g.byNpc = false;
    g.npcAim = false;
    g.wx = null;
    g.gs.amp = 0;
    g.gs.ph = rand(0, 6);
    g.dieT = 0;
    g.scale = captain ? 1.12 : rand(0.97, 1.04);
    g.aggro = rand(0.6, 1.3);
    this.list.push(g);
    return g;
  }

  remove(g) {
    g.alive = false;
    g.foe = null;
    this.releaseToken(g);
    if (g.squad) { g.squad.n--; g.squad = null; }
    const idx = this.list.indexOf(g);
    if (idx >= 0) {
      this.list[idx] = this.list[this.list.length - 1];
      this.list.pop();
    }
    this.pool.push(g);
  }

  clear() {
    while (this.list.length) this.remove(this.list[0]);
    this.meleeTokens = this.gunTokens = this.bossMelee = 0;
  }

  releaseToken(g) {
    if (g.token === 1) this.meleeTokens--;
    if (g.token === 2) this.gunTokens--;
    if (g.token === 3) this.bossMelee--;
    g.token = 0;
  }

  alreadyHit(g, id) {
    return g.hitIds.includes(id);
  }

  // Called by combat when the hero's attack connects (and, with opts.npc, by npcHit for another army's blow).
  damage(g, dmg, kb, up, fromX, fromZ, id, opts = {}) {
    if (!g.alive || g.state === 'dying' || g.state === 'held') return false;
    if (id && this.alreadyHit(g, id)) return false;
    if (id) {
      g.hitIds[g.hitCursor] = id;
      g.hitCursor = (g.hitCursor + 1) & 3;
    }
    const game = this.game;
    g.hp -= dmg;
    g.byNpc = !!opts.npc; // whose blow it was decides whose KO it is
    const heavy = up > 6 || kb > 8.5 || !!opts.big;
    g.flash = opts.npc ? 0.6 : 1;
    g.hitKind = g.hp <= 0 ? 2 : heavy ? 1 : 0;
    g.shudder = 0.05; // victims hold for ~3 frames, then the reaction carries the weight
    g.lastHitT = game.time;
    // an allied squad leader shrugs off the enemy's soldiers (it only falls to them, slowly)
    if (opts.npc && g.captain && g.hp > 0) return true;
    this.releaseToken(g);
    if (g.squad && !opts.npc) g.squad.engaged = true; // another army's blow isn't the pilots' fight
    let dx = g.x - fromX, dz = g.z - fromZ;
    const l = Math.hypot(dx, dz) || 1;
    dx /= l; dz /= l;
    if (opts.pull) { dx = -dx * 0.5; dz = -dz * 0.5; kb = opts.pull; }
    g.yaw = Math.atan2(-dx, -dz);
    // lens cut: bodies blown straight at the camera swing ~75 degrees sideways
    const cam = game.camera.cam.position, h = game.local.pos;
    let cx = cam.x - h.x, cz = cam.z - h.z;
    const cl = Math.hypot(cx, cz) || 1;
    cx /= cl; cz /= cl;
    if (dx * cx + dz * cz > 0.55) {
      const side = dx * cz - dz * cx >= 0 ? 1 : -1, a = 1.3 * side;
      const nx = dx * Math.cos(a) - dz * Math.sin(a), nz = dx * Math.sin(a) + dz * Math.cos(a);
      dx = nx; dz = nz;
    }
    const airborne = g.state === 'air' || g.y > 0.3;
    if (up > 0 || kb > 7.5 || airborne || g.hp <= 0) {
      const ko = g.hp <= 0;
      g.state = 'air';
      g.t = 0;
      g.bounced = false;
      let hf = ko ? Math.max(kb, 8) * 1.35 : kb;
      if (opts.radial) hf *= 0.45; // radial launchers send bodies up, not out
      g.vx = dx * hf;
      g.vz = dz * hf;
      const lift = ko ? Math.max(up, 7.5) : up > 0 ? up : kb > 7.5 ? 5 : 3.5;
      g.vy = airborne ? Math.min(Math.max(g.vy, 0) + lift * 0.6, 9) : lift;
      // plan the tumble so bodies touch down already lying on their backs (KOs cartwheel 450 degrees)
      const flight = (2 * g.vy) / GRAV * 1.25 + Math.sqrt((2 * g.y) / GRAV);
      g.pitchTarget = ko ? -(Math.PI / 2 + TAU) : -Math.PI / 2;
      if (airborne) g.pitchTarget = Math.min(g.pitch, g.pitchTarget);
      g.pitchRate = (g.pitchTarget - g.pitch) / Math.max(0.3, flight);
    } else {
      g.state = 'stagger';
      g.t = 0;
      g.vx = dx * kb;
      g.vz = dz * kb;
      g.staggerAlt = !g.staggerAlt;
    }
    return true;
  }

  // A blow from the other army's soldier or commander (officer: a Zeon commander's, worth more): what the war says
  // it's worth (War.scratch), and a flinch.
  npcHit(g, dmg, fromX, fromZ, heavy = false, officer = false) {
    if (!g.alive || g.hp <= 0 || g.state === 'dying' || g.state === 'held' || g.state === 'drop') return false;
    const k = this.game.war.scratch(this.team === 'fed' ? 'zeon' : 'fed', { leader: g.captain, officer });
    const ok = this.damage(g, dmg * k, heavy ? 6 : 2.5, 0, fromX, fromZ, 0, { npc: true });
    if (ok && this.heard(g, 45)) {
      this.game.fx.sparks(this._v.set(g.x, g.y + 1.8, g.z), 3, 0xffc070, 6);
      this.game.audio.play('hit', { vol: 0.22, pitch: rand(0.9, 1.1), at: this._v });
    }
    return ok;
  }

  kill(g) {
    g.state = 'dying';
    g.t = 0;
    g.dieT = rand(0.35, 0.7);
  }

  // Grabs: a pilot takes hold of a soldier (it stops fighting and goes where the hands put it), then lets go.
  hold(g, holder) {
    this.releaseToken(g);
    g.state = 'held';
    g.holder = holder;
    g.byNpc = false;
    g.t = 0;
    g.vx = g.vy = g.vz = 0;
    g.flash = 1;
    g.hitKind = 1;
    g.shudder = 0;
    if (g.squad) g.squad.engaged = true;
  }

  place(g, x, y, z, yaw, pitch) {
    g.x = x; g.y = y; g.z = z;
    g.yaw = yaw;
    g.pitch = pitch;
  }

  // Let go with a velocity (a throw, or just dropping it): the body tumbles and lands on its back like a launch.
  fling(g, vx, vy, vz, dmg = 0, big = false) {
    if (!g.alive || g.state !== 'held') return;
    g.holder = null;
    g.hp -= dmg;
    g.flash = dmg ? 1 : 0;
    g.hitKind = g.hp <= 0 ? 2 : big ? 1 : 0;
    g.state = 'air';
    g.t = 0;
    g.bounced = false;
    g.vx = vx; g.vy = vy; g.vz = vz;
    if (Math.hypot(vx, vz) > 0.5) g.yaw = Math.atan2(-vx, -vz);
    const flight = (2 * Math.max(0, vy)) / GRAV * 1.25 + Math.sqrt((2 * Math.max(0, g.y)) / GRAV);
    g.pitchTarget = g.hp <= 0 ? -(Math.PI / 2 + TAU) : -Math.PI / 2;
    g.pitchTarget = Math.min(g.pitch, g.pitchTarget);
    g.pitchRate = (g.pitchTarget - g.pitch) / Math.max(0.3, flight);
    if (dmg) g.lastHitT = this.game.time;
  }

  explodeGrunt(g) {
    const game = this.game;
    const p = this._v.set(g.x, g.y + 1.7, g.z);
    game.fx.explode(p, rand(1.35, 1.6), this.look.explode);
    if (this.boomBudget > 0 && this.heard(g, 70)) {
      this.boomBudget--;
      game.audio.play('boom', { vol: 0.95, pitch: rand(0.85, 1.05), at: p });
      // a suit going up right next to you rocks the view a little
      const h = game.local.pos, d = Math.hypot(g.x - h.x, g.z - h.z);
      if (d < 10) game.camera.shake(0.07 * (1 - d / 10));
    }
    // only a pilot's KO counts for the pilots (the KO count, the plaza, drops); the armies keep their own tally
    if (this.team === 'fed' || g.byNpc) game.war?.onSoldierDown(this, g);
    else game.onGruntKilled(g);
    this.remove(g);
  }

  // The next spot a soldier at its post ambles to: a few steps off its slot, never further from the squad's centre
  // than its slot plus a step, and never into a building or onto a comrade. Some turns it stays put. The first pick
  // after it takes the post just waits a while, so a squad doesn't set off in step.
  pace(g) {
    const first = g.wx === null;
    g.paceT = first ? rand(0.5, 8) : rand(4, 9);
    g.pacing = false;
    if (first) g.wx = g.wz = 0;
    if (first || Math.random() < 0.25) return;
    const R = Math.max(4, Math.hypot(g.slotX, g.slotZ) + 1.2);
    for (let tries = 0; tries < 3; tries++) {
      const a = rand(0, TAU), r = rand(0.8, 2.6);
      let ox = g.slotX + Math.sin(a) * r, oz = g.slotZ + Math.cos(a) * r;
      const ol = Math.hypot(ox, oz);
      if (ol > R) { ox *= R / ol; oz *= R / ol; }
      const x = g.squad.x + ox, z = g.squad.z + oz;
      if (this.game.world.blocked(x, z, 1.2) || this.grid.query(x, z, 2.4, this.tmp).some((o) => o !== g && Math.hypot(o.x - x, o.z - z) < 2.4)) continue;
      g.wx = ox - g.slotX;
      g.wz = oz - g.slotZ;
      g.pacing = true;
      return;
    }
  }

  nearestPlayer(g) {
    let d = Infinity;
    for (const p of this.game.players) if (p.alive) d = Math.min(d, Math.hypot(p.pos.x - g.x, p.pos.z - g.z));
    return d;
  }

  // Is a pilot close enough to hear (and see) this soldier? Fights nobody is near stay quiet.
  heard(g, r) {
    for (const p of this.game.players) if (Math.abs(p.pos.x - g.x) + Math.abs(p.pos.z - g.z) < r * 1.3 && Math.hypot(p.pos.x - g.x, p.pos.z - g.z) < r) return true;
    return false;
  }

  // Each grunt chases the nearest pilot, sticking with its current one unless the other is much closer.
  targetFor(g, players) {
    if (players.length === 1) return players[0];
    let cur = players[g.target || 0];
    if (!cur) cur = players[0];
    const dc = cur.alive ? Math.hypot(cur.pos.x - g.x, cur.pos.z - g.z) : 1e9;
    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      if (p === cur || !p.alive || p.state === 'intro') continue;
      if (Math.hypot(p.pos.x - g.x, p.pos.z - g.z) < dc * 0.7) { g.target = i; return p; }
    }
    return cur;
  }

  // Pick this soldier's foe. Zeon: with a pilot close (or its squad fighting one) the front rank stays on the pilot
  // unless a GM has closed in on it (GM_FACE), a gunner unless a GM is nearer, and the rest of the ring turns on a GM
  // that has come nearer than the pilot and within GM_REACH; with no pilot about, any enemy soldier in reach. A GM:
  // the nearest Zeon soldier or commander in reach, or nobody.
  seek(g, players, war) {
    const npc = war ? war.foeFor(this, g) : null;
    if (this.team !== 'zeon') { this.setFoe(g, npc); return; }
    const p = this.targetFor(g, players);
    if (!npc) { this.setFoe(g, p); return; }
    const pd = p.alive && p.state !== 'intro' ? Math.hypot(p.pos.x - g.x, p.pos.z - g.z) : Infinity;
    const nd = Math.hypot(npc.pos.x - g.x, npc.pos.z - g.z);
    const sq = g.squad;
    const onPilot = pd < AGGRO || (sq && sq.engaged && pd < 34);
    const stay = g.press ? nd > GM_FACE || pd <= nd : g.gun ? pd <= nd : nd > GM_REACH || pd <= nd;
    this.setFoe(g, onPilot && stay ? p : npc);
  }

  setFoe(g, foe) {
    g.foe = foe;
    g.foeId = foe ? foe.id ?? 0 : 0;
    if (foe && foe.npc && g.squad) this.game.war?.sighted(g.squad);
  }

  update(dt) {
    const game = this.game;
    const players = game.players;
    const war = game.war?.active ? game.war : null;
    const foes = war && this.foes && this.foes.count ? this.foes : null;
    this.boomBudget = Math.min(6, this.boomBudget + dt * 18);
    this.grid.clear();
    for (const g of this.list) this.grid.insert(g, g.x, g.z);
    // with GMs in the fight beside the pilots, one fewer Zaku swings at a pilot at a time
    const tokenScale = game.difficulty.aggression * players.length;
    const melee = this.maxMelee * tokenScale - (this.gmNear >= 4 ? 1 : 0);
    if (this.team === 'zeon') this.assignPress(dt, players);

    for (let n = 0; n < this.list.length; n++) {
      const g = this.list[n];
      g.flash = Math.max(0, g.flash - dt * 5);
      if (g.shudder > 0) { g.shudder -= dt; continue; }
      g.t += dt;
      g.cd -= dt;
      // who it fights: re-picked a few times a second between attacks, kept through one
      if (g.state === 'idle' || g.state === 'approach') {
        g.seekT -= dt;
        if (g.seekT <= 0) { g.seekT = rand(0.3, 0.55); this.seek(g, players, war); }
      }
      let hero = g.foe;
      if (hero && hero.npc && (!hero.alive || hero.id !== g.foeId)) {
        // the enemy soldier it was on is gone: an attack begun on it is called off, not swung at whoever is next (a
        // swing that has already landed, and a burst already begun, play out: they can't reach anyone else)
        hero = g.foe = null;
        if (g.state === 'charge' || g.state === 'windup' || g.state === 'aim' || (g.state === 'strike' && g.t < 0.1)) {
          this.releaseToken(g);
          g.state = 'idle';
          g.t = 0;
          g.cd = rand(0.6, 1.2);
          g.seekT = 0;
        }
      }
      if (!hero) hero = this.team === 'zeon' ? this.targetFor(g, players) : NOBODY;
      const npc = !!hero.npc;
      const hx = hero.pos.x, hz = hero.pos.z;
      const heroTargetable = hero.alive && hero.state !== 'intro';
      const dx = hx - g.x, dz = hz - g.z;
      const dist = Math.hypot(dx, dz);
      const toHero = Math.atan2(dx, dz);

      switch (g.state) {
        case 'drop': {
          g.vy = -Math.max(4, Math.min(20, g.y * 1.4));
          g.y += g.vy * dt;
          if (Math.random() < 0.6) {
            game.fx.thruster(this._v.set(g.x, g.y + 1.8, g.z - 0.4), { x: 0, y: -1, z: -0.3 }, 0xffb070, 1.1);
          }
          if (g.y <= 0) {
            g.y = 0;
            g.vy = 0;
            g.state = 'idle';
            g.t = 0;
            if (this.heard(g, 90)) game.fx.dust(this._v.set(g.x, 0.1, g.z), 6, 1);
          }
          break;
        }
        case 'idle':
        case 'approach': {
          g.think -= dt;
          const sq = g.squad;
          // garrison: hold the post (a column: keep formation on the march) until a pilot comes close, or an enemy
          // soldier is in reach
          if (sq && !sq.engaged && !(npc && heroTargetable)) {
            if (!npc && heroTargetable && dist < AGGRO) { sq.engaged = true; this.alert(g); }
            else { this.keepPost(g, sq, dt, dist, toHero); break; }
          }
          if (npc && !heroTargetable) {
            // nobody to fight and no post to keep: stand
            g.vx = damp(g.vx, 0, 4, dt);
            g.vz = damp(g.vz, 0, 4, dt);
            g.state = 'idle';
            break;
          }
          // decide on an attack when close and a token is free (only the front rank presses in)
          if (heroTargetable && g.cd <= 0 && g.think <= 0) {
            g.think = rand(0.2, 0.5);
            if (npc) {
              // another army's soldier: no tokens, no aim line, just a steady exchange of blows. A Zeon officer: a
              // couple of GMs step in to swing at a time, the rest keep a ring round him
              const boss = !!hero.officer;
              if (!g.gun && dist < (boss ? 7.5 : 7) && (!boss || this.bossMelee < BOSS_MELEE)) {
                if (boss) { g.token = 3; this.bossMelee++; }
                g.state = 'charge';
                g.t = 0;
                break;
              }
              if (g.gun && dist < 20 && dist > 4) { this.startAim(g, hero, dist, toHero, true); break; }
            } else if (!g.gun && g.press && dist < 11 && this.meleeTokens < melee) {
              g.token = 1;
              this.meleeTokens++;
              g.state = 'charge';
              g.t = 0;
              break;
            } else if (g.gun && dist < 22 && dist > 6 && this.gunTokens < this.maxGun * tokenScale && game.time >= this.nextVolley) {
              // one gunner at a time, a few seconds apart: it paints a red aim line, then fires a short burst down it
              g.token = 2;
              this.gunTokens++;
              this.nextVolley = game.time + rand(5, 8) / (game.difficulty.aggression * Math.sqrt(players.length));
              this.startAim(g, hero, dist, toHero, false);
              break;
            }
          }
          // steer toward a ring slot around the hero: the front rank close in, the rest watch from further out
          // (another army's soldier: straight into sword's reach, gunners a few lengths off; a Zeon officer: a ring
          // a couple of lengths off unless it's this one's turn to step in)
          const R = npc ? (g.gun ? 10 : hero.officer && g.token !== 3 ? 6.5 : 3.2) : g.gun || g.press ? g.ringR : g.outerR;
          let tx, tz;
          if (dist > 34) { tx = hx; tz = hz; }
          else {
            // the slot follows each soldier's own bearing (with a slow sidestep) so they close in radially
            // instead of cutting across the hero to a slot on the far side
            g.ringA = angleDamp(g.ringA, Math.atan2(g.x - hx, g.z - hz), 1.5, dt) + dt * 0.08 * (g.i % 2 ? 1 : -1);
            tx = hx + Math.sin(g.ringA) * R;
            tz = hz + Math.cos(g.ringA) * R;
          }
          let mx = tx - g.x, mz = tz - g.z;
          const ml = Math.hypot(mx, mz);
          // close to the ring but never back away from an advancing pilot: gunners plant their feet and shoot
          const inside = dist <= 34 && dist < R + 0.5;
          const speed = ml > 1.2 && !inside ? WALK * (dist > 34 ? 1.3 : 1) : 0;
          if (ml > 0.01) { mx /= ml; mz /= ml; }
          g.vx = damp(g.vx, mx * speed, 4, dt);
          g.vz = damp(g.vz, mz * speed, 4, dt);
          g.state = speed > 0 ? 'approach' : 'idle';
          const face = dist < 20 ? toHero : Math.atan2(g.vx, g.vz);
          g.yaw = angleDamp(g.yaw, face, 5, dt);
          break;
        }
        case 'charge': {
          // close in for a heat hawk swing
          const want = 2.6;
          const sp = dist > want ? WALK * (npc ? 1.25 : 1.7) : 0;
          g.vx = damp(g.vx, (dx / (dist || 1)) * sp, 8, dt);
          g.vz = damp(g.vz, (dz / (dist || 1)) * sp, 8, dt);
          g.yaw = angleDamp(g.yaw, toHero, 10, dt);
          if (dist <= want + 0.4) { g.state = 'windup'; g.t = 0; }
          if (g.t > 3.5 || !heroTargetable) { this.releaseToken(g); g.state = 'idle'; g.cd = rand(1, 2); }
          break;
        }
        case 'windup': {
          g.vx = damp(g.vx, 0, 10, dt);
          g.vz = damp(g.vz, 0, 10, dt);
          g.yaw = angleDamp(g.yaw, toHero, 5, dt);
          // telegraph: a star glints on the raised heat hawk; red means the blow will really land
          const T = 0.9 / game.difficulty.speed;
          if (!npc && g.t >= T - 0.3 && g.t - dt < T - 0.3) {
            g.feint = game.time < this.feintUntil;
            const fx = Math.sin(g.yaw), fz = Math.cos(g.yaw);
            game.fx.glint(this._v.set(g.x - fx * 0.5 - fz * 0.6, 4.4, g.z - fz * 0.5 + fx * 0.6), g.feint ? 0xffffff : 0xff3040);
          }
          if (npc) g.feint = false;
          if (g.t >= T) {
            g.state = 'strike';
            g.t = 0;
            if (!npc || this.heard(g, 45)) game.audio.play(this.look.swing, { vol: npc ? 0.2 : 0.35, at: this._v.set(g.x, 1, g.z) });
          }
          break;
        }
        case 'strike': {
          if (g.t >= 0.1 && g.t - dt < 0.1) {
            // hit check: in front and close
            const fx = Math.sin(g.yaw), fz = Math.cos(g.yaw);
            const dot = (dx * fx + dz * fz) / (dist || 1);
            // after a blow lands the ring feints for a few seconds: pressure without a chip-damage grind
            const blow = (16 + rand(0, 7)) * (g.captain ? 1.5 : 1); // a GM squad leader hits harder than its men
            if (!g.feint && dist < 3.6 && dot > 0.35 && hero.pos.y < 2.5 && hero.takeHit(blow, g.x, g.z, false) && !npc) {
              this.feintUntil = game.time + rand(2.5, 4) / game.difficulty.aggression;
            }
            const lunge = g.feint ? 1.5 : npc ? 3 : 5; // feints stop short
            g.vx = Math.sin(g.yaw) * lunge;
            g.vz = Math.cos(g.yaw) * lunge;
          }
          g.vx = damp(g.vx, 0, 6, dt);
          g.vz = damp(g.vz, 0, 6, dt);
          if (g.t >= 0.8) { this.releaseToken(g); g.state = 'idle'; g.cd = npc ? rand(2, 3.6) : rand(2.6, 4.8) / g.aggro; }
          break;
        }
        case 'aim': {
          // the burst goes down the painted line: step out of it
          g.vx = damp(g.vx, 0, 8, dt);
          g.vz = damp(g.vz, 0, 8, dt);
          g.yaw = angleDamp(g.yaw, g.aimYaw, 14, dt);
          if (g.t > (g.npcAim ? NPC_AIM_T : AIM_T)) { g.state = 'fire'; g.t = 0; g.fired = 0; }
          break;
        }
        case 'fire': {
          const shots = 3;
          if (g.fired < shots && g.t >= g.fired * 0.13) {
            g.fired++;
            const fx = Math.sin(g.aimYaw), fz = Math.cos(g.aimYaw);
            const from = this._v.set(g.x + fx * 1.9 - fz * 0.62, 2.35, g.z + fz * 1.9 + fx * 0.62);
            const a = g.aimYaw + rand(-0.025, 0.025);
            const dir = new THREE.Vector3(Math.sin(a), g.aimY, Math.cos(a)).normalize();
            if (this.team === 'zeon') game.projectiles.enemyBullet(from, dir, 1, { npc: g.npcAim, fx: !g.npcAim || this.heard(g, 70) });
            else game.projectiles.allyBullet(from, dir, this.heard(g, 70));
          }
          if (g.t > 0.7) { this.releaseToken(g); g.state = 'idle'; g.cd = g.npcAim ? rand(5, 8) : rand(9, 14) / g.aggro; }
          break;
        }
        case 'stagger': {
          g.vx = damp(g.vx, 0, 7, dt);
          g.vz = damp(g.vz, 0, 7, dt);
          if (g.hp <= 0) this.kill(g);
          else if (g.t > 0.48) { g.state = 'idle'; g.cd = Math.max(g.cd, 0.6); }
          break;
        }
        case 'air': {
          g.vy -= GRAV * (Math.abs(g.vy) < 1.8 ? 0.5 : 1) * dt; // apex hang
          g.y += g.vy * dt;
          g.pitch += g.pitchRate * dt;
          if ((g.pitchRate < 0 && g.pitch < g.pitchTarget) || (g.pitchRate > 0 && g.pitch > g.pitchTarget)) g.pitch = g.pitchTarget;
          if (g.y <= 0 && g.vy < 0) {
            g.y = 0;
            g.pitch = g.pitchTarget;
            if (this.heard(g, 90)) game.fx.dust(this._v.set(g.x, 0.1, g.z), 4, 0.9);
            if (!g.bounced && g.vy < -3) {
              g.bounced = true;
              g.vy = Math.min(2.8, -g.vy * 0.28);
              g.pitchRate = 0;
              g.vx *= 0.5;
              g.vz *= 0.5;
              break;
            }
            g.vy = 0;
            g.vx *= 0.3;
            g.vz *= 0.3;
            g.pitch = 0;
            if (g.hp <= 0) this.kill(g);
            else { g.state = 'down'; g.t = 0; }
          }
          break;
        }
        case 'down': {
          g.vx = damp(g.vx, 0, 5, dt);
          g.vz = damp(g.vz, 0, 5, dt);
          if (g.t > 1.0) { g.state = 'getup'; g.t = 0; }
          break;
        }
        case 'getup': {
          if (g.t > 0.5) { g.state = 'idle'; g.cd = rand(1.2, 2.4); }
          break;
        }
        case 'held': {
          if (!g.holder || g.holder.held !== g) this.fling(g, 0, 1, 0, 0); // the holder was interrupted
          break;
        }
        case 'dying': {
          g.vx = damp(g.vx, 0, 4, dt);
          g.vz = damp(g.vz, 0, 4, dt);
          if (g.y > 0) { g.vy -= GRAV * dt; g.y = Math.max(0, g.y + g.vy * dt); }
          g.flash = 0.5 + 0.5 * Math.sin(g.t * 50);
          if (Math.random() < dt * 14 && this.heard(g, 90)) game.fx.sparks(this._v.set(g.x + rand(-0.6, 0.6), g.y + rand(1, 2.6), g.z + rand(-0.6, 0.6)), 4, 0xffc060, 7);
          if (g.t >= g.dieT) { this.explodeGrunt(g); n--; continue; }
          break;
        }
      }

      // separation (from comrades and the other army's soldiers) + hero push
      if (g.state !== 'air' && g.state !== 'drop' && g.state !== 'held') {
        this.separate(g, this.grid, 2.3, false);
        if (foes) this.separate(g, foes.grid, 2.2, true);
        for (const pl of players) {
          if (!pl.alive || pl.pos.y > 2.5) continue;
          const px = pl.pos.x - g.x, pz = pl.pos.z - g.z;
          const pd = Math.hypot(px, pz), min = g.radius + pl.radius;
          if (pd < min && pd > 1e-4) {
            g.x -= (px / pd) * (min - pd);
            g.z -= (pz / pd) * (min - pd);
          }
        }
      }
      g.x += g.vx * dt;
      g.z += g.vz * dt;
      const r = game.world.resolve(g.x, g.z, g.radius, this._r);
      g.x = r[0];
      g.z = r[1];
    }
    // commanders also shove grunts
    for (const c of game.commanders.list) {
      if (!c.alive) continue;
      const near = this.grid.query(c.pos.x, c.pos.z, 2.5, this.tmp);
      for (const g of near) {
        const ox = g.x - c.pos.x, oz = g.z - c.pos.z;
        const d = Math.hypot(ox, oz);
        if (d < 2 && d > 1e-4) { g.x += (ox / d) * (2 - d) * 0.5; g.z += (oz / d) * (2 - d) * 0.5; }
      }
    }
  }

  // Push g half out of the bodies in `grid` closer than `min` (each side takes the other half). The other army's grid
  // is from its last update: skip the fallen and the flying.
  separate(g, grid, min, other) {
    const near = grid.query(g.x, g.z, 2.6, this.tmp2);
    for (let k = 0; k < near.length; k++) {
      const o = near[k];
      if (o === g || (other && (!o.alive || o.state === 'air' || o.state === 'drop'))) continue;
      const ox = g.x - o.x, oz = g.z - o.z;
      const d2 = ox * ox + oz * oz;
      if (d2 < min * min && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        const push = (min - d) * 0.5;
        g.x += (ox / d) * push;
        g.z += (oz / d) * push;
      }
    }
  }

  // Holding the post: milling about it (every few seconds a spot near the slot, an amble there, a look round; render
  // turns the head), and marching straight back from a fight. A column on the march closes up its ranks and keeps
  // pace with its anchor instead.
  keepPost(g, sq, dt, dist, toHero) {
    const marching = !!sq.march && !sq.wait;
    if (sq.march) { g.wx = g.wz = 0; g.pacing = false; g.paceT = Math.max(g.paceT, 2); }
    else {
      g.paceT -= dt;
      if (g.paceT <= 0) this.pace(g);
    }
    const k = sq.march ? 0.5 : 1;
    const tx = sq.x + g.slotX * k + (g.wx || 0), tz = sq.z + g.slotZ * k + (g.wz || 0);
    let mx = tx - g.x, mz = tz - g.z;
    const ml = Math.hypot(mx, mz);
    if (sq.march) sq.lag = Math.max(sq.lag || 0, ml);
    if (g.pacing && ml < 0.3) g.pacing = false;
    // (a soldier standing still lets the ranks jostle it up to a step off its spot, as before)
    const speed = marching ? (ml > 0.6 ? Math.min(WALK * 1.25, 1 + ml * 1.2) : 0)
      : ml > 3 ? WALK * 0.8 : g.pacing || ml > 1.2 ? Math.min(PACE, 0.3 + ml * 2) : 0;
    if (ml > 0.01) { mx /= ml; mz /= ml; }
    g.vx = damp(g.vx, mx * speed, 4, dt);
    g.vz = damp(g.vz, mz * speed, 4, dt);
    g.state = speed > 0 ? 'approach' : 'idle';
    const face = speed > 0.2 ? Math.atan2(g.vx, g.vz) : dist < 34 ? toHero : sq.march ? g.yaw : Math.atan2(g.slotX, g.slotZ);
    g.yaw = angleDamp(g.yaw, face, 3, dt);
  }

  // A gunner takes aim. At a pilot it paints the red aim line first; at another army's soldier it just aims.
  startAim(g, hero, dist, toHero, npc) {
    g.state = 'aim';
    g.t = 0;
    g.npcAim = npc;
    g.aimYaw = toHero;
    g.aimY = (hero.pos.y + 1.6 - 2.35) / Math.max(1, dist);
    if (npc) return;
    const fx = Math.sin(toHero), fz = Math.cos(toHero);
    const from = this._v.set(g.x + fx * 1.9 - fz * 0.62, 2.35, g.z + fz * 1.9 + fx * 0.62);
    const L = dist + 8;
    this.game.fx.aimLine(from, { x: from.x + fx * L, y: from.y + g.aimY * L, z: from.z + fz * L }, AIM_T);
  }

  // A garrison soldier spots a pilot: the mono-eye flares and swings on with its "pyuiin".
  alert(g) {
    const game = this.game;
    const fx = Math.sin(g.yaw), fz = Math.cos(g.yaw);
    const p = this._v.set(g.x + fx * 0.55, this.look.eyeY * g.scale, g.z + fz * 0.55);
    game.fx.glint(p, this.look.eye);
    if (this.team === 'zeon') game.audio.play('eye', { at: p });
  }

  // Only the nearest few engaged soldiers per pilot may close in and swing; the rest form a watching ring
  // further out, as in Dynasty Warriors. GMs in the fight beside a pilot draw Zaku off the front rank, one each, up
  // to half of it (the ring takes them on, see seek). Re-ranked a few times a second.
  assignPress(dt, players) {
    this.pressT -= dt;
    if (this.pressT > 0) return;
    this.pressT = 0.3;
    this.gmNear = 0;
    if (this.game.war?.active && this.foes && this.foes.count) {
      for (const p of players) {
        if (!p.alive) continue;
        let n = 0;
        for (const o of this.foes.grid.query(p.pos.x, p.pos.z, GM_DRAW, this.tmp)) if (o.alive && o.hp > 0 && o.foe && o.state !== 'drop' && Math.hypot(o.x - p.pos.x, o.z - p.pos.z) < GM_DRAW) n++;
        this.gmNear = Math.max(this.gmNear, n);
      }
    }
    const cand = this._cand;
    cand.length = 0;
    for (const g of this.list) {
      g.press = false;
      if (g.gun || g.state === 'drop' || g.state === 'dying') continue;
      if (g.squad && !g.squad.engaged) continue;
      const p = players[g.target || 0] || players[0];
      g.pd = Math.hypot(p.pos.x - g.x, p.pos.z - g.z);
      cand.push(g);
    }
    cand.sort((a, b) => a.pd - b.pd);
    const full = Math.round(this.game.difficulty.maxPress * (players.length > 1 ? 1.6 : 1));
    const cap = Math.max(Math.ceil(full / 2), full - this.gmNear);
    for (let i = 0; i < cand.length && i < cap; i++) cand[i].press = true;
  }

  // Garrison squads whose pilots have all wandered off return to their posts.
  leash(squads, players) {
    for (const sq of squads) {
      if (!sq.engaged || sq.rally) continue;
      let near = Infinity;
      for (const p of players) if (p.alive) near = Math.min(near, Math.hypot(p.pos.x - sq.x, p.pos.z - sq.z));
      if (near > LEASH) sq.engaged = false;
    }
  }

  // ---------- co-op guest: puppets driven by host snapshots ----------
  applyNet(a, states, GF) {
    const byId = this.netMap || (this.netMap = new Map());
    const seen = new Set();
    for (let o = 0; o < a.length; o += GF) {
      const id = a[o];
      seen.add(id);
      let g = byId.get(id);
      const x = a[o + 1] / 100, y = a[o + 2] / 100, z = a[o + 3] / 100, yaw = a[o + 4] / 1000;
      const f = a[o + 11];
      if (!g) {
        g = this.pool.pop();
        if (!g) continue;
        g.alive = true;
        g.x = x; g.y = y; g.z = z; g.yaw = yaw;
        g.gs.ph = Math.random() * 6;
        g.fade = 1;
        g.captain = !!(f & 16384);
        g.scale = g.captain ? 1.12 : 0.97 + ((id * 7919) % 70) / 1000;
        g.netId = id;
        this.list.push(g);
        byId.set(id, g);
      }
      g.px = g.x; g.py = g.y; g.pz = g.z; g.pyaw = g.yaw;
      g.nx = x; g.ny = y; g.nz = z; g.nyaw = yaw;
      g.state = states[a[o + 5]];
      g.t0 = a[o + 6] / 1000;
      g.vx = a[o + 7] / 100;
      g.vz = a[o + 8] / 100;
      g.flash = a[o + 9] / 1000;
      g.pitch = a[o + 10] / 1000;
      g.gun = !!(f & 1);
      g.staggerAlt = !!(f & 2);
      g.hp = f & 4 ? 0 : Math.max(1, (f >> 6) & 255) / 255; g.maxHp = 1;
      g.hitKind = (f >> 3) & 3;
      g.shudder = f & 32 ? 0.03 : 0;
      g.i = a[o + 12];
    }
    for (let n = this.list.length - 1; n >= 0; n--) {
      const g = this.list[n];
      if (!seen.has(g.netId)) {
        byId.delete(g.netId);
        g.alive = false;
        this.list[n] = this.list[this.list.length - 1];
        this.list.pop();
        this.pool.push(g);
      }
    }
    this.netAge = 0;
  }

  netInterp(dt) {
    this.netAge = (this.netAge || 0) + dt;
    const k = Math.min(1, this.netAge / 0.05);
    for (const g of this.list) {
      if (g.nx === undefined) continue;
      g.x = g.px + (g.nx - g.px) * k;
      g.y = g.py + (g.ny - g.py) * k;
      g.z = g.pz + (g.nz - g.pz) * k;
      g.yaw = g.pyaw + wrapAngle(g.nyaw - g.pyaw) * k;
      g.t = g.t0 + this.netAge;
      if (g.state === 'drop' && Math.random() < 0.6) this.game.fx.thruster(this._v.set(g.x, g.y + 1.8, g.z - 0.4), { x: 0, y: -1, z: -0.3 }, 0xffb070, 1.1);
    }
  }

  render(dt) {
    const rig = this.rig;
    const list = this.list;
    // lens-side clear (DW-style): soldiers covering the hero on screen, or looming right at the lens, dissolve out of
    // the way (except those about to hit him), so the near crowd never walls off the frame. Judged in view space from
    // the real camera and FOV so it holds at any zoom, pitch or orbit, and eased over a few frames so nothing pops.
    const cam = this.game.camera.cam, cp = cam.position, hp = this.game.local.pos;
    const fw = cam.getWorldDirection(this._fw), rt = this._rt.crossVectors(fw, cam.up).normalize(), up = this._up.crossVectors(rt, fw);
    const hx = hp.x - cp.x, hy = hp.y + 1.9 - cp.y, hz = hp.z - cp.z;
    const hd = Math.max(1, hx * fw.x + hy * fw.y + hz * fw.z);
    const hsx = (hx * rt.x + hy * rt.y + hz * rt.z) / hd, hsy = (hx * up.x + hy * up.y + hz * up.z) / hd;
    // depths at which a soldier fills 85% / 50% of the frame's height
    const tan2 = 2 * Math.tan((cam.fov * Math.PI) / 360), near0 = 3.1 / (tan2 * 0.85), near1 = 3.1 / (tan2 * 0.5);
    const lensOn = this.game.mode !== 'title';
    const ease = 1 - Math.exp(-16 * dt);
    for (let n = 0; n < list.length; n++) {
      const g = list[n];
      const p = g.pose;
      const base = g.gun ? GUN_STANCE : ZSTANCE;
      let want = 1;
      if (lensOn) {
        const gx = g.x - cp.x, gy = g.y + 1.55 - cp.y, gz = g.z - cp.z;
        const d = gx * fw.x + gy * fw.y + gz * fw.z;
        let clear = d > -2 ? 1 - smooth(near0, near1, d) : 0;
        if (d > 0.5) {
          // screen overlap with the hero: 1 once the soldier covers his middle, 0 when their outlines merely touch
          const ox = Math.abs((gx * rt.x + gy * rt.y + gz * rt.z) / d - hsx) / (1 / d + 1.3 / hd);
          const oy = Math.abs((gx * up.x + gy * up.y + gz * up.z) / d - hsy) / (1.55 / d + 2 / hd);
          let cover = (1 - smooth(0.5, 1, ox)) * (1 - smooth(0.5, 1, oy)) * smooth(1, 2.2, hd - d);
          if (g.state === 'windup' || g.state === 'strike' || g.state === 'charge') cover *= smooth(4, 5, Math.hypot(g.x - hp.x, g.z - hp.z));
          clear = Math.max(clear, cover);
        }
        want = 1 - clear;
      }
      g.fade += (want - g.fade) * ease;
      if (Math.abs(want - g.fade) < 0.02) g.fade = want;
      switch (g.state) {
        case 'idle':
        case 'approach':
        case 'charge': {
          const sp = Math.hypot(g.vx, g.vz);
          p.set(base);
          const sy = Math.sin(g.yaw), cy = Math.cos(g.yaw);
          const a = sp > 0.3 ? Math.atan2(-g.vx * cy + g.vz * sy, g.vx * sy + g.vz * cy) : 0;
          gait(p, g.gun ? this.gaitGun : this.gait, g.gs, sp, a, dt, g.x, g.z, g.yaw);
          // standing at its post (no pilot near), a soldier looks round now and then: a turn of the head and chest,
          // held, then another. From time and index alone, so co-op guests see the same without more state.
          if (g.state === 'idle' && g.gs.amp < 0.9 && this.nearestPlayer(g) > AGGRO) {
            const u = this.game.time * 0.22 + hash01(g.i, 5) * 9, seg = Math.floor(u);
            const look = ((hash01(g.i, seg) - 0.5) + ((hash01(g.i, seg + 1) - hash01(g.i, seg)) * smooth(0.6, 0.95, u - seg))) * 1.7 * (1 - g.gs.amp);
            p[P.head * 3 + 1] += look * 0.75;
            p[P.torso * 3 + 1] += look * 0.35;
            p[P.head * 3] += Math.abs(look) * 0.08;
          }
          break;
        }
        case 'windup': WINDUP.sample(g.t * 0.9, p); break;
        case 'strike': STRIKE.sample(g.t, p); break;
        case 'aim': lerpPose(p, GUN_STANCE, GUN_AIM, Math.min(1, g.t / 0.25)); break;
        case 'fire': p.set(GUN_AIM); p[P.uArmR * 3] -= (g.t % 0.13 < 0.05 ? 0.12 : 0); break;
        case 'stagger': {
          const rec = RECOILS[((hash01(g.i, 1) * 3) | 0) * 2 + (g.staggerAlt ? 1 : 0)];
          const amp = 0.88 + 0.24 * hash01(g.i, 2);
          if (g.t < 0.22) lerpPose(p, base, rec, Math.min(1, g.t / (0.025 + 0.02 * hash01(g.i, 3))) * amp);
          else lerpPose(p, rec, base, clamp((g.t - 0.22) / 0.2, 0, 1));
          break;
        }
        case 'air': case 'held': p.set(AIRPOSE); p[RPITCH] = g.pitch; break;
        case 'down': p.set(DOWNPOSE); break;
        case 'getup': lerpPose(p, DOWNPOSE, GETUP, clamp(g.t / 0.25, 0, 1)); if (g.t > 0.25) lerpPose(p, GETUP, base, clamp((g.t - 0.25) / 0.2, 0, 1)); break;
        case 'dying': p.set(g.y > 0.1 ? AIRPOSE : DOWNPOSE); p[RPITCH] = -1.2; p[RROLL] = Math.sin(g.t * 30) * 0.1; break;
        case 'drop': p.set(SPAWN_POSE); break;
      }
      const lift = (g.state === 'down' || g.state === 'dying') && g.y < 0.1 ? 0.5 : g.state === 'getup' ? 0.5 * (1 - clamp(g.t / 0.25, 0, 1)) : 0;
      // hit tint: one white-hot frame, then a gold / amber / red (killing blow) wash that decays fast;
      // KO'd bodies keep a red ember while they fly
      let cr = 1, cg = 1, cb = 1;
      if (g.captain) [cr, cg, cb] = CAPTAIN_TINT;
      const ember = g.hp <= 0 && (g.state === 'air' || g.state === 'dying') ? 0.45 : 0;
      if (g.flash > 0.93) { cr = cg = cb = 2.6; }
      else if (g.flash > 0 || ember) {
        const k = Math.max(ember, g.flash * g.flash) * 1.5;
        const C = g.hitKind === 2 ? HIT_KILL : g.hitKind === 1 ? HIT_AMBER : HIT_GOLD;
        cr = 1 + C[0] * k; cg = 1 + C[1] * k; cb = 1 + C[2] * k;
      }
      const jit = g.shudder > 0 ? Math.sin(g.shudder * 400 + g.i) * 0.07 : 0;
      rig.set(n, g.x + jit, g.y + lift, g.z, g.yaw, g.scale, p, g.fade <= 0 ? -1 : g.gun ? 1 : 2, cr, cg, cb, g.fade);
    }
    rig.commit(list.length);
  }
}
