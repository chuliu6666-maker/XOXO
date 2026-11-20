// Pure motion math: one closed stadium route and a fixed-step spring system.
// Units are world units / seconds, independent of screen size and refresh rate.
export const wrap = (value, range = 1) => ((value % range) + range) % range;
export const clamp = (x, min, max) => Math.max(min, Math.min(max, x));

export function stadium(u, halfStraight = 2.55, radius = 1.55) {
  const line = halfStraight * 2, arc = Math.PI * radius;
  let d = wrap(u) * (2 * line + 2 * arc);
  if (d < line) return { x: -halfStraight + d, z: radius, tx: 1, tz: 0 };
  d -= line;
  if (d < arc) { const t = Math.PI / 2 - d / radius; return { x: halfStraight + radius * Math.cos(t), z: radius * Math.sin(t), tx: Math.sin(t), tz: -Math.cos(t) }; }
  d -= arc;
  if (d < line) return { x: halfStraight - d, z: -radius, tx: -1, tz: 0 };
  d -= line;
  const t = -Math.PI / 2 - d / radius;
  return { x: -halfStraight + radius * Math.cos(t), z: radius * Math.sin(t), tx: Math.sin(t), tz: -Math.cos(t) };
}

export class ConveyorMotion {
  constructor(count = 12) {
    this.count = count;
    this.phase = 0.085;
    this.velocity = 0;
    this.impulse = 0;
    this.drive = 0;
    this.auto = false;
    this.hovered = false;
    this.blocked = false;
    this.orbitMode = false;
    this.reduced = false;
    this.dragging = false;
    this.accumulator = 0;
    this.swings = Array.from({ length: count }, () => ({ angle: 0, velocity: 0 }));
  }
  nudge(distance) { this.impulse += distance * 4; }
  dragBy(distance, elapsed) {
    this.auto = false;
    this.dragging = true;
    this.phase = wrap(this.phase + distance);
    this.velocity = clamp(this.velocity * .35 + distance / Math.max(.008, elapsed) * .65, -.23, .23);
    if (!this.reduced) this.swings.forEach(s => { s.velocity += clamp(-distance * 15, -.35, .35); });
  }
  tick(elapsed,{transportSpeed=0}={}) {
    if (this.blocked) { this.velocity=0; this.impulse=0; this.accumulator=0; return; }
    this.accumulator += clamp(elapsed, 0, 0.08);
    const dt = 1 / 120;
    while (this.accumulator >= dt) {
      const old = this.velocity;
      const target = (!this.orbitMode && (this.auto || this.hovered) && !this.dragging ? (this.reduced ? 0.003 : 0.009) : 0) + this.drive * 0.07;
      this.velocity += (target - this.velocity) * (1 - Math.exp(-3.8 * dt));
      this.velocity = clamp(this.velocity + this.impulse, -0.23, 0.23);
      this.impulse = 0;
      if (!this.dragging) this.phase = wrap(this.phase + this.velocity * dt);
      else this.velocity *= Math.exp(-5 * dt);
      const acceleration = (this.velocity - old) / dt;
      this.swings.forEach((spring, i) => {
        const force = this.reduced ? 0 : clamp(-acceleration * 0.3, -2.5, 2.5);
        // Suspended posters trail the chain even at steady speed, then settle back.
        const lean = this.reduced ? 0 : clamp(-(transportSpeed+this.velocity)*6.4,-.34,.34) * (.95+i%3*.035);
        spring.velocity += (-22 * (spring.angle-lean) - 4.2 * spring.velocity + force * (1 + i % 3 * .08)) * dt;
        spring.angle = clamp(spring.angle + spring.velocity * dt, -0.42, 0.42);
      });
      this.accumulator -= dt;
    }
  }
  reset() {
    this.phase = 0.085; this.velocity = 0; this.impulse = 0; this.drive = 0; this.auto = false; this.hovered=false; this.blocked=false; this.dragging = false; this.accumulator = 0;
    this.swings.forEach(s => { s.angle = 0; s.velocity = 0; });
  }
}
