// Named officers (Denim, Gene) and the boss (Char's red Zaku).
import * as THREE from 'three';
import { RigObject, Clip, makePose, poseFrom, lerpPose, P, RPITCH, RYAW } from '../core/rig.js';
import { MOVES } from './moves.js';
import { rand, damp, angleDamp, wrapAngle } from '../core/util.js';
import { Trail } from '../fx/fx.js';
import { gait, gaitSpec, gaitState } from '../core/gait.js';
import { lensClear } from '../core/lensclear.js';

const GRAV = 32;
const CSTANCE = poseFrom({
  y: -0.1, torso: [0.1, -0.15, 0], head: [-0.05, 0.12, 0],
  uArmR: [-0.35, 0, -0.3], fArmR: [-0.7, 0, 0], hand: [0.35, 0, 0],
  uArmL: [-0.3, 0, 0.25], fArmL: [-0.7, 0, 0],
  thighR: [-0.3, 0, -0.12], shinR: [0.42, 0, 0], thighL: [-0.05, 0, 0.12], shinL: [0.32, 0, 0],
});
const GUARD = poseFrom({
  torso: [0.2, 0.55, 0], head: [0.1, -0.4, 0],
  uArmR: [-0.3, 0, -0.9], fArmR: [-0.8, 0, 0], uArmL: [-1.2, 0.4, 0.2], fArmL: [-1.4, 0, 0],
  thighR: [-0.4, 0, -0.2], shinR: [0.6, 0, 0], thighL: [0.1, 0, 0.2], shinL: [0.5, 0, 0], y: -0.25,
}, CSTANCE);
const AIM = poseFrom({
  torso: [0, -0.3, 0], head: [0, 0.25, 0], uArmR: [-1.52, 0, 0.12], fArmR: [0, 0, 0], hand: [1.57, 0, 0],
  uArmL: [-1.3, 0, -0.45], fArmL: [-0.5, 0, 0], y: -0.12,
}, CSTANCE);
const KICK = new Clip([
  { t: 0, p: { torso: [-0.3, 0, 0], thighR: [0.4, 0, 0], shinR: [1.4, 0, 0], thighL: [-0.3, 0, 0], shinL: [0.6, 0, 0], uArmR: [0.4, 0, -0.6], uArmL: [0.4, 0, 0.6], y: -0.3 } },
  { t: 0.14, p: { torso: [-0.5, 0, 0], thighR: [-1.65, 0, 0], shinR: [0.05, 0, 0], thighL: [0.5, 0, 0], shinL: [0.6, 0, 0], uArmR: [0.6, 0, -0.9], uArmL: [0.6, 0, 0.9], y: 0.1 }, e: 'snap' },
  { t: 0.5, p: { torso: [-0.4, 0, 0], thighR: [-1.5, 0, 0], shinR: [0.1, 0, 0] } },
  { t: 0.75, p: { torso: [0.1, 0, 0], thighR: [-0.3, 0, 0], shinR: [0.4, 0, 0], y: -0.2 } },
], CSTANCE);
const HURT_A = poseFrom({ torso: [-0.5, 0.35, 0.12], head: [-0.4, 0, 0], uArmR: [-0.7, 0, -0.9], uArmL: [-0.7, 0, 0.9], y: -0.15 }, CSTANCE);
const AIRP = poseFrom({ torso: [-0.4, 0, 0], head: [-0.5, 0, 0], uArmR: [-2.2, 0, -0.8], uArmL: [-2.2, 0, 0.8], thighR: [-0.6, 0, -0.2], shinR: [0.9, 0, 0], thighL: [-0.2, 0, 0.2], shinL: [0.5, 0, 0] }, CSTANCE);
const DOWNP = poseFrom({ pitch: -1.5, torso: [-0.1, 0, 0], head: [-0.3, 0.4, 0], uArmR: [-0.3, 0, -1.1], uArmL: [-0.2, 0, 1.2], thighR: [-0.5, 0, -0.2], shinR: [0.8, 0, 0], y: 0 }, CSTANCE);
const TAUNT = new Clip([
  { t: 0, p: {} },
  { t: 0.4, p: { torso: [-0.15, 0.3, 0], head: [-0.2, -0.3, 0], uArmR: [-0.5, 0, -1.2], fArmR: [-0.3, 0, 0], hand: [1.2, 0, 0], uArmL: [-0.2, 0, 0.4], y: -0.02 } },
  { t: 1.6, p: { torso: [-0.12, 0.3, 0] } },
  { t: 2.0, p: {} },
], CSTANCE);

const COMBOS = {
  captain: [['N1', 'N2'], ['N3'], ['N1']],
  officer: [['N1', 'N2'], ['N3'], ['N1', 'N3']],
  char: [['N1', 'N2', 'N3'], ['N2', 'N1', 'N4'], ['KICK'], ['N1', 'KICK'], ['N5']],
};
// K mash: a commander flinches from this many shots, each within TAP_GAP s of the last, then shrugs one off
const TAP_BREAK = 3, TAP_GAP = 0.75;
// The GM team can have a commander's attention instead of the pilot's (war.js commanderFoe), but not while the pilot is
// right in its face (within DUEL of it: it keeps its own distance at 5-6, so the pilot has to come in), locked on to
// it, or has traded a blow with it in the last GRUDGE seconds; and after BORED seconds on GMs with a pilot about it
// comes back to the pilot for a spell anyway.
const DUEL = 4, GRUDGE = 3, BORED = 8;

