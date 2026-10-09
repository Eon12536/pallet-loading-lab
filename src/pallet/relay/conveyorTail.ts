import type { Pallet, Vec3 } from '../types';
import { beltBounds, CONVEYOR } from './conveyor';
import { cellPose } from './layout';
import { robotCount } from './fleet';

/** Two tangent arcs and a straight return, terminating only at the final sub-line. mm. */
export function tailGeometry(p: Pallet) {
  const right = beltBounds(p).right, robot = robotCount(p) - 1, x = cellPose(robot, p).x;
  const radius = 700, turnRadius = 600, straight = right - x - turnRadius;
  return { right, x, robot, radius, turnRadius, straight, length: Math.PI * radius + straight + Math.PI * turnRadius / 2 };
}
export function tailPoint(p: Pallet, distance: number): Vec3 {
  const g = tailGeometry(p), z = CONVEYOR.deck, y = CONVEYOR.back;
  let arc = Math.max(0, Math.min(g.length, distance));
  if (arc <= Math.PI * g.radius) { const a = -Math.PI / 2 + arc / g.radius; return { x: g.right + Math.cos(a) * g.radius, y: y + g.radius + Math.sin(a) * g.radius, z }; }
  arc -= Math.PI * g.radius;
  if (arc <= g.straight) return { x: g.right - arc, y: y + g.radius * 2, z };
  const a = -Math.PI / 2 - (arc - g.straight) / g.turnRadius;
  return { x: g.x + g.turnRadius + Math.cos(a) * g.turnRadius, y: y + g.radius * 2 + g.turnRadius + Math.sin(a) * g.turnRadius, z };
}
export function mainPoint(p: Pallet, arc: number): Vec3 {
  const b = beltBounds(p), length = b.right - b.left;
  return arc <= length ? { x: b.left + arc, y: CONVEYOR.back, z: CONVEYOR.deck } : tailPoint(p, arc - length);
}
