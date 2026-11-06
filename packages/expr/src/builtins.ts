import { accept, accepted } from './accept.js';
import { readNumber, readProportion, readQuantity, roundsTo } from './numbers.js';
import { Arc, EvalError, MAX_ITEMS, Point, Rational, ValueSet, valueEquals, type ContentValue, type Value } from './values.js';
import * as geo from './geometry.js';

/** Built-in function; arguments in parameter order with defaults filled in, variadic ones appended. */
export type Builtin = (args: Value[]) => Value;

function text(v: Value): string {
    if (typeof v === 'string') return v;
    if (v === null) return '';
    throw new EvalError('Text erwartet');
}


function int(v: Value): number {
    return v instanceof Rational ? v.toNumber() : 0;
}

function content(name: string, keys: string[]): Builtin {
    return args => ({ content: name, args: Object.fromEntries(keys.map((k, i) => [k, args[i] ?? null])) }) satisfies ContentValue;
}

/** Meaning (enum Markup) → content kind used for rendering. */
const MARKUP: Readonly<Record<string, string>> = {
    reference: 'mark',
    emphasis: 'emph',
    important: 'strong',
    work_title: 'title',
    deleted: 'del',
    superscript: 'sup',
    subscript: 'sub'
};

/** Fraction notation a/b (whitespace allowed); undefined if not a fraction. */
function fractionParts(t: string): [bigint, bigint] | undefined {
    const m = /^\s*([+-]?\d+)\s*\/\s*(\d+)\s*$/.exec(t);
    return m ? [BigInt(m[1]), BigInt(m[2])] : undefined;
}

/**
 * Built-in functions by name; an {@link Env} may add or override functions. With the item and coding functions of
 * `@answerfield/runtime-core` they are the functions marked `runtime` in the catalog of `@answerfield/bundle`.
 */
export const BUILTINS: Readonly<Record<string, Builtin>> = {
    count: ([list, value]) => new Rational(BigInt(Array.isArray(list) ? list.filter(v => valueEquals(v, value)).length : 0)),
    count_in: ([list, values]) => new Rational(BigInt(Array.isArray(list) && values instanceof ValueSet ? list.filter(v => values.has(v)).length : 0)),
    size: ([collection]) => {
        if (collection instanceof ValueSet) return new Rational(BigInt(collection.size));
        if (Array.isArray(collection)) return new Rational(BigInt(collection.length));
        throw new EvalError('size erwartet eine Menge oder Liste');
    },
    number: ([t]) => readNumber(text(t)) ?? null,
    is_reduced: ([t]) => {
        const parts = fractionParts(text(t));
        if (!parts) return Rational.parseDecimal(text(t))?.isInteger ?? false;
        const [n, d] = parts;
        return d !== 0n && new Rational(n, d).d === d;
    },
    accept: ([t, pattern, typos, kase]) => accept(text(t), text(pattern), { typos: int(typos), case: kase === true }),
    accepted: ([answers, patterns, typos, kase]) => {
        if (!Array.isArray(answers) || !Array.isArray(patterns)) throw new EvalError('accepted erwartet zwei Listen');
        return new Rational(BigInt(accepted(answers.map(text), patterns.map(text), { typos: int(typos), case: kase === true })));
    },
    proportion: ([t]) => readProportion(text(t)) ?? null,
    rounds_to: ([t, value, digits]) => value instanceof Rational && roundsTo(text(t), value, int(digits)),
    quantity: ([t, unit]) => readQuantity(text(t), text(unit)) ?? null,
    // Geometry: missing points yield none (or false)
    point: ([x, y]) => (x instanceof Rational && y instanceof Rational ? new Point(x, y) : null),
    polar: ([c, r, d]) => (c instanceof Point && r instanceof Rational && d instanceof Rational ? geo.polar(c, r, d) : null),
    arc: ([c, r, f, t]) => (c instanceof Point && r instanceof Rational
        ? geo.arc(c, r, f instanceof Rational ? f : new Rational(0n), t instanceof Rational ? t : new Rational(360n)) : null),
    distance: ([a, b]) => (a instanceof Point && b instanceof Point ? geo.distance(a, b) : null),
    angle: ([a, v, b]) => (a instanceof Point && v instanceof Point && b instanceof Point ? geo.angle(a, v, b) : null),
    area: ([points]) => {
        // Arcs have no exact area (π): only polygons of straight sides
        if (!Array.isArray(points) || points.length < 3 || !points.every(p => p instanceof Point && !(p instanceof Arc))) return null;
        return geo.area(points as Point[]);
    },
    shape: ([lines, anywhere]) => {
        const items = lines instanceof ValueSet ? lines.items : Array.isArray(lines) ? lines : [];
        const segments = items.filter((s): s is Value[] => Array.isArray(s) && s.length === 2 && s.every(p => p instanceof Point))
            .map(s => [s[0], s[1]] as [Point, Point]);
        return new ValueSet(geo.shape(segments, anywhere !== false));
    },
    words: ([t]) => text(t).split(/\s+/).filter(w => w !== ''),
    normalize: ([t, keepCase, spaces]) => {
        let s = text(t);
        if (spaces === 'remove') s = s.replace(/\s+/g, '');
        else if (spaces === 'collapse') s = s.trim().replace(/\s+/g, ' ');
        return keepCase === false ? s.toLowerCase() : s;
    },
    repeat: ([value, n]) => {
        const length = n instanceof Rational ? Math.max(0, n.toNumber()) : 0;
        if (length > MAX_ITEMS) throw new EvalError(`repeat: mehr als ${MAX_ITEMS} Elemente`);
        return Array.from({ length }, () => value);
    },
    replace: ([list, at, value]) => {
        if (!Array.isArray(list)) throw new EvalError('replace erwartet eine Liste');
        const i = at instanceof Rational ? at.toNumber() : 0;
        if (!Number.isInteger(i) || i < 1 || i > list.length) throw new EvalError(`replace: Stelle ${i} liegt außerhalb der Liste`);
        return list.map((v, k) => (k === i - 1 ? value : v));
    },
    image: content('image', ['src', 'alt', 'width']),
    // Prepared by the compiler: [MathML, LaTeX]
    math: content('math', ['mathml', 'tex']),
    markup: ([kind, t]) => ({ content: MARKUP[String(kind)] ?? 'emph', args: { text: t ?? null } }) satisfies ContentValue
};
