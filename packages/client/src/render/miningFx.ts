// The asteroid sprite fills ~90% of its circle, so stopping a bit inside the radius makes the beam bite into the rock.
const SURFACE_BITE = 0.85;
const SPRAY_CONE = Math.PI / 3;
const DRAG_PER_SECOND = 3;

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface BeamGeometry {
  readonly endX: number;
  readonly endY: number;
  readonly length: number;
  readonly rotation: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  readonly spin: number;
  life: number;
  readonly maxLife: number;
}

export function beamGeometry(from: Point, target: Point & { readonly radius: number }): BeamGeometry {
  const dx = target.x - from.x;
  const dy = target.y - from.y;
  const distance = Math.hypot(dx, dy);
  const length = Math.max(0, distance - target.radius * SURFACE_BITE);
  const scale = distance === 0 ? 0 : length / distance;
  return { endX: from.x + dx * scale, endY: from.y + dy * scale, length, rotation: Math.atan2(dx, -dy) };
}

export function sprayVelocity(beamRotation: number, speed: number, random: () => number): { vx: number; vy: number } {
  const angle = beamRotation + Math.PI + (random() - 0.5) * 2 * SPRAY_CONE;
  return { vx: Math.sin(angle) * speed, vy: -Math.cos(angle) * speed };
}

export function stepParticle(particle: Particle, dtSeconds: number): boolean {
  const drag = Math.max(0, 1 - DRAG_PER_SECOND * dtSeconds);
  particle.x += particle.vx * dtSeconds;
  particle.y += particle.vy * dtSeconds;
  particle.vx *= drag;
  particle.vy *= drag;
  particle.angle += particle.spin * dtSeconds;
  particle.life -= dtSeconds;
  return particle.life > 0;
}