export class Commander {
  constructor(game, cfg) {
    this.game = game;
    this.cfg = cfg;
    this.name = cfg.name;
    this.kind = cfg.kind;
    this.rig = new RigObject(cfg.def);
    lensClear(this.rig.solidMat, 2.2);
    game.scene.add(this.rig.root);
    this.rig.nodes.gun.visible = false;
    this.pos = new THREE.Vector3(cfg.x, 0, cfg.z);
    this.vel = new THREE.Vector3();
    this.heading = cfg.yaw || 0;
    this.maxHp = cfg.hp * game.difficulty.enemyHp;
    this.hp = this.maxHp;
    this.radius = 1.0;
    this.alive = true;
    this.state = cfg.drop ? 'drop' : 'idle';
    if (cfg.drop) { this.pos.y = 30; this.vel.y = -18; }
    this.t = 0;
    this.cd = 1.2;
    this.pose = makePose();
    this.prev = makePose();
    this.blend = 1;
    this.hitIds = [];
    this.flash = 0;
    this.combo = null;
    this.comboIdx = 0;
    this.moveT = 0;
    this.poise = 0;
    this.recentHits = 0;
    this.taps = 0; // K-mash flinches in a row, the last at tapAt
    this.tapAt = -1e9;
    this.shrug = false; // took a K-mash shot to counter it: the next update goes for the shooter
    this.countering = false; // rushing a K-masher: its shots don't stop this (see damage)
    this.pilotUntil = -1e9; // game time until which the pilot has its attention for sure (GRUDGE after a blow)
    this.pilotHitAt = -1e9; // when a pilot last landed a blow on it (a kill the GMs finish just after is the pilot's)
    this.npcTarget = null; // the GM it is on instead of the pilot (war.js), and its id, since soldiers are pooled
    this.npcTargetId = 0;
    this.npcSince = 0; // when it took its eyes off the pilot (BORED), and when it last had a GM in them
    this.npcLastT = -1e9;
    this.lostFoe = false; // that GM fell mid-move: the move finishes on the ghost, not on the pilot
    this.ghost = { npc: true, alive: false, state: 'intro', id: 0, pos: { x: 0, y: 0, z: 0 }, takeHit: () => false };
    this.onNpc = false;
    this.invuln = 0;
    this.lie = 0;
    this.fired = 0;
    this.nextShot = 0; // game time before which this commander won't open fire again
    this.hitDone = false;
    this.speed = cfg.speed;
    // the mech gait on a Zaku, run speed its fastest approach; Char's goes long and light
    this.gaitSpec = gaitSpec(cfg.def, cfg.speed * 1.3, cfg.kind === 'char'
      ? { stride: 1.6, impact: 0.03, sway: 0.03, lean: 0.3, arm: [0.1, 0.14] }
      : { stride: 1.45, impact: 0.045, sway: 0.045, lat: 0.04, lean: 0.26, arm: [0.1, 0.16] });
    this.gs = gaitState();
    this.paceT = 0;
    this.home = cfg.home || null; // squad leaders guard their landing zone
    this.height = 3.2;
    this.x = this.pos.x;
    this.z = this.pos.z;
    this.y = 0;
    this.trail = new Trail(game.scene, cfg.trail || 0xff8a2a, 12);
    this.afterimageT = 0;
    this._v = new THREE.Vector3();
    this._a = new THREE.Vector3();
    this._b = new THREE.Vector3();
    this._r = [0, 0];
  }

  setState(s) {
    this.prev.set(this.pose);
    this.prev[RYAW] = wrapAngle(this.prev[RYAW]);
    this.blend = 0;
    if (this.state === 'aim') { this.rig.nodes.gun.visible = false; this.rig.nodes.hawk.visible = true; } // cut short
    if (s !== 'dash' && s !== 'combo') this.countering = false; // a counter lasts while it rushes in and swings
    this.state = s;
    this.t = 0;
    this.gs.amp = 0; // the gait picks up again from the stance
  }

  dispose() {
    this.game.scene.remove(this.rig.root);
    this.game.scene.remove(this.trail.mesh);
  }

