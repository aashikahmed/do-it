/**
 * A 400 m-style track: two straights and two bends, run counter-clockwise like a real race. Distances are along the
 * lane, so `pt(s, R)` is `s` units from the finish line (on the home straight, bottom right) in the lane of radius R.
 */
export function oval(cx: number, cy: number, half: number) {
  const fx = half * 0.55;
  const length = (R: number) => 4 * half + 2 * Math.PI * R;
  const pt = (s: number, R: number): [number, number] => {
    const L = length(R);
    s = ((s % L) + L) % L;
    if (s < half - fx) return [cx + fx + s, cy + R];
    s -= half - fx;
    if (s < Math.PI * R) {
      const a = Math.PI / 2 - s / R;
      return [cx + half + R * Math.cos(a), cy + R * Math.sin(a)];
    }
    s -= Math.PI * R;
    if (s < 2 * half) return [cx + half - s, cy - R];
    s -= 2 * half;
    if (s < Math.PI * R) {
      const a = -Math.PI / 2 - s / R;
      return [cx - half + R * Math.cos(a), cy + R * Math.sin(a)];
    }
    s -= Math.PI * R;
    return [cx - half + s, cy + R];
  };
  const r1 = (n: number) => Math.round(n * 10) / 10;
  /** a polyline from s0 to s1 in lane R, a point every ~3 units */
  const path = (s0: number, s1: number, R: number) => {
    const n = Math.max(2, Math.ceil(Math.abs(s1 - s0) / 3));
    let d = "";
    for (let k = 0; k <= n; k++) {
      const [x, y] = pt(s0 + ((s1 - s0) * k) / n, R);
      d += `${k ? "L" : "M"}${r1(x)} ${r1(y)}`;
    }
    return d;
  };
  return { length, pt, path, full: (R: number) => path(0, length(R), R) + "Z" };
}
