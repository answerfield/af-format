/**
 * Geometry for codings: distances, angles, position, areas. Exact with fractions where possible (area, shapes);
 * distances and angles are decimals (square roots, trigonometry), so codings compare them with a tolerance.
 * The built-ins map missing points (none) to none or false before calling into this module.
 */
import { Arc, EvalError, Point, Rational } from './values.js';

const n = (r: Rational) => r.toNumber();

/** Decimal as a fraction rounded to 6 places (enough for comparisons with a tolerance). */
function dec(x: number): Rational {
    return new Rational(BigInt(Math.round(x * 1e6)), 1000000n);
}

/** Euclidean distance, rounded to 6 decimal places. */
export function distance(a: Point, b: Point): Rational {
    return dec(Math.hypot(n(b.x) - n(a.x), n(b.y) - n(a.y)));
}

/** Angle at `vertex` between the rays to `a` and `b`, in degrees (0 to 180); null if a ray has zero length. */
export function angle(a: Point, vertex: Point, b: Point): Rational | null {
    const ux = n(a.x) - n(vertex.x), uy = n(a.y) - n(vertex.y);
    const vx = n(b.x) - n(vertex.x), vy = n(b.y) - n(vertex.y);
    const lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
    if (lu === 0 || lv === 0) return null;
    const cos = Math.min(1, Math.max(-1, (ux * vx + uy * vy) / (lu * lv)));
    return dec((Math.acos(cos) * 180) / Math.PI);
}
/** Point at distance `radius` from `center` in direction `degrees` (counterclockwise from the x-axis). */
export function polar(center: Point, radius: Rational, degrees: Rational): Point {
    const a = (n(degrees) * Math.PI) / 180;
    return new Point(center.x.add(dec(n(radius) * Math.cos(a))), center.y.add(dec(n(radius) * Math.sin(a))));
}

/** Arc around `center` from `from` to `to` degrees; as a point it is its end. */
export function arc(center: Point, radius: Rational, from: Rational, to: Rational): Arc {
    return new Arc(center, radius, from, to, polar(center, radius, to));
}

/** Exact area of a polygon (shoelace formula). */
export function area(points: Point[]): Rational {
    let twice = new Rational(0n);
    points.forEach((p, i) => {
        const q = points[(i + 1) % points.length];
        twice = twice.add(p.x.mul(q.y)).sub(q.x.mul(p.y));
    });
    return twice.n < 0n ? twice.neg().div(new Rational(2n)) : twice.div(new Rational(2n));
}


/** Segment with fixed direction (smaller point first), so [a, b] and [b, a] are equal. */
function ordered(a: Point, b: Point): [Point, Point] {
    const c = a.x.compare(b.x) || a.y.compare(b.y);
    return c <= 0 ? [a, b] : [b, a];
}

function bigAbs(n: bigint): bigint { return n < 0n ? -n : n; }
function bigGcd(a: bigint, b: bigint): bigint { while (b !== 0n) [a, b] = [b, a % b]; return a; }

/**
 * Figure made of segments, as a set of unit lattice steps: segments with integer endpoints are split at every
 * lattice point (so a side is the same whether drawn in one stroke or in pieces); direction does not matter.
 * `anywhere`: position-independent, translated so the smallest coordinates are 0.
 */
export function shape(segments: [Point, Point][], anywhere: boolean): [Point, Point][] {
    const steps: [Point, Point][] = [];
    for (const [a, b] of segments) {
        const dx = b.x.sub(a.x), dy = b.y.sub(a.y);
        if (dx.n === 0n && dy.n === 0n) continue;
        const lattice = a.x.isInteger && a.y.isInteger && b.x.isInteger && b.y.isInteger;
        const k = lattice ? bigGcd(bigAbs(dx.n), bigAbs(dy.n)) : 1n;
        if (k > 10_000n || steps.length + Number(k) > 100_000) throw new EvalError('shape: Strecken zu lang (mehr als 100 000 Gitterschritte)');
        const sx = dx.div(new Rational(k)), sy = dy.div(new Rational(k));
        for (let i = 0n; i < k; i++) {
            const p = new Point(a.x.add(sx.mul(new Rational(i))), a.y.add(sy.mul(new Rational(i))));
            steps.push(ordered(p, new Point(p.x.add(sx), p.y.add(sy))));
        }
    }
    if (!anywhere || steps.length === 0) return steps;
    const all = steps.flat();
    const minX = all.reduce((m, p) => (p.x.compare(m) < 0 ? p.x : m), all[0].x);
    const minY = all.reduce((m, p) => (p.y.compare(m) < 0 ? p.y : m), all[0].y);
    return steps.map(([p, q]) => [new Point(p.x.sub(minX), p.y.sub(minY)), new Point(q.x.sub(minX), q.y.sub(minY))]);
}
