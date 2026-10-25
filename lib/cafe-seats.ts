import * as THREE from 'three';
export type CafeSeat = {
  id: string;
  surface: THREE.Vector3;
  floorY: number;
  table: string;
  heading: number;
  takeaway: boolean;
  /** Lesehan: sit cross-legged on the floor (surface is the floor itself). */
  floor?: boolean;
};
export const tableKey = (value: unknown) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/meja|table|[\s_.-]/g, '')
    .replace(/^0+(?=\d)/, '');
/** Find connected horizontal seat surfaces, rather than the center of a multi-chair object. */
export function findCafeSeats(cafe: THREE.Object3D): CafeSeat[] {
  cafe.updateWorldMatrix(true, true);
  const scale = cafe.getWorldScale(new THREE.Vector3()).x,
    tables: { key: string; box: THREE.Box3; center: THREE.Vector3 }[] = [],
    seats: CafeSeat[] = [];
  cafe.traverse((node) => {
    if (/meja/i.test(node.name)) {
      const box = new THREE.Box3().setFromObject(node);
      tables.push({ key: tableKey(node.name), box, center: box.getCenter(new THREE.Vector3()) });
    }
  });
  cafe.traverse((node) => {
    if (!(node instanceof THREE.Mesh) || !/kursi/i.test(node.name)) return;
    const geometry = node.geometry as THREE.BufferGeometry,
      p = geometry.getAttribute('position'),
      idx = geometry.index,
      bounds = new THREE.Box3().setFromObject(node),
      thin = bounds.max.y - bounds.min.y < 0.12 * scale;
    const groups = new Map<string, { vertices: THREE.Vector3[]; area: number }[]>(),
      a = new THREE.Vector3(),
      b = new THREE.Vector3(),
      c = new THREE.Vector3(),
      normal = new THREE.Vector3(),
      ab = new THREE.Vector3(),
      ac = new THREE.Vector3();
    for (let i = 0; i < (idx?.count ?? p.count); i += 3) {
      [a, b, c].forEach((v, k) =>
        v.fromBufferAttribute(p, idx ? idx.getX(i + k) : i + k).applyMatrix4(node.matrixWorld),
      );
      normal.crossVectors(ab.subVectors(b, a), ac.subVectors(c, a));
      const area = normal.length() / 2;
      if (area < 1e-10 || normal.y / normal.length() < 0.95) continue;
      const y = (a.y + b.y + c.y) / 3;
      if (!thin && (y < bounds.min.y + 0.23 * scale || y > bounds.min.y + 0.65 * scale)) continue;
      const key = String(Math.round(y / (0.003 * scale))),
        list = groups.get(key) ?? [];
      list.push({ vertices: [a.clone(), b.clone(), c.clone()], area });
      groups.set(key, list);
    }
    for (const triangles of groups.values()) {
      const parent = triangles.map((_, i) => i),
        find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]))),
        vertices = new Map<string, number>();
      triangles.forEach((tri, i) =>
        tri.vertices.forEach((v) => {
          const key = [v.x, v.y, v.z].map((n) => Math.round(n / (0.0001 * scale))).join(',');
          const previous = vertices.get(key);
          if (previous !== undefined) parent[find(i)] = find(previous);
          else vertices.set(key, i);
        }),
      );
      const components = new Map<number, { box: THREE.Box3; area: number }>();
      triangles.forEach((tri, i) => {
        const key = find(i),
          group = components.get(key) ?? { box: new THREE.Box3(), area: 0 };
        tri.vertices.forEach((v) => group.box.expandByPoint(v));
        group.area += tri.area;
        components.set(key, group);
      });
      for (const { box, area } of components.values()) {
        const size = box.getSize(new THREE.Vector3());
        if (area < 0.025 * scale * scale || Math.min(size.x, size.z) < 0.13 * scale) continue;
        const center = box.getCenter(new THREE.Vector3()),
          longX = size.x > size.z,
          length = Math.max(size.x, size.z),
          count = Math.max(1, Math.floor(length / (0.5 * scale)));
        for (let i = 0; i < count; i++) {
          const surface = center.clone();
          if (count > 1)
            surface[longX ? 'x' : 'z'] = box.min[longX ? 'x' : 'z'] + (length * (i + 0.5)) / count;
          if (
            seats.some(
              (s) =>
                Math.hypot(s.surface.x - surface.x, s.surface.z - surface.z) < 0.1 * scale &&
                Math.abs(s.surface.y - surface.y) < 0.07 * scale,
            )
          )
            continue;
          const table = tables
            .filter(
              (t) =>
                t.box.max.y > surface.y - 0.08 * scale && t.box.max.y < surface.y + 0.85 * scale,
            )
            .sort(
              (u, v) =>
                Math.hypot(u.center.x - surface.x, u.center.z - surface.z) -
                Math.hypot(v.center.x - surface.x, v.center.z - surface.z),
            )[0];
          seats.push({
            id: node.uuid + ':' + seats.length,
            surface,
            floorY: Math.max(
              cafe.localToWorld(new THREE.Vector3(0, 0.174, 0)).y,
              thin ? cafe.localToWorld(new THREE.Vector3(0, 0.174, 0)).y : bounds.min.y,
            ),
            table: table?.key ?? '',
            heading: table ? Math.atan2(table.center.x - surface.x, table.center.z - surface.z) : 0,
            takeaway: /take.?away/i.test(node.name),
          });
        }
      }
    }
  });
  // Upstairs indoor is lesehan: low tables (meja atas 1, 2) with places on the floor around them.
  cafe.traverse((node) => {
    if (!/^meja_?atas_?\d/i.test(node.name)) return;
    const box = new THREE.Box3().setFromObject(node),
      center = box.getCenter(new THREE.Vector3()),
      floorY = box.min.y,
      gap = 0.24 * scale;
    const places = [
      [box.min.x - gap, center.z],
      [box.max.x + gap, center.z],
      [center.x - 0.25 * scale, box.min.z - gap],
      [center.x + 0.25 * scale, box.min.z - gap],
      [center.x - 0.25 * scale, box.max.z + gap],
      [center.x + 0.25 * scale, box.max.z + gap],
    ];
    places.forEach(([x, z], i) =>
      seats.push({
        id: node.uuid + ':floor' + i,
        surface: new THREE.Vector3(x, floorY, z),
        floorY,
        table: tableKey(node.name),
        heading: Math.atan2(center.x - x, center.z - z),
        takeaway: false,
        floor: true,
      }),
    );
  });
  return seats;
}
