import * as THREE from 'three';
export type CafePathData = { version: number; modelSha?: string; nodes: number[][] };
/** Runtime only searches the prebuilt graph; no navmesh baking on visitors' devices. */
export function cafePaths(cafe: THREE.Object3D, data: CafePathData) {
  cafe.updateWorldMatrix(true, true);
  const inverse = cafe.matrixWorld.clone().invert(),
    scale = cafe.getWorldScale(new THREE.Vector3()).x;
  const nodes = data.nodes.map((row, id) => ({
    id,
    p: new THREE.Vector3(row[0], row[1], row[2]),
    edges: row.slice(3),
  }));
  // The fish pond's dry bottom was baked as floor; nobody walks in the water.
  const wet = new Set(nodes.filter((n) => n.p.y < -0.1).map((n) => n.id));
  // Nodes sit on a 0.12 grid; a cell index finds the ones under a point quickly.
  const CELL = 0.12,
    cells = new Map<string, (typeof nodes)[number][]>(),
    cellKey = (x: number, z: number) => Math.round(x / CELL) + ':' + Math.round(z / CELL);
  for (const node of nodes) {
    if (wet.has(node.id)) continue;
    const key = cellKey(node.p.x, node.p.z),
      list = cells.get(key) ?? [];
    list.push(node);
    cells.set(key, list);
  }
  // The bake leaves a gap of one grid cell at some risers (the capsule touches the step edge),
  // e.g. the last step up into the bar box. Free walking may hop such a gap: two cells apart,
  // one riser up or down, never into the pond.
  const hops = new Map<number, number[]>();
  for (const node of nodes) {
    if (wet.has(node.id)) continue;
    const ix = Math.round(node.p.x / CELL),
      iz = Math.round(node.p.z / CELL),
      list: number[] = [];
    for (let dx = -2; dx <= 2; dx++)
      for (let dz = -2; dz <= 2; dz++)
        for (const other of cells.get(ix + dx + ':' + (iz + dz)) ?? []) {
          const rise = Math.abs(other.p.y - node.p.y),
            run = Math.hypot(other.p.x - node.p.x, other.p.z - node.p.z);
          if (rise > 0.1 && rise < 0.3 && run < 0.3) list.push(other.id);
        }
    if (list.length) hops.set(node.id, list);
  }
  const local = (p: THREE.Vector3) => p.clone().applyMatrix4(inverse),
    world = (p: THREE.Vector3) => cafe.localToWorld(p.clone());
  function nearest(p: THREE.Vector3, max = 1) {
    let best: (typeof nodes)[number] | undefined,
      d = max;
    for (const node of nodes) {
      if (wet.has(node.id)) continue;
      const distance = Math.hypot(node.p.x - p.x, node.p.z - p.z) + Math.abs(node.p.y - p.y) * 3;
      if (distance < d) {
        d = distance;
        best = node;
      }
    }
    return best;
  }
  function path(
    from: THREE.Vector3,
    to: THREE.Vector3,
    role: 'staff' | 'visitor' = 'staff',
    avoid: THREE.Vector3[] = [],
  ) {
    const start = nearest(local(from)),
      end = nearest(local(to), 0.9);
    if (!start || !end) return null;
    const blocked = avoid.map(local);
    const open = [start.id],
      score = new Map([[start.id, 0]]),
      previous = new Map<number, number>(),
      closed = new Set<number>();
    while (open.length) {
      let best = 0,
        bestScore = Infinity;
      open.forEach((id, i) => {
        const value = score.get(id)! + nodes[id].p.distanceTo(end.p);
        if (value < bestScore) {
          best = i;
          bestScore = value;
        }
      });
      const id = open.splice(best, 1)[0];
      if (id === end.id) {
        const result = [end.p.clone()];
        let cursor = id;
        while (previous.has(cursor)) {
          cursor = previous.get(cursor)!;
          result.push(nodes[cursor].p.clone());
        }
        result.reverse();
        if (result.length > 1 && result[0].distanceTo(local(from)) < 0.2) result.shift();
        return result
          .filter(
            (p, i) =>
              !i ||
              i === result.length - 1 ||
              result[i - 1]
                .clone()
                .sub(p)
                .normalize()
                .dot(
                  p
                    .clone()
                    .sub(result[i + 1])
                    .normalize(),
                ) < 0.999,
          )
          .map(world);
      }
      if (closed.has(id)) continue;
      closed.add(id);
      for (const next of nodes[id].edges) {
        const p = nodes[next].p;
        if (wet.has(next)) continue;
        if (
          blocked.some((b) => Math.abs(b.y - p.y) < 0.65 && Math.hypot(b.x - p.x, b.z - p.z) < 0.32)
        )
          continue;
        if (
          role === 'visitor' &&
          p.y < 1.5 &&
          p.x > -4.53 &&
          p.x < -2.14 &&
          p.z > 2.94 &&
          p.z < 4.96
        )
          continue;
        if (closed.has(next)) continue;
        const value = score.get(id)! + nodes[id].p.distanceTo(nodes[next].p);
        if (value < (score.get(next) ?? Infinity)) {
          score.set(next, value);
          previous.set(next, id);
          open.push(next);
        }
      }
    }
    return null;
  }
  const walk: THREE.Mesh[] = [];
  cafe.traverse((n) => {
    if (!(n instanceof THREE.Mesh)) return;
    let node: THREE.Object3D | null = n;
    while (node && node !== cafe) {
      if (
        /floor|lantai|tangga|trotoar/.test(node.name) ||
        node.name === 'Cube007' ||
        node.name === 'Cube008'
      ) {
        walk.push(n);
        break;
      }
      node = node.parent;
    }
  });
  const ray = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0)),
    up = new THREE.Vector3(),
    FOOT = [
      [0, 0],
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
  /**
   * Floor height under a foot-sized spot: the highest walkable surface from one riser below to
   * one above `p`. Sampling a small disc bridges the open gaps between the bar box's treads,
   * and keeps feet on the rim instead of dropping into the pond or off a platform.
   */
  function ground(p: THREE.Vector3) {
    let best = -Infinity;
    for (const [dx, dz] of FOOT) {
      ray.ray.origin.set(p.x + dx * 0.06 * scale, p.y + 0.46 * scale, p.z + dz * 0.06 * scale);
      ray.far = 0.46 * scale + 0.31 * scale;
      for (const hit of ray.intersectObjects(walk, false)) {
        if (!hit.face) continue;
        if (up.copy(hit.face.normal).transformDirection(hit.object.matrixWorld).y < 0.65) continue;
        if (hit.point.y <= p.y + 0.32 * scale && hit.point.y > best) best = hit.point.y;
      }
    }
    return Number.isFinite(best) ? best : p.y;
  }
  /** Like `ground`, but null where there is no café floor at all (outside the model). */
  function groundHit(p: THREE.Vector3) {
    const y = ground(p);
    return y === p.y && !hasFloor(p) ? null : y;
  }
  function hasFloor(p: THREE.Vector3) {
    ray.ray.origin.set(p.x, p.y + 0.46 * scale, p.z);
    ray.far = 0.77 * scale;
    return ray.intersectObjects(walk, false).some((h) => !!h.face);
  }
  /**
   * One step of free walking (explore mode). Returns the floor point under `to` when it can be
   * reached from the node Luna stands on: same, neighbouring or riser-gap nodes only, so walls,
   * the pond and drops stay closed while stair treads (one riser at a time) are fine.
   */
  function step(from: THREE.Vector3, to: THREE.Vector3, current?: number) {
    const a = local(from),
      b = local(to);
    const here =
      current !== undefined && !wet.has(current) && nodes[current].p.distanceTo(a) < 0.3
        ? nodes[current]
        : nearest(a, 0.5);
    if (!here) return null;
    const ix = Math.round(b.x / CELL),
      iz = Math.round(b.z / CELL),
      levels: number[] = [];
    let best: (typeof nodes)[number] | undefined,
      // Stair flights are only a node or two wide, so reach a little past the 0.12 grid.
      d = 0.17;
    for (let dx = -2; dx <= 2; dx++)
      for (let dz = -2; dz <= 2; dz++)
        for (const node of cells.get(ix + dx + ':' + (iz + dz)) ?? []) {
          if (Math.abs(node.p.y - a.y) > 0.34) continue;
          const distance = Math.hypot(node.p.x - b.x, node.p.z - b.z);
          if (distance >= 0.26) continue;
          levels.push(node.p.y);
          if (distance >= 0.17) continue;
          if (distance < d) {
            d = distance;
            best = node;
          }
        }
    if (!best) return null;
    const near =
      best === here ||
      here.edges.includes(best.id) ||
      here.edges.some((e) => nodes[e].edges.includes(best!.id)) ||
      !!hops.get(here.id)?.includes(best.id);
    if (!near) return null;
    // Floor under the new spot, measured from Luna's current height (one riser up or down).
    const point = world(new THREE.Vector3(b.x, a.y, b.z));
    point.y = ground(point);
    // It must be a floor the walk graph knows here (not the pond bottom or the courtyard below
    // a platform).
    const y = local(point).y;
    if (y < -0.1 || !levels.some((l) => Math.abs(l - y) < 0.16)) return null;
    return { point, node: best.id };
  }
  return {
    scale,
    path,
    step,
    local,
    world,
    ground,
    groundHit,
    nodes,
    snap(p: THREE.Vector3, max = 1) {
      const n = nearest(local(p), max);
      return n ? world(n.p) : null;
    },
  };
}
export type CafePaths = ReturnType<typeof cafePaths>;
