// Beam rifle shots (and the charge shot), hyper bazooka rounds and 240mm cannon shells, Zaku machine-gun tracers,
// Guntank ordnance.
import * as THREE from 'three';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const Zf = new THREE.Vector3(0, 0, 1);
const BULLET_SPEED = 34; // slow enough to read the tracers and step out of a burst
const BAZOOKA = { speed: 52, fuse: 0.6, r: 3.4, dmg: 42, kb: 8, up: 7, big: true };

function glowInstanced(scene, max, color) {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshBasicMaterial({ color, toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  const mesh = new THREE.InstancedMesh(geo, mat, max);
  mesh.frustumCulled = false;
  mesh.count = 0;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(mesh);
  return mesh;
}

export class Projectiles {
  constructor(game) {
    this.game = game;
    const scene = game.scene;
    this.beams = [];
    this.bullets = [];
    this.beamMesh = glowInstanced(scene, 64, new THREE.Color(3.2, 1.1, 2.4));
    this.beamCore = glowInstanced(scene, 64, new THREE.Color(3, 3, 2.6));
    this.bulletMesh = glowInstanced(scene, 256, new THREE.Color(3, 1.6, 0.5));
    this.allyMesh = glowInstanced(scene, 128, new THREE.Color(3, 1.0, 2.3)); // allied GMs' beam spray bolts (war.js)
    // Guntank ordnance
    this.missiles = [];
    this.shells = [];
    this.missileMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xe8ecf2, roughness: 0.5 }), 128);
    this.missileMesh.frustumCulled = false;
    this.missileMesh.count = 0;
    this.missileMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.missileMesh);
    this.shellMesh = glowInstanced(scene, 64, new THREE.Color(3, 1.9, 0.7));
    // hyper bazooka rounds: a dark shell with a burning motor
    this.rockets = [];
    this.rocketMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x3a4458, roughness: 0.6 }), 32);
    this.rocketMesh.frustumCulled = false;
    this.rocketMesh.count = 0;
    this.rocketMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.rocketMesh);
    this.rocketGlow = glowInstanced(scene, 32, new THREE.Color(3, 1.7, 0.6));
    this.serial = 1e6;
    this._v = new THREE.Vector3();
  }

  clear() {
    this.beams.length = 0;
    this.bullets.length = 0;
    this.missiles.length = 0;
    this.shells.length = 0;
    this.rockets.length = 0;
  }

  // o: { dmg, kb, up, big, w (thickness), r (hit radius), speed, max (lifetime), sp (no hit-stop: remote weapons),
  // pierce (how many targets it hits before it ends; default: everything in its path) }. dmg is scaled on contact
  // like a blow or blast (combat.dmgMul); tap marks the K mash's shots, which officers learn to shrug off.
  heroBeam(owner, from, dir, o = {}) {
    this.beams.push({
      owner, p: from.clone(), d: dir.clone(), life: 0, max: o.max ?? 0.8, speed: o.speed ?? 120, id: ++this.serial,
      dmg: o.dmg ?? 22, kb: o.kb ?? 4, up: o.up ?? 1, big: !!o.big, sp: !!o.sp, w: o.w ?? 1, r: o.r ?? 0.8, kills: 0,
      pierce: o.pierce ?? Infinity, tap: !!owner.move?.shot,
    });
  }

  // Hyper bazooka round: flies straight and bursts on the first thing it touches.
  rocket(owner, from, dir) {
    this.shell(owner, from, dir, BAZOOKA);
  }

  // A shell or rocket that flies straight, trailing smoke, and bursts on contact, on the ground, against a wall or
  // when its fuse runs out. o: { speed, fuse, r, dmg, kb, up, big, sp, lite, smoke }
  shell(owner, from, dir, o = BAZOOKA) {
    if (this.rockets.length > 60) return;
    this.rockets.push({ p: from.clone(), v: dir.clone().multiplyScalar(o.speed ?? 52), life: 0, owner, id: ++this.serial, o, tap: !!owner.move?.shot });
  }

  // Detonation: white flash, fireball, smoke, and a blast that throws everything within r.
  // o.lite: a lighter burst for barrages (no light, smaller fireball); o.sp: an SP blast (no hit-stop); o.fxR: the
  // radius the burst looks (default r), for a shell whose fireball is bigger than what it damages; tap: a K-mash shell.
  heroBlast(owner, p, r, dmg, kb, up, o = {}, tap = false) {
    const g = this.game;
    const c = this._v.set(p.x, Math.max(0.8, p.y), p.z);
    const fr = o.fxR ?? r;
    if (o.lite) {
      // a quick burst: fireball, smoke and a flash, without the full explosion's debris, embers and light
      g.fx.fireball(c, fr / 2.6);
      g.fx.puff(c, 3, 0.4, 0.9, 1.2, 2.2);
      g.fx.star(c, 0xfff0d0, 1.3);
    } else {
      g.fx.explode(c, fr / 1.9, [0x8a867c, 0x6f6c64, 0x3a3532]);
      g.fx.star(c, 0xfff0d0, 2.2);
      g.fx.light(c, 0xffb060, 120, 18, 0.35);
    }
    g.combat.aoe(owner, c.x, c.y, c.z, r, dmg, kb, up, ++this.serial, o.big ?? true, !!o.sp, tap);
    g.audio.play(o.sound || 'bzboom', { at: c, vol: o.lite ? 0.6 : 1 });
    g.shakeFor(owner, o.lite ? 0.03 : 0.3);
    if (!o.lite && g.local === owner) g.aberr(0.35);
  }

  tankMissile(owner, from, dir, target) {
    if (this.missiles.length > 120) return;
    this.missiles.push({ p: from.clone(), v: dir.clone().multiplyScalar(26), target, life: 0, owner, id: ++this.serial });
  }

  // Lob a shell so it lands on `point` after a fixed flight time.
  tankShell(owner, from, point) {
    const T = 0.85, G = 30;
    const v = new THREE.Vector3((point.x - from.x) / T, (0 - from.y + 0.5 * G * T * T) / T, (point.z - from.z) / T);
    this.shells.push({ p: from.clone(), v, life: 0, owner, id: ++this.serial });
  }

  blast(owner, p, r, dmg, kb, up, big) {
    const g = this.game;
    const s = r / 4.5;
    g.fx.explode(this._v.set(p.x, Math.max(0.6, p.y), p.z), s, [0x8a867c, 0x6f6c64, 0x3a3532]);
    g.combat.aoe(owner, p.x, 0, p.z, r, dmg, kb, up, ++this.serial, big);
    g.audio.play(big ? 'boom' : 'hit', { vol: big ? 0.8 : 0.4, pitch: big ? 0.8 : 1.4, at: p });
    if (big) g.shakeFor(owner, 0.15);
  }

  // A Zeon round. mul: a commander's hits harder (officer: it is a commander's, which a GM feels more, war.js). npc: a
  // soldier's burst at a GM, fired with no aim line, so it passes the pilots by. fx: whether a pilot is near enough to
  // see and hear it fired.
  enemyBullet(from, dir, mul = 1, { npc = false, officer = false, fx = true } = {}) {
    if (this.bullets.length > 250) return;
    this.bullets.push({ p: from.clone(), d: dir.clone(), life: 0, max: 1.7, speed: BULLET_SPEED, dmg: 4 * mul, npc, officer });
    if (!fx) return;
    this.game.fx.sparks(from, 3, 0xffc070, 5, 0.6, dir);
    this.game.fx.star(from, 0xffa040, 0.4);
    if (Math.random() < 0.5) this.game.audio.play('mg', { vol: 0.28, at: from });
  }

  // An allied GM's beam spray bolt: it only hurts Zeon's soldiers and squad leaders, never a pilot (war.js).
  // fx: whether a pilot is near enough to see and hear it fired.
  allyBullet(from, dir, fx = true) {
    if (this.bullets.length > 250) return;
    this.bullets.push({ p: from.clone(), d: dir.clone(), life: 0, max: 0.9, speed: BULLET_SPEED * 1.6, dmg: 4, team: 'fed' });
    if (!fx) return;
    this.game.fx.star(from, 0xff8ad8, 0.35);
    if (Math.random() < 0.5) this.game.audio.play('spray', { vol: 0.18, at: from });
  }

  update(dt) {
    const g = this.game;
    const combat = g.combat;
    // hero beams: pierce everything in their path, or end on their `pierce`-th hit (the nearest targets first)
    const byNear = (a, b) => a.u - b.u;
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const b = this.beams[i];
      b.life += dt;
      const ax = b.p.x, ay = b.p.y, az = b.p.z;
      b.p.addScaledVector(b.d, b.speed * dt);
      const found = [];
      combat.beamSweep(ax, ay, az, b.p.x, b.p.y, b.p.z, b.r, (t, boss) => {
        found.push({ t, boss, u: ((t.x ?? t.pos.x) - ax) * b.d.x + ((t.z ?? t.pos.z) - az) * b.d.z });
      });
      if (b.pierce < Infinity) found.sort(byNear);
      let stopAt = null;
      const dmg = found.length ? b.dmg * combat.dmgMul(b.owner) : 0;
      for (const { t, boss } of found) {
        if (b.kills >= b.pierce) break;
        const ok = boss ? t.damage(dmg * 1.1, b.kb, b.up, ax, az, b.id, { tap: b.tap }) : g.crowd.damage(t, dmg, b.kb, b.up, ax, az, b.id, { big: b.big });
        if (ok) {
          b.kills++;
          const hp = this._v.set(t.x ?? t.pos.x, (t.y ?? t.pos.y) + 1.8, t.z ?? t.pos.z);
          g.fx.hit(hp, 0xff7ad0, true);
          g.fx.puff(hp, 2, 0.4, 0.8, 1, 2);
          if (b.big) g.fx.star(hp, 0xffd0f4, 2);
          combat.registerHits(1, { big: b.big && b.kills === 1, sp: b.sp }, b.owner);
          if (combat.hitSfxBudget >= 1) { combat.hitSfxBudget--; g.audio.play(b.big ? 'hit_heavy' : 'bhit', { vol: 0.6 }); }
          if (b.kills >= b.pierce) stopAt = t;
        }
      }
      // a beam that has spent its hits ends in the target it struck
      if (stopAt) b.p.set(stopAt.x ?? stopAt.pos.x, b.p.y, stopAt.z ?? stopAt.pos.z);
      g.fx.streak(this._v.set(ax, ay, az), b.p, 0xff6fd0);
      if (b.w > 1.5) g.fx.streak(this._v.set(ax, ay, az), b.p, 0xffc0f0);
      if (stopAt) { this.beams.splice(i, 1); continue; }
      if (b.life > b.max || g.world.blocked(b.p.x, b.p.z, 0) && b.p.y < 8) {
        g.fx.hit(b.p, 0xff7ad0, true);
        g.fx.puff(b.p, 4, 0.5, 0.9);
        g.fx.debris(b.p, 5, [0x8a867c, 0x6f6c64], 7, 0.18);
        this.beams.splice(i, 1);
      }
    }
    // hyper bazooka rounds
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i];
      r.life += dt;
      const ax = r.p.x, ay = r.p.y, az = r.p.z;
      r.p.addScaledVector(r.v, dt);
      const o = r.o;
      if (Math.random() < 0.8) { g.fx.noNet = true; g.fx.puff(r.p, 1, 0.8, o.smoke ?? 0.45, 0.3, 0.4); g.fx.noNet = false; }
      let hit = false;
      combat.beamSweep(ax, ay, az, r.p.x, r.p.y, r.p.z, 1.1, () => { hit = true; });
      if (hit || r.p.y <= 0.3 || r.life > o.fuse || (g.world.blocked(r.p.x, r.p.z, 0) && r.p.y < 8)) {
        this.heroBlast(r.owner, r.p, o.r, o.dmg, o.kb, o.up, o, r.tap);
        this.rockets.splice(i, 1);
      }
    }
    // Guntank missiles: accelerate, curl onto their target, burst on contact
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const m = this.missiles[i];
      m.life += dt;
      const t = m.target;
      if (t && t.alive && t.state !== 'dying' && m.life > 0.08) {
        const tx = (t.x ?? t.pos.x) - m.p.x, ty = (t.y ?? t.pos.y) + 1.6 - m.p.y, tz = (t.z ?? t.pos.z) - m.p.z;
        const tl = Math.hypot(tx, ty, tz) || 1;
        const sp = m.v.length();
        const turn = Math.min(1, dt * 7);
        m.v.x += ((tx / tl) * sp - m.v.x) * turn;
        m.v.y += ((ty / tl) * sp - m.v.y) * turn;
        m.v.z += ((tz / tl) * sp - m.v.z) * turn;
        if (tl < 1.4) { this.blast(m.owner, m.p, 2.4, 22, 4, 3, false); this.missiles.splice(i, 1); continue; }
      } else m.v.y -= 6 * dt;
      m.v.multiplyScalar(Math.min(1.8, 1 + dt * 1.6)); // rocket motor
      if (m.v.length() > 48) m.v.setLength(48);
      m.p.addScaledVector(m.v, dt);
      if (Math.random() < 0.7) g.fx.thruster(m.p, { x: -m.v.x / 40, y: -m.v.y / 40, z: -m.v.z / 40 }, 0xffc070, 0.6);
      if (m.p.y <= 0.2 || m.life > 2.2 || (g.world.blocked(m.p.x, m.p.z, 0) && m.p.y < 6)) {
        this.blast(m.owner, m.p, 2.4, 22, 4, 3, false);
        this.missiles.splice(i, 1);
      }
    }
    // Guntank 120mm shells: ballistic, big blast on landing
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i];
      s.life += dt;
      s.v.y -= 30 * dt;
      s.p.addScaledVector(s.v, dt);
      if (Math.random() < 0.8) { g.fx.noNet = true; g.fx.sparks(s.p, 1, 0xffa040, 2); g.fx.noNet = false; }
      if (s.p.y <= 0.3 || s.life > 3) {
        s.p.y = 0.3;
        this.blast(s.owner, s.p, 5, 58, 9, 8, true);
        g.fx.ring(s.p, 0.5, 6, 0xffb060, 0.5);
        this.shells.splice(i, 1);
      }
    }

    // enemy bullets
    outer: for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.life += dt;
      b.p.addScaledVector(b.d, b.speed * dt);
      if (b.team !== 'fed' && !b.npc) for (const pl of g.players) {
        const dx = b.p.x - pl.pos.x, dy = b.p.y - (pl.pos.y + 1.6), dz = b.p.z - pl.pos.z;
        if (dx * dx + dy * dy * 0.4 + dz * dz < 1.3 && pl.alive) {
          pl.takeHit(b.dmg, b.p.x - b.d.x * 5, b.p.z - b.d.z * 5, false, 'bullet');
          this.bullets.splice(i, 1);
          continue outer;
        }
      }
      // the other army's soldiers (Zeon rounds hit allied GMs, theirs hit Zeon)
      if (g.war?.bulletHit(b)) { this.bullets.splice(i, 1); continue; }
      if (b.p.y < 0.05 || b.life > b.max || g.world.blocked(b.p.x, b.p.z, 0) && b.p.y < 6) {
        g.fx.sparks(b.p, 3, 0xffc070, 5);
        if (b.p.y < 0.3) g.fx.puff(b.p, 1, 0.55, 0.5, 1, 1);
        this.bullets.splice(i, 1);
      }
    }
  }

  // ---------- co-op guest ----------
  applyNet(pj) {
    const V = (a, i) => new THREE.Vector3(a[i], a[i + 1], a[i + 2]);
    const rows = (a, f) => { const out = []; for (let i = 0; i < a.length; i += 6) out.push(f(V(a, i), V(a, i + 3))); return out; };
    this.beams = [];
    for (let i = 0; i < pj.b.length; i += 7) this.beams.push({ p: V(pj.b, i), d: V(pj.b, i + 3), w: pj.b[i + 6] });
    this.rockets = rows(pj.rk || [], (p, v) => ({ p, v }));
    this.bullets = rows(pj.u, (p, d) => ({ p, d }));
    if (pj.ua) this.bullets.push(...rows(pj.ua, (p, d) => ({ p, d, team: 'fed' })));
    this.missiles = rows(pj.mi, (p, v) => ({ p, v }));
    this.shells = rows(pj.sh, (p, v) => ({ p, v }));
  }

  // Advance replicated projectiles kinematically between snapshots (no collisions on the guest).
  guestAdvance(dt) {
    const g = this.game;
    for (const b of this.beams) {
      this._v.copy(b.p);
      b.p.addScaledVector(b.d, 120 * dt);
      g.fx.streak(this._v, b.p, 0xff6fd0);
    }
    for (const b of this.bullets) b.p.addScaledVector(b.d, BULLET_SPEED * (b.team === 'fed' ? 1.6 : 1) * dt);
    for (const r of this.rockets) {
      r.p.addScaledVector(r.v, dt);
      if (Math.random() < 0.8) g.fx.puff(r.p, 1, 0.8, 0.45, 0.3, 0.4);
    }
    for (const m of this.missiles) {
      m.p.addScaledVector(m.v, dt);
      if (Math.random() < 0.7) g.fx.thruster(m.p, { x: -m.v.x / 40, y: -m.v.y / 40, z: -m.v.z / 40 }, 0xffc070, 0.6);
    }
    for (const s of this.shells) {
      s.v.y -= 30 * dt;
      s.p.addScaledVector(s.v, dt);
    }
  }

  render() {
    let n = 0;
    for (const b of this.beams) {
      _q.setFromUnitVectors(Zf, b.d);
      _p.copy(b.p).addScaledVector(b.d, -3.2);
      const w = b.w || 1;
      _s.set(0.36 * w, 0.36 * w, 6.4);
      _m.compose(_p, _q, _s);
      this.beamMesh.setMatrixAt(n, _m);
      _s.set(0.13 * w, 0.13 * w, 6.8);
      _m.compose(_p, _q, _s);
      this.beamCore.setMatrixAt(n, _m);
      n++;
    }
    this.beamMesh.count = this.beamCore.count = n;
    this.beamMesh.instanceMatrix.needsUpdate = this.beamCore.instanceMatrix.needsUpdate = true;
    n = 0;
    let na = 0;
    for (const b of this.bullets) {
      _q.setFromUnitVectors(Zf, b.d);
      _p.copy(b.p);
      _s.set(0.16, 0.16, 1.8);
      _m.compose(_p, _q, _s);
      if (b.team !== 'fed') this.bulletMesh.setMatrixAt(n++, _m);
      else if (na < 128) this.allyMesh.setMatrixAt(na++, _m);
    }
    this.bulletMesh.count = n;
    this.bulletMesh.instanceMatrix.needsUpdate = true;
    this.allyMesh.count = na;
    this.allyMesh.instanceMatrix.needsUpdate = true;
    n = 0;
    for (const m of this.missiles) {
      _p.copy(m.v).normalize();
      _q.setFromUnitVectors(Zf, _p);
      _s.set(0.16, 0.16, 0.6);
      _m.compose(m.p, _q, _s);
      this.missileMesh.setMatrixAt(n++, _m);
    }
    this.missileMesh.count = n;
    this.missileMesh.instanceMatrix.needsUpdate = true;
    n = 0;
    for (const s of this.shells) {
      _p.copy(s.v).normalize();
      _q.setFromUnitVectors(Zf, _p);
      _s.set(0.34, 0.34, 0.9);
      _m.compose(s.p, _q, _s);
      this.shellMesh.setMatrixAt(n++, _m);
    }
    this.shellMesh.count = n;
    this.shellMesh.instanceMatrix.needsUpdate = true;
    n = 0;
    for (const r of this.rockets) {
      _p.copy(r.v).normalize();
      _q.setFromUnitVectors(Zf, _p);
      _s.set(0.38, 0.38, 1.0);
      _m.compose(r.p, _q, _s);
      this.rocketMesh.setMatrixAt(n, _m);
      _s.set(0.3, 0.3, 0.7);
      _m.compose(this._v.copy(r.p).addScaledVector(_p, -0.7), _q, _s);
      this.rocketGlow.setMatrixAt(n++, _m);
    }
    this.rocketMesh.count = this.rocketGlow.count = n;
    this.rocketMesh.instanceMatrix.needsUpdate = this.rocketGlow.instanceMatrix.needsUpdate = true;
  }
}
