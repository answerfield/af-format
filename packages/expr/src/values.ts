/**
 * Runtime values. Every number is an exact rational (Int and Rational differ only statically), so all runtimes
 * compute deterministically and identically.
 */

/** Exact rational number, always normalized (reduced, positive denominator). */
export class Rational {
    readonly n: bigint;
    readonly d: bigint;

    constructor(n: bigint, d: bigint = 1n) {
        if (d === 0n) throw new EvalError('Division durch null');
        if (d < 0n) { n = -n; d = -d; }
        const g = gcd(n < 0n ? -n : n, d);
        this.n = g > 1n ? n / g : n;
        this.d = g > 1n ? d / g : d;
    }

    static of(value: number | bigint): Rational {
        if (typeof value === 'bigint') return new Rational(value);
        if (Number.isInteger(value)) return new Rational(BigInt(value));
        return Rational.parseDecimal(String(value))!;
    }

    /** Parses "3", "-1.25", "0,75" exactly; undefined otherwise. */
    static parseDecimal(text: string): Rational | undefined {
        const m = /^([+-]?)(\d+)(?:[.,](\d+))?$/.exec(text.trim());
        if (!m) return undefined;
        const fraction = m[3] ?? '';
        const n = BigInt(m[2] + fraction) * (m[1] === '-' ? -1n : 1n);
        return new Rational(n, 10n ** BigInt(fraction.length));
    }

    /** Parses decimals and fractions "a/b"; undefined otherwise (also for a zero denominator). */
    static parse(text: string): Rational | undefined {
        const m = /^\s*([+-]?\d+)\s*\/\s*(\d+)\s*$/.exec(text);
        if (m) return BigInt(m[2]) === 0n ? undefined : new Rational(BigInt(m[1]), BigInt(m[2]));
        return Rational.parseDecimal(text);
    }

    get isInteger(): boolean { return this.d === 1n; }

    add(o: Rational): Rational { return new Rational(this.n * o.d + o.n * this.d, this.d * o.d); }
    sub(o: Rational): Rational { return new Rational(this.n * o.d - o.n * this.d, this.d * o.d); }
    mul(o: Rational): Rational { return new Rational(this.n * o.n, this.d * o.d); }
    div(o: Rational): Rational { return new Rational(this.n * o.d, this.d * o.n); }
    neg(): Rational { return new Rational(-this.n, this.d); }
    compare(o: Rational): number {
        const diff = this.n * o.d - o.n * this.d;
        return diff < 0n ? -1 : diff > 0n ? 1 : 0;
    }
    equals(o: Rational): boolean { return this.n === o.n && this.d === o.d; }

    toNumber(): number { return Number(this.n) / Number(this.d); }

    /** "3", "-3/4" */
    toString(): string { return this.d === 1n ? String(this.n) : `${this.n}/${this.d}`; }
}

function gcd(a: bigint, b: bigint): bigint {
    while (b !== 0n) [a, b] = [b, a % b];
    return a === 0n ? 1n : a;
}

/** Set in canonical order, so equality and output are deterministic. */
export class ValueSet {
    readonly items: readonly Value[];

    constructor(items: Iterable<Value>) {
        const byKey = new Map<string, Value>();
        for (const item of items) byKey.set(keyOf(item), item);
        this.items = [...byKey.entries()].sort(([a, va], [b, vb]) => compareValues(va, vb) || (a < b ? -1 : a > b ? 1 : 0)).map(([, v]) => v);
    }

    has(value: Value): boolean { return this.items.some(i => valueEquals(i, value)); }
    union(o: ValueSet): ValueSet { return new ValueSet([...this.items, ...o.items]); }
    difference(o: ValueSet): ValueSet { return new ValueSet(this.items.filter(i => !o.has(i))); }
    get size(): number { return this.items.length; }
}

/** Point in the plane with exact coordinates. */
export class Point {
    constructor(readonly x: Rational, readonly y: Rational) { }
    equals(o: Point): boolean { return this.x.equals(o.x) && this.y.equals(o.y); }
    /** School notation `(3 | 4)`. */
    toString(): string { return `(${this.x} | ${this.y})`; }
}

/**
 * Circular arc as a piece of a path (`polygon`): from the angle `from` to `to` (degrees, counterclockwise when `to` is
 * larger) around `center`. As a point it is its end, so it fits into lists of points.
 */