  damage(dmg, kb, up, fromX, fromZ, id, opts = {}) {
    const g = this.game;
    if (!this.alive || this.state === 'retreat' || this.state === 'dead') return false;
    if (this.invuln > 0) return false;
    if (id && this.hitIds.includes(id)) return false;
    if (id) { this.hitIds.push(id); if (this.hitIds.length > 8) this.hitIds.shift(); }
    const dx = this.pos.x - fromX, dz = this.pos.z - fromZ;
    const l = Math.hypot(dx, dz) || 1;
    if (opts.npc) {
      // an allied soldier's blow (war.js): a scratch that never staggers and isn't the pilots' fight (the boss bar
      // shows it, nothing else does). Enough of them bring a squad leader down, and its landing zone falls to the
      // allies (to the pilot, if one was just hitting it); an officer or Char they can only wear down so far: the
      // blow that fells him is a pilot's.
      this.hp -= Math.min(dmg, Math.max(0, this.hp - g.war.floor(this)));
      this.flash = Math.max(this.flash, 0.35);
      if (this.hp <= 0) { this.hp = 0; this.byNpc = g.time - this.pilotHitAt >= GRUDGE; this.defeat(dx / l, dz / l); }
      return true;
    }
    this.pilotUntil = g.time + GRUDGE; // the pilot's blow (landed or blocked): the duel is on
    this.pilotHitAt = g.time;
    // guarding blocks frontal hits
    if (this.state === 'guard' && !opts.sp) {
      const facing = Math.sin(this.heading) * -dx / l + Math.cos(this.heading) * -dz / l;
      if (facing > 0.2) {
        this.hp -= dmg * 0.08;
        g.fx.sparks(this._v.set(this.pos.x - dx / l * 1.2, 2.2, this.pos.z - dz / l * 1.2), 10, 0xffe080, 10);
        g.audio.play('clang', { vol: 0.6 });
        this.flash = 0.3;
        this.vel.x = dx / l * 3; this.vel.z = dz / l * 3;
        return true;
      }
    }
    const heavy = up > 6 || kb > 8.5 || opts.sp;
    const tap = opts.tap && !heavy; // a K-mash shot: a flinch, never a knockdown
    this.hp -= dmg;
    this.flash = 1;
    this.shudder = 0.05;
    this.recentHits++;
    if (!tap) this.poise += dmg;
    g.hud.bossHit(this);
    if (this.hp <= 0) {
      this.hp = 0;
      this.defeat(dx / l, dz / l);
      return true;
    }
    // Char's swings and any dash shrug off blows; a counter to a K mash shrugs off its shots, but not a heavy hit
    const armored = this.state === 'dash' ? !(heavy && this.countering)
      : this.state === 'combo' && !heavy && ((this.kind === 'char' && this.moveT > 0.05) || (tap && this.countering));
    if (armored) return true;
    // a K mash it has flinched from a few times running: it takes the next shot and goes for the shooter (Reborn)
    if (tap && this.state !== 'air' && this.state !== 'down') {
      if (this.taps >= TAP_BREAK && g.time - this.tapAt < TAP_GAP) { this.taps = 0; this.shrug = true; return true; }
      this.taps = g.time - this.tapAt < TAP_GAP ? this.taps + 1 : 1;
      this.tapAt = g.time;
    }
    if (this.state === 'air' || heavy || this.poise > this.maxHp * 0.12) {
      this.poise = 0;
      this.setState('air');
      this.vel.set(dx / l * kb * 0.8, Math.max(up, 5), dz / l * kb * 0.8);
      if (this.pos.y > 0.3) this.vel.y = Math.max(up * 0.6, 4);
    } else {
      this.setState('hurt');
      this.vel.set(dx / l * kb * 0.7, 0, dz / l * kb * 0.7);
    }
    this.heading = Math.atan2(-dx, -dz);
    // Char dodges out of long strings
    if (this.kind === 'char' && this.recentHits >= 5 && this.state === 'hurt' && Math.random() < 0.7) {
      this.recentHits = 0;
      this.evade();
    }
    return true;
  }

  defeat(dx, dz) {
    const g = this.game;
    this.alive = false;
    if (this.kind === 'char') {
      this.setState('retreat');
      this.vel.set(dx * 6, 12, dz * 6);
      g.onCommanderDefeated(this);
    } else {
      this.setState('dying');
      this.vel.set(dx * 8, 9, dz * 8);
      g.onCommanderDefeated(this);
    }
  }

  evade() {
    const g = this.game;
    this.setState('evade');
    const a = this.heading + Math.PI + rand(-0.9, 0.9);
    this.evadeDir = { x: Math.sin(a), z: Math.cos(a) };
    this.invuln = 0.4;
    g.audio.play('qb', { vol: 0.7, at: this.pos });
  }

