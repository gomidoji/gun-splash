import { shotRange, hasWeaponWater } from './game.mjs';

// Correction is always measured from the user's input, never the previous assisted aim.
// While the long barrel charges, the user's input aims (game.mjs turns the barrel toward it at longTurnRate and
// locks it for the last longLockDuration). The correction found when the charge began is kept until the input moves
// (CHARGE_STEER); from then on the input aims as it is.
const CHARGE_STEER = Math.PI / 360;
const turn = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
export class AimAssist {
  constructor() { this.reset(); }
  reset() { this.base = null; this.offset = 0; this.offsetBase = null; this.target = null; }
  visibleTarget(game, actor, shooting) {
    if (!shooting || game.state !== 'playing' || !actor.alive || actor.tapId || actor.recoil > 0 || actor.fireLock > 0 || actor.charge > 0) return null;
    const target = game.actors.find(b => b.id === this.target && b.alive && b.team !== actor.team);
    return target && Math.hypot(target.x - actor.x, target.y - actor.y) <= shotRange(actor) && game.clearPath(actor, target, 2) ? target.id : null;
  }
  resolve(game, actor, { direction, shooting, cursor = null, scale = 1 }, dt) {
    if (direction != null) this.base = direction;
    this.base ??= actor.aim;
    if (actor.weapon === 'long' && actor.charge > 0) {
      this.target = null;
      if (this.offsetBase == null || Math.abs(turn(this.base, this.offsetBase)) > CHARGE_STEER) this.offset = 0;
      return this.base + this.offset;
    }
    if (!shooting || !actor.alive || actor.tapId || actor.recoil > 0 || actor.fireLock > 0) {
      this.offset = 0; this.target = null; return this.base;
    }
    const cone = Math.PI / 12, range = shotRange(actor);
    const candidates = game.actors.filter(b => b.alive && b.team !== actor.team).map(b => {
      const angle = Math.atan2(b.y - actor.y, b.x - actor.x);
      const delta = Math.atan2(Math.sin(angle - this.base), Math.cos(angle - this.base));
      return { b, delta, distance: Math.hypot(b.x - actor.x, b.y - actor.y) };
    }).filter(t => Math.abs(t.delta) <= cone && t.distance <= range && game.clearPath(actor, t.b, 2)
      && (!cursor || Math.hypot(t.b.x - cursor.x, t.b.y - cursor.y) * scale <= 48));
    candidates.sort((a,b) => (Math.abs(a.delta) - (a.b.id === this.target ? .035 : 0)) - (Math.abs(b.delta) - (b.b.id === this.target ? .035 : 0)));
    const chosen = candidates[0];
    if (!chosen) { this.target = null; this.offset = 0; return this.base; }
    this.target = chosen.b.id;
    const long = actor.weapon === 'long' && hasWeaponWater(actor), limit = (long ? 3 : 6) * Math.PI / 180;
    const wanted = Math.max(-limit, Math.min(limit, chosen.delta * (long ? .35 : .6)));
    this.offset = long ? wanted : this.offset + Math.max(-dt * .9, Math.min(dt * .9, wanted - this.offset));
    this.offsetBase = this.base;
    return this.base + this.offset;
  }
}
