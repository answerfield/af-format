import type { JsonValue, TypeDesc } from '@answerfield/bundle';
import { Dimension, Interval, Point, Rational, ValueSet, isContentValue, type Value } from './values.js';

/**
 * JSON encoding of values for responses and states: safe integers as numbers, other rationals as "a/b", sets and
 * lists as arrays, intervals as {"from", "to"}, points as {"x", "y"}, sizes as text, content values as
 * {"content", "args"}, none as null.
 */
export function toJson(v: Value): JsonValue {
    if (v === null || typeof v === 'string' || typeof v === 'boolean') return v;
    if (v instanceof Rational) return v.isInteger && Number.isSafeInteger(Number(v.n)) ? Number(v.n) : v.toString();
    if (v instanceof ValueSet) return v.items.map(toJson);
    if (Array.isArray(v)) return v.map(toJson);
    if (v instanceof Interval) return { from: toJson(v.from), to: toJson(v.to) };
    if (v instanceof Dimension) return v.text;
    if (v instanceof Point) return { x: toJson(v.x), y: toJson(v.y) };
    if (isContentValue(v)) return { content: v.content, args: Object.fromEntries(Object.entries(v.args).map(([k, x]) => [k, toJson(x)])) };
    return null;
}

/** Decodes a JSON value according to a type, e.g. `Set<Int>` or `Rational?`; mismatches yield none. */
export function fromJson(json: JsonValue, type: TypeDesc): Value {
    return decode(json, parseType(type));
}

/** Parsed {@link TypeDesc}. */
interface ParsedType {
    name: string;
    args: ParsedType[];
    optional: boolean;
}

/** Parses a type in source notation; unknown input yields `Any`. */
export function parseType(desc: TypeDesc): ParsedType {
    let pos = 0;
    const parse = (): ParsedType => {
        const m = /^\s*([A-Za-z_]\w*)/.exec(desc.slice(pos));
        if (!m) return { name: 'Any', args: [], optional: false };
        pos += m[0].length;
        const args: ParsedType[] = [];
        if (desc[pos] === '<') {
            pos++;
            do {
                args.push(parse());
                while (desc[pos] === ' ') pos++;
            } while (desc[pos] === ',' && ++pos);
            pos++; // '>'
        }
        const optional = desc[pos] === '?';
        if (optional) pos++;
        return { name: m[1], args, optional };
    };
    return parse();
}

function decode(json: JsonValue, type: ParsedType): Value {
    if (json === null) return null;
    switch (type.name) {
        case 'Int': case 'Rational':
            return typeof json === 'number' ? Rational.of(json) : typeof json === 'string' ? Rational.parse(json) ?? null : null;
        case 'Text': case 'Content': return typeof json === 'string' ? json : null;
        case 'Bool': return json === true;
        case 'Size': case 'Duration': return typeof json === 'string' ? new Dimension(json) : null;
        case 'Set': return Array.isArray(json) ? new ValueSet(json.map(j => decode(j, type.args[0] ?? any))) : null;
        case 'List': return Array.isArray(json) ? json.map(j => decode(j, type.args[0] ?? any)) : null;
        case 'Point':
            if (typeof json === 'object' && !Array.isArray(json)) {
                const x = decode(json.x, rational), y = decode(json.y, rational);
                return x instanceof Rational && y instanceof Rational ? new Point(x, y) : null;
            }
            return null;
        case 'Interval':
            if (typeof json === 'object' && !Array.isArray(json)) {
                const from = decode(json.from, rational), to = decode(json.to, rational);
                return from instanceof Rational && to instanceof Rational ? new Interval(from, to) : null;
            }
            return null;
        default:
            // Enum values are text
            return typeof json === 'string' || typeof json === 'boolean' ? json : null;
    }
}

const any: ParsedType = { name: 'Any', args: [], optional: false };
const rational: ParsedType = { name: 'Rational', args: [], optional: false };