  update(dt) {
    const g = this.game;
    // duel whichever pilot is closer (switch only for a clearly closer one, and not mid-combo)
    let hero = g.players[this.targetIdx || 0] || g.hero;
    if (g.players.length > 1 && this.state !== 'combo') {
      const dc = hero.alive ? Math.hypot(hero.pos.x - this.pos.x, hero.pos.z - this.pos.z) : 1e9;
      g.players.forEach((p, i) => {
        if (p !== hero && p.alive && Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z) < dc * 0.65) { this.targetIdx = i; hero = p; }
      });
    }
    // the GM team can have its attention instead (war.js): a squad leader's when its pilots have left its post, any
    // commander's when the pilot has left it alone (DUEL, GRUDGE, lock-on) and a GM is nearer. Not mid-move: a move
    // finishes on whoever it began on, and on nobody if that GM falls (soldiers are pooled, so the id is checked too).
    const busy = this.state === 'combo' || this.state === 'aim' || this.state === 'dash';
    if (g.war?.active && !busy) {
      const pilotOk = hero.alive && hero.state !== 'intro';
      const away = !pilotOk || (this.home && Math.hypot(hero.pos.x - this.home.x, hero.pos.z - this.home.z) > (this.cfg.leash || 30));
      const entering = this.state === 'drop' || this.state === 'taunt';
      // any pilot right in its face or locked on to it keeps it (co-op: not only the one it is duelling)
      const held = g.players.some((p) => p.alive && p.state !== 'intro' && (Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z) < DUEL || this.lockedBy(p)));
      let duel = entering || (!away && (g.time < this.pilotUntil || held));
      if (!duel && !away && this.npcTarget && g.time - this.npcSince > BORED) { this.pilotUntil = g.time + GRUDGE; duel = true; }
      const foe = duel ? null : g.war.commanderFoe(this, hero);
      if (foe) {
        if (g.time - this.npcLastT > 1) this.npcSince = g.time; // a fresh spell on the GMs (not the next GM after a kill)
        this.shrug = false; // a K mash it was about to answer is forgotten
      }
      this.npcTarget = foe;
      this.npcTargetId = foe ? foe.id : 0;
      this.lostFoe = false;
    }
    if (this.npcTarget) this.npcLastT = g.time;
    if (this.npcTarget && (!this.npcTarget.alive || this.npcTarget.id !== this.npcTargetId)) {
      this.npcTarget = null;
      this.lostFoe = busy;
      this.ghost.pos.x = this.pos.x + Math.sin(this.heading) * 8;
      this.ghost.pos.z = this.pos.z + Math.cos(this.heading) * 8;
    }
    if (this.npcTarget) hero = this.npcTarget;
    else if (this.lostFoe && busy) hero = this.ghost;
    const npc = this.onNpc = !!hero.npc;
    if (this.shudder > 0 && this.state !== 'dead') {
      this.shudder -= dt;
      this.flash = Math.max(0, this.flash - dt * 5);
      this.rig.setFlash(this.flash, 0xffe0a0);
      this.rig.root.position.x = this.pos.x + Math.sin(this.shudder * 400) * 0.07;
      return;
    }
    this.t += dt;
    this.cd -= dt;
    this.flash = Math.max(0, this.flash - dt * 5);
    this.invuln = Math.max(0, this.invuln - dt);
    this.recentHits = Math.max(0, this.recentHits - dt * 1.2);
    this.poise = Math.max(0, this.poise - dt * this.maxHp * 0.02);
    const dx = hero.pos.x - this.pos.x, dz = hero.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    const toHero = Math.atan2(dx, dz);
    const heroOk = hero.alive && hero.state !== 'intro';
    const isChar = this.kind === 'char';
    const target = this.targetPose || (this.targetPose = makePose());
    const sp = this.speed;
    let trailOn = false;
    // the counter to a K mash (see damage): boost in on the shooter, or swing at once when it's close (the shooter has
    // its attention by then; mid-move on a GM it waits for the move to end)
    if (this.shrug && !npc) {
      this.shrug = false;
      if (heroOk && !npc && this.state !== 'air' && this.state !== 'down') {
        if (dist > 4.5) this.dash(toHero);
        else { this.heading = toHero; this.startCombo(); }
        this.countering = true;
      }
    }

    switch (this.state) {
      case 'drop': {
        this.vel.y = -Math.max(5, Math.min(24, this.pos.y * 1.5));
        this.pos.y += this.vel.y * dt;
        g.fx.thruster(this._v.set(this.pos.x, this.pos.y + 1.8, this.pos.z - 0.5), { x: 0, y: -1, z: -0.2 }, 0xffb070, 1.5);
        target.set(poseFrom({ thighR: [-0.8, 0, 0], shinR: [1.2, 0, 0], uArmR: [-0.3, 0, -0.6], uArmL: [-0.3, 0, 0.6] }, CSTANCE));
        if (this.pos.y <= 0) {
          this.pos.y = 0;
          this.vel.set(0, 0, 0);
          g.fx.ring(this.pos, 0.5, 5, 0xffc080, 0.5);
          g.fx.dust(this.pos, 16, 1.4);
          g.camera.shake(0.35);
          g.audio.play('slam');
          this.setState('taunt');
        }
        break;
      }
      case 'taunt': {
        this.heading = angleDamp(this.heading, toHero, 4, dt);
        TAUNT.sample(this.t, target);
        if (this.t > 1.9) this.setState('idle');
        break;
      }
      case 'idle': {
        if (this.home && Math.hypot(hero.pos.x - this.home.x, hero.pos.z - this.home.z) > (this.cfg.leash || 30)) {
          // hold the post: walk back, then pace about it (a spot a few steps off every few seconds, a look round)
          this.paceT -= dt;
          if (this.paceT <= 0) {
            this.paceT = rand(4, 8);
            const a = rand(0, Math.PI * 2), r = Math.random() < 0.3 ? 0 : rand(1, 3.5);
            this.paceX = this.home.x + Math.sin(a) * r;
            this.paceZ = this.home.z + Math.cos(a) * r;
            if (g.world.blocked(this.paceX, this.paceZ, 1.3)) { this.paceX = this.home.x; this.paceZ = this.home.z; }
          }
          const hx = (this.paceX ?? this.home.x) - this.pos.x, hz = (this.paceZ ?? this.home.z) - this.pos.z, hd = Math.hypot(hx, hz);
          const s = hd > 4 ? sp * 0.6 : hd > 0.25 ? Math.min(sp * 0.3, hd * 1.5) : 0;
          this.vel.x = damp(this.vel.x, hd > 0.01 ? (hx / hd) * s : 0, 5, dt);
          this.vel.z = damp(this.vel.z, hd > 0.01 ? (hz / hd) * s : 0, 5, dt);
          this.heading = s > 0 ? angleDamp(this.heading, Math.atan2(hx, hz), 5, dt) : angleDamp(this.heading, toHero, 2, dt);
          this.cd = Math.max(this.cd, 0.8);
          this.walkPose(target, dt, true);
          break;
        }
        this.heading = angleDamp(this.heading, toHero, 8, dt);
        // guard reaction to hero swings
        if (heroOk && dist < 6 && hero.state === 'attack' && Math.random() < dt * (isChar ? 3 : this.kind === 'captain' ? 0.7 : 1.4)) {
          this.setState('guard');
          break;
        }
        if (heroOk && this.cd <= 0) {
          // commanders mostly fight hand to hand; the machine gun comes out now and then, telegraphed by an aim line
          const canShoot = g.time >= this.nextShot;
          if (dist > 16 && (isChar || Math.random() < 0.4)) {
            if (canShoot && Math.random() < (isChar ? 0.3 : 0.35)) { this.setState('aim'); this.fired = 0; }
            else this.dash(toHero);
          } else if (dist > 7 && canShoot && Math.random() < (isChar ? 0.12 : 0.15)) {
            this.setState('aim'); this.fired = 0;
          } else this.startCombo();
          break;
        }
        // strafe / close distance
        const want = isChar ? 5 : 6;
        let mx = 0, mz = 0;
        if (dist > want + 1) { mx = dx / dist; mz = dz / dist; }
        else if (dist < want - 1.5) { mx = -dx / dist; mz = -dz / dist; }
        else { mx = dz / dist * (this.cfg.strafe || 1); mz = -dx / dist * (this.cfg.strafe || 1); }
        const s = dist > 25 ? sp * 1.3 : sp * 0.7;
        this.vel.x = damp(this.vel.x, mx * s, 6, dt);
        this.vel.z = damp(this.vel.z, mz * s, 6, dt);
        this.walkPose(target, dt);
        break;
      }
      case 'dash': {
        const T = 0.6;
        this.vel.x = Math.sin(this.heading) * sp * 3;
        this.vel.z = Math.cos(this.heading) * sp * 3;
        this.heading = angleDamp(this.heading, toHero, 4, dt);
        this.thrust(1.5);
        trailOn = true;
        target.set(poseFrom({ torso: [0.55, 0, 0], head: [-0.3, 0, 0], thighR: [0.5, 0, 0], shinR: [0.8, 0, 0], thighL: [0.3, 0, 0], shinL: [0.6, 0, 0], uArmR: [0.5, 0, -0.5], uArmL: [0.5, 0, 0.5], y: -0.2 }, CSTANCE));
        if (dist < 4.5 || this.t > T * 1.6) this.startCombo();
        break;
      }
      case 'combo': {
        const name = this.combo[this.comboIdx];
        const speedMul = isChar ? 1.0 : this.kind === 'captain' ? 0.72 : 0.8;
        this.moveT += dt * speedMul;
        const t = this.moveT;
        trailOn = name !== 'KICK';
        if (name === 'KICK') {
          KICK.sample(t, target);
          if (t > 0.1 && t < 0.5) {
            this.vel.x = Math.sin(this.heading) * sp * 2.2;
            this.vel.z = Math.cos(this.heading) * sp * 2.2;
            this.thrust(1.3);
          } else { this.vel.x = damp(this.vel.x, 0, 10, dt); this.vel.z = damp(this.vel.z, 0, 10, dt); }
          if (t > 0.14 && t < 0.5 && !this.hitDone && dist < 3.2) {
            this.hitDone = true;
            this.hit(hero, this.cfg.dmg * 1.6, true);
            g.audio.play('slam', { vol: 0.8, at: npc ? this.pos : null });
          }
          if (t >= 0.8) this.nextComboStep();
        } else {
          const m = MOVES[name];
          m.clip.sample(Math.min(t, m.clip.dur), target);
          if (t < 0.08) this.heading = angleDamp(this.heading, toHero, 12, dt);
          if (m.lunge) {
            const a = m.lunge[0], b = m.lunge[m.lunge.length - 1];
            const moving = t >= a[0] && t <= b[0];
            const v = moving ? (b[1] - a[1]) / (b[0] - a[0]) * speedMul : 0;
            const lim = dist < 2.4 ? 0 : 1;
            this.vel.x = Math.sin(this.heading) * v * lim;
            this.vel.z = Math.cos(this.heading) * v * lim;
          } else { this.vel.x = 0; this.vel.z = 0; }
          if (m.air) this.pos.y = m.air ? Math.max(0, this.airCurve(m.air, t)) : 0;
          const h = m.hits && m.hits[0];
          if (h && !this.hitDone && t >= h.t && t <= h.t1 + 0.02) {
            const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
            const dot = dist > 0 ? (dx * fx + dz * fz) / dist : 1;
            const range = (h.range || h.len || 4) * 0.95;
            const arc = h.shape === 'circle' || h.arc >= 360 ? -1 : Math.cos((h.arc || 120) * Math.PI / 360);
            if (dist < range && dot >= arc && hero.pos.y < 3) {
              this.hitDone = true;
              this.hit(hero, this.cfg.dmg * (h.big ? 1.5 : 1), !!h.big || name === 'N4');
            }
          }
          if (m.swing !== undefined && t >= m.swing && t - dt * speedMul < m.swing) g.audio.play('hawk', { vol: 0.5, at: this.pos });
          if (t >= m.chain + (isChar ? 0.02 : 0.12)) this.nextComboStep();
        }
        break;
      }
      case 'aim': {
        this.vel.x = damp(this.vel.x, 0, 8, dt);
        this.vel.z = damp(this.vel.z, 0, 8, dt);
        this.rig.nodes.gun.visible = true;
        this.rig.nodes.hawk.visible = false;
        lerpPose(target, CSTANCE, AIM, Math.min(1, this.t / 0.2));
        const shots = isChar ? 8 : this.kind === 'captain' ? 4 : 6;
        const start = isChar ? 0.6 : 0.85;
        const lock = start - (isChar ? 0.45 : 0.6);
        // track the target, then lock on and paint the aim line: the burst follows it (painted even when the target
        // is a GM: the rounds are live, and a pilot in the line can still step out of it)
        if (this.t < lock) {
          this.heading = angleDamp(this.heading, toHero, 10, dt);
          this.aimYaw = this.heading;
          this.aimY = (hero.pos.y + 1.6 - 2.4) / Math.max(1, dist);
        } else if (this.t - dt < lock) {
          this.rig.root.updateMatrixWorld(true);
          const from = this.rig.nodes.hand.localToWorld(this._v.set(0, 0, 1.2));
          const L = dist + 8;
          g.fx.aimLine(from, { x: from.x + Math.sin(this.aimYaw) * L, y: from.y + this.aimY * L, z: from.z + Math.cos(this.aimYaw) * L }, start - lock + shots * 0.1);
        }
        if (this.t >= lock) this.heading = angleDamp(this.heading, this.aimYaw, 20, dt);
        if (this.t > start && this.fired < shots && this.t >= start + this.fired * 0.1) {
          this.fired++;
          this.rig.root.updateMatrixWorld(true);
          const from = this.rig.nodes.hand.localToWorld(this._v.set(0, 0, 1.2));
          const a = this.aimYaw + rand(-0.03, 0.03);
          g.projectiles.enemyBullet(from, new THREE.Vector3(Math.sin(a), this.aimY, Math.cos(a)).normalize(), isChar ? 1.4 : 1.1, { officer: true });
          target[P.uArmR * 3] -= 0.1;
        }
        if (this.t > start + shots * 0.1 + 0.3) {
          this.rig.nodes.gun.visible = false;
          this.rig.nodes.hawk.visible = true;
          this.setState('idle');
          this.cd = rand(1.0, 1.8) * (isChar ? 0.6 : 1);
          this.nextShot = g.time + rand(5, 8) * (isChar ? 0.6 : 1) / g.difficulty.aggression;
        }
        break;
      }
      case 'guard': {
        this.vel.x = damp(this.vel.x, 0, 8, dt);
        this.vel.z = damp(this.vel.z, 0, 8, dt);
        this.heading = angleDamp(this.heading, toHero, 10, dt);
        target.set(GUARD);
        if (this.t > (isChar ? 0.5 : 0.8)) this.startCombo(); // counter attack
        break;
      }
      case 'evade': {
        const u = this.t / 0.4;
        const s = 26 * (1 - u) + 2;
        this.vel.x = this.evadeDir.x * s;
        this.vel.z = this.evadeDir.z * s;
        this.thrust(1.6);
        trailOn = true;
        this.afterimage(dt);
        target.set(poseFrom({ torso: [-0.3, 0, 0], thighR: [0.4, 0, 0], shinR: [0.8, 0, 0], uArmR: [0.4, 0, -0.6], uArmL: [0.4, 0, 0.6], y: -0.25 }, CSTANCE));
        if (this.t > 0.4) { this.setState('idle'); this.cd = 0.15; }
        break;
      }
      case 'hurt': {
        this.vel.x = damp(this.vel.x, 0, 8, dt);
        this.vel.z = damp(this.vel.z, 0, 8, dt);
        target.set(HURT_A);
        if (this.t > 0.35) { this.setState('idle'); this.cd = Math.min(this.cd, 0.3); }
        break;
      }
      case 'air': {
        this.vel.y -= GRAV * dt;
        this.pos.y += this.vel.y * dt;
        this.lie = Math.min(1, this.lie + dt * 3);
        target.set(AIRP);
        target[RPITCH] = -1.3 * this.lie;
        if (this.pos.y <= 0 && this.vel.y < 0) {
          this.pos.y = 0;
          this.vel.set(this.vel.x * 0.3, 0, this.vel.z * 0.3);
          g.fx.dust(this.pos, 10, 1.3);
          this.setState('down');
          this.lie = 1;
        }
        break;
      }
      case 'down': {
        this.vel.x = damp(this.vel.x, 0, 6, dt);
        this.vel.z = damp(this.vel.z, 0, 6, dt);
        target.set(DOWNP);
        if (this.t > (isChar ? 0.5 : 0.9)) { this.setState('getup'); this.invuln = 0.9; }
        break;
      }
      case 'getup': {
        this.lie = Math.max(0, 1 - this.t / 0.4);
        lerpPose(target, DOWNP, CSTANCE, 1 - this.lie);
        if (this.t > 0.45) {
          this.lie = 0;
          if (isChar && Math.random() < 0.6) this.evade();
          else { this.setState('idle'); this.cd = 0.3; }
        }
        break;
      }
      case 'dying': {
        this.vel.y -= GRAV * dt;
        this.pos.y = Math.max(0, this.pos.y + this.vel.y * dt);
        if (this.pos.y === 0) { this.vel.x *= 0.9; this.vel.z *= 0.9; }
        this.lie = Math.min(1, this.lie + dt * 2);
        this.flash = 0.5 + 0.5 * Math.sin(this.t * 40);
        target.set(DOWNP);
        target[RPITCH] = -1.5 * this.lie;
        if (Math.random() < dt * 12) g.fx.sparks(this._v.set(this.pos.x + rand(-1, 1), 1 + rand(0, 1.5), this.pos.z + rand(-1, 1)), 6, 0xffc060, 8);
        if (this.t > 1.1) {
          g.fx.explode(this._v.set(this.pos.x, 1.6, this.pos.z), 2.2, [this.cfg.colors.DG, this.cfg.colors.LG, 0x3a3a3a]);
          g.fx.explode(this._v.set(this.pos.x + 1, 2.4, this.pos.z), 1.4, [this.cfg.colors.DG, this.cfg.colors.LG]);
          g.camera.shake(0.8);
          g.audio.play('bigboom');
          this.state = 'dead';
          this.rig.root.visible = false;
          this.trail.mesh.visible = false;
          g.onCommanderExploded(this);
        }
        break;
      }
      case 'retreat': {
        // Char withdraws: stagger, then boost up and away.
        if (this.t < 1.6) {
          this.vel.y -= GRAV * dt;
          this.pos.y = Math.max(0, this.pos.y + this.vel.y * dt);
          this.vel.x *= 0.95; this.vel.z *= 0.95;
          if (Math.random() < dt * 10) g.fx.sparks(this._v.set(this.pos.x + rand(-1, 1), 1.5 + rand(0, 1.5), this.pos.z + rand(-1, 1)), 6, 0xffc060, 8);
          target.set(HURT_A);
        } else {
          this.vel.y = Math.min(this.vel.y + 30 * dt, 22);
          this.vel.x = damp(this.vel.x, -Math.sin(this.heading) * 10, 2, dt);
          this.vel.z = damp(this.vel.z, -Math.cos(this.heading) * 10, 2, dt);
          this.pos.y += this.vel.y * dt;
          this.thrust(2);
          target.set(poseFrom({ torso: [0.2, 0, 0], thighR: [-0.6, 0, 0], shinR: [1, 0, 0], uArmR: [-0.2, 0, -0.5], uArmL: [-0.2, 0, 0.5] }, CSTANCE));
          if (this.pos.y > 80) { this.state = 'dead'; this.rig.root.visible = false; this.trail.mesh.visible = false; }
        }
        break;
      }
      case 'dead':
        return;
    }

    if (this.state !== 'drop' && this.state !== 'retreat' && this.state !== 'dying') {
      this.pos.x += this.vel.x * dt;
      this.pos.z += this.vel.z * dt;
      if (this.state === 'air' || this.pos.y > 0) {
        if (this.state !== 'air' && this.state !== 'combo') this.pos.y = Math.max(0, this.pos.y - 10 * dt);
      }
    } else if (this.state !== 'drop') {
      this.pos.x += this.vel.x * dt;
      this.pos.z += this.vel.z * dt;
    }
    if (this.state !== 'retreat') {
      const r = g.world.resolve(this.pos.x, this.pos.z, this.radius, this._r);
      this.pos.x = r[0];
      this.pos.z = r[1];
      // don't overlap the hero
      if (dist < 1.9 && dist > 1e-4 && hero.pos.y < 2.5) {
        this.pos.x -= dx / dist * (1.9 - dist);
        this.pos.z -= dz / dist * (1.9 - dist);
      }
    }
    this.x = this.pos.x; this.z = this.pos.z; this.y = this.pos.y;

    // blend + apply
    this.blend = Math.min(1, this.blend + dt / 0.08);
    if (this.blend < 1) lerpPose(this.pose, this.prev, target, this.blend);
    else this.pose.set(target);
    const rig = this.rig;
    rig.root.position.set(this.pos.x, this.pos.y + this.lie * 0.45, this.pos.z);
    rig.root.rotation.y = this.heading;
    rig.applyPose(this.pose);
    rig.setFlash(this.flash, 0xffffff);
    rig.root.updateMatrixWorld(true);
    const hand = rig.nodes.hand;
    hand.localToWorld(this._a.set(0, -0.3, 0.45));
    hand.localToWorld(this._b.set(0, -0.3, 0.75));
    this.trailOn = trailOn;
    this.trail.push(this._a, this._b, trailOn && this.rig.nodes.hawk.visible);
    if (isChar && this.state !== 'dead' && Math.random() < dt * 6) g.fx.aura(this.pos, 0xff3040, 1, 1.2);
  }

  // ---------- co-op replication ----------
  netState() {
    return {
      id: this.netId, n: this.name, st: this.state, x: this.pos.x, y: this.pos.y + this.lie * 0.45, z: this.pos.z,
      h: this.heading, hp: this.hp, mhp: this.maxHp, fl: this.flash, pose: Array.from(this.pose),
      gun: this.rig.nodes.gun.visible, vis: this.rig.root.visible, tr: this.trailOn, al: this.alive,
      thr: this.thrustAt && this.game.time - this.thrustAt < 0.06 ? 1 : 0,
    };
  }

  applyNet(s, dt) {
    this.state = s.st;
    this.hp = s.hp;
    this.maxHp = s.mhp;
    this.alive = s.al;
    this.heading = s.h;
    this.x = this.pos.x; this.y = this.pos.y; this.z = this.pos.z;
    this.pose.set(s.pose);
    const rig = this.rig;
    rig.root.visible = s.vis;
    rig.nodes.gun.visible = s.gun;
    rig.nodes.hawk.visible = !s.gun;
    rig.root.position.copy(this.pos);
    rig.root.rotation.y = this.heading;
    rig.applyPose(this.pose);
    rig.setFlash(s.fl, 0xffffff);
    rig.root.updateMatrixWorld(true);
    const hand = rig.nodes.hand;
    hand.localToWorld(this._a.set(0, -0.3, 0.45));
    hand.localToWorld(this._b.set(0, -0.3, 0.75));
    this.trail.push(this._a, this._b, s.tr && !s.gun);
    this.trail.mesh.visible = this.trail.mesh.visible && s.vis;
    if (s.thr) this.thrust(1.4);
    if (this.kind === 'char' && s.st !== 'dead' && Math.random() < dt * 6) this.game.fx.aura(this.pos, 0xff3040, 1, 1.2);
  }

  airCurve(keys, t) {
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) if (t <= keys[i][0]) {
      const a = keys[i - 1], b = keys[i];
      const u = (t - a[0]) / (b[0] - a[0]);
      return a[1] + (b[1] - a[1]) * u * u * (3 - 2 * u);
    }
    return keys[keys.length - 1][1];
  }

  // Walking, running and strafing: the mech gait, in the direction of travel relative to the facing. At its post
  // (`post`), standing between steps, it looks round: a turn of the head and chest, held, then another.
  walkPose(target, dt, post = false) {
    const sp = Math.hypot(this.vel.x, this.vel.z);
    const h = this.heading, sh = Math.sin(h), ch = Math.cos(h);
    const a = sp > 0.3 ? Math.atan2(-this.vel.x * ch + this.vel.z * sh, this.vel.x * sh + this.vel.z * ch) : 0;
    target.set(CSTANCE);
    gait(target, this.gaitSpec, this.gs, sp, a, dt, this.pos.x + this.vel.x * dt, this.pos.z + this.vel.z * dt, h);
    this.look = damp(this.look || 0, post && sp < 0.5 ? Math.sin(this.game.time * 0.5 + this.netId) * 0.8 : 0, 2.5, dt);
    target[P.head * 3 + 1] += this.look * 0.7;
    target[P.torso * 3 + 1] += this.look * 0.3;
  }

  dash(toHero) {
    this.heading = toHero;
    this.setState('dash');
    this.game.audio.play('qb', { vol: 0.7, at: this.pos });
  }

  startCombo() {
    const list = COMBOS[this.kind];
    this.combo = list[(Math.random() * list.length) | 0];
    this.comboIdx = 0;
    this.startComboStep();
  }

  startComboStep() {
    const g = this.game;
    this.setState('combo');
    this.moveT = 0;
    this.hitDone = false;
    const name = this.combo[this.comboIdx];
    // telegraph: mono-eye glint
    this.rig.root.updateMatrixWorld(true);
    const eye = this.rig.nodes.head.localToWorld(this._v.set(0, 0.25, 0.35));
    g.fx.hit(eye, 0xff3070);
    if (name !== 'KICK') g.audio.play('hawk', { vol: 0.25, pitch: 1.4, at: this.onNpc ? this.pos : null });
  }

  // A blow on whoever it is fighting: a pilot (which keeps the duel going) or a GM (a commander's blow, war.js).
  hit(hero, dmg, heavy) {
    const npc = !!hero.npc;
    if (!hero.takeHit(dmg, this.pos.x, this.pos.z, heavy, npc ? 'officer' : 'melee')) return;
    if (!npc) this.pilotUntil = Math.max(this.pilotUntil, this.game.time + GRUDGE);
  }

  // Is this pilot locked on to this commander (the host's own lock, or the one a guest sends with its input)?
  lockedBy(pilot) {
    const g = this.game;
    if (pilot === g.local) return g.lock === this;
    const s = g.slots?.find((s) => s?.unit === pilot);
    return !!s && s.input?.lock === this.netId;
  }

  nextComboStep() {
    this.comboIdx++;
    if (this.comboIdx >= this.combo.length) {
      this.setState('idle');
      this.pos.y = 0;
      this.cd = rand(0.8, 1.8) * (this.kind === 'char' ? 0.55 : this.kind === 'captain' ? 1.5 : 1) / this.game.difficulty.speed;
      return;
    }
    this.startComboStep();
  }

  thrust(strength) {
    this.thrustAt = this.game.time;
    const torso = this.rig.nodes.torso;
    this.rig.root.updateMatrixWorld(true);
    const p = torso.localToWorld(this._v.set(0, 0.2, -0.6));
    this.game.fx.thruster(p, { x: -Math.sin(this.heading) * 0.8, y: -0.4, z: -Math.cos(this.heading) * 0.8 }, 0xffa060, strength);
  }

  afterimage(dt) {
    this.afterimageT -= dt;
    if (this.afterimageT > 0) return;
    this.afterimageT = 0.05;
    const q = this.game.fx.glow.spawn();
    q.x = this.pos.x; q.y = this.pos.y + 1.6; q.z = this.pos.z;
    q.vx = q.vy = q.vz = 0; q.max = 0.3; q.g = 0; q.drag = 0;
    q.s0 = 1.8; q.s1 = 0.4; q.c0.setRGB(1.6, 0.15, 0.2); q.c1.setRGB(0.4, 0, 0);
    q.rx = 0; q.ry = this.heading; q.rz = 0;
  }
}

export class Commanders {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.serial = 0;
  }
  add(cfg) {
    const c = new Commander(this.game, cfg);
    c.netId = cfg.netId ?? ++this.serial;
    this.list.push(c);
    return c;
  }

  // Guest: create / update / drop commander puppets to match the host.
  applyNet(arr, makeCfg, dt, alpha) {
    const seen = new Set();
    for (const s of arr) {
      seen.add(s.id);
      let c = this.list.find((x) => x.netId === s.id);
      if (!c) {
        c = this.add({ ...makeCfg(s.n), x: s.x, z: s.z, netId: s.id });
        c.pos.set(s.x, s.y, s.z);
      }
      c.netTarget = s;
    }
    for (let i = this.list.length - 1; i >= 0; i--) {
      if (!seen.has(this.list[i].netId)) { this.list[i].dispose(); this.list.splice(i, 1); }
    }
  }
  update(dt) {
    for (const c of this.list) c.update(dt);
  }
  clear() {
    for (const c of this.list) c.dispose();
    this.list.length = 0;
  }
  get active() {
    return this.list.filter((c) => c.alive);
  }
}