export class Arc extends Point {
    constructor(readonly center: Point, readonly radius: Rational, readonly from: Rational, readonly to: Rational, end: Point) {
        super(end.x, end.y);
    }
}

/** Closed interval `from .. to`. */
export class Interval {
    constructor(readonly from: Rational, readonly to: Rational) { }

    contains(v: Rational): boolean { return v.compare(this.from) >= 0 && v.compare(this.to) <= 0; }
}

/** Displayable value without a type of its own, e.g. `marker(on: x)` or `audio("…")`. */
export interface ContentValue {
    readonly content: string;
    readonly args: Readonly<Record<string, Value>>;
}

/** Measure such as `4em` (Size) or `5s` (Duration), kept as text. */
export class Dimension {
    constructor(readonly text: string) { }
    toString(): string { return this.text; }
}

/** Upper bound for ranges and generated lists (`1 .. n`, `repeat`); protects the runtime from items that would stall it. */
export const MAX_ITEMS = 100_000;

/** Runtime value; `null` is `none`. */
export type Value =
    | Rational | string | boolean | null | ValueSet | readonly Value[] | Interval | Dimension | Point | ContentValue;

/** True for {@link ContentValue}s. */
export function isContentValue(v: Value): v is ContentValue {
    return typeof v === 'object' && v !== null && 'content' in v && !(v instanceof Rational);
}

/** Structural equality; numbers compare exactly. */
export function valueEquals(a: Value, b: Value): boolean {
    if (a === b) return true;
    if (a instanceof Rational && b instanceof Rational) return a.equals(b);
    if (a instanceof ValueSet && b instanceof ValueSet) {
        return a.size === b.size && a.items.every((x, i) => valueEquals(x, b.items[i]));
    }
    if (Array.isArray(a) && Array.isArray(b)) {
        return a.length === b.length && a.every((x, i) => valueEquals(x, b[i]));
    }
    if (a instanceof Interval && b instanceof Interval) return a.from.equals(b.from) && a.to.equals(b.to);
    if (a instanceof Dimension && b instanceof Dimension) return a.text === b.text;
    if (a instanceof Point && b instanceof Point) return a.equals(b);
    return false;
}

/** Order for canonical sets: numbers numerically; otherwise 0, leaving the order to the key. */
function compareValues(a: Value, b: Value): number {
    if (a instanceof Rational && b instanceof Rational) return a.compare(b);
    return 0;
}

/** Canonical string key of a value; equal values have equal keys. */
export function keyOf(v: Value): string {
    if (v === null) return 'none';
    if (v instanceof Rational) return `r:${v}`;
    if (typeof v === 'string') return `t:${v}`;
    if (typeof v === 'boolean') return `b:${v}`;
    if (v instanceof ValueSet) return `s:{${v.items.map(keyOf).join(',')}}`;
    if (Array.isArray(v)) return `l:[${v.map(keyOf).join(',')}]`;
    if (v instanceof Interval) return `i:${v.from}..${v.to}`;
    if (v instanceof Dimension) return `d:${v.text}`;
    if (v instanceof Point) return `pt:${v.x},${v.y}`;
    const c = v as ContentValue;
    return `c:${c.content}(${Object.entries(c.args).map(([k, x]) => `${k}=${keyOf(x)}`).join(',')})`;
}

/** Text representation, e.g. for content and concatenation with `+`. */
export function display(v: Value): string {
    if (v === null) return '';
    if (typeof v === 'string') return v;
    if (typeof v === 'boolean') return v ? 'wahr' : 'falsch';
    if (v instanceof Rational || v instanceof Dimension) return v.toString();
    if (v instanceof ValueSet) return `{${v.items.map(display).join(', ')}}`;
    if (Array.isArray(v)) return v.map(display).join(', ');
    if (v instanceof Interval) return `${v.from} .. ${v.to}`;
    if (v instanceof Point) return v.toString();
    // Markup like mark("…") yields its text (e.g. for accessible names); an image yields its alt text
    if (isContentValue(v) && 'text' in v.args) return display(v.args.text);
    if (isContentValue(v) && v.content === 'image') return display(v.args.alt ?? null);
    if (isContentValue(v) && v.content === 'math') return display(v.args.tex ?? null);
    if (isContentValue(v) && v.content === 'seq') {
        const items = v.args.items;
        return Array.isArray(items) ? items.map(display).join('') : '';
    }
    return '';
}

/** Error while evaluating an expression; the message is shown to authors. */
export class EvalError extends Error {
    override readonly name = 'EvalError';
}
