// Open straight on; pointer dragging can then reveal the other sides.
export function viewSettings(aspect) {
  const portrait = aspect < .85;
  // Frame the printed sheets instead of the unused upper scaffold. Narrow
  // screens retain enough horizontal space for all four front-facing posters.
  const distance = Math.max(10.9, 1.55 + 3.6 / (Math.tan(Math.PI / 10) * aspect));
  return { portrait, distance, minDistance: distance*.72, maxDistance: distance*1.08, targetY: 1.95, elevation: 0, azimuth: 0 };
}

// Center the first four equal-spaced carriers on the front straight of the rail.
export function frontRowPhase(count) {
  return (5.1 / (10.2 + 2 * Math.PI * 1.55) - 3 / count) / 2;
}

// Resolve only when every visible/rear sheet has a decoded, uploaded texture.
// Front-row priority is retained without revealing unfinished rear cards.
export async function loadPosterTextures(cards, load, onFrontReady = () => {}) {
  await Promise.all(cards.slice(0,4).map(load));
  onFrontReady();
  const queue=cards.slice(4);
  const worker=async()=>{ while(queue.length) await load(queue.shift()); };
  await Promise.all([worker(),worker()]);
}

// Exact exponential integration keeps acceleration/coasting equal at every FPS.
export class HoverDriveMotion {
  constructor() { this.speed=0; }
  reset() { this.speed=0; }
  tick(elapsed,{active=false,reduced=false,interacting=false,blocked=false}={}) {
    if(interacting || blocked) { this.reset(); return 0; }
    const dt=Math.max(0,Math.min(elapsed,.08));
    const target=active ? Math.PI*2/(reduced ? 72 : 24) : 0;
    const rate=active ? 7 : 1.15;
    const previous=this.speed, decay=Math.exp(-rate*dt);
    this.speed=target+(previous-target)*decay;
    const angle=target*dt+(previous-target)*(1-decay)/rate;
    if(!active && this.speed<.0003) this.speed=0;
    return angle;
  }
}
