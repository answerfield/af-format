import type { Expr, Literal, ManualQuestion } from '@answerfield/bundle';
import { Dimension, EvalError, Interval, MAX_ITEMS, Point, Rational, ValueSet, display, isContentValue, valueEquals, type Value } from './values.js';
import { BUILTINS, type Builtin } from './builtins.js';

/** Evaluation environment: name lookup and optional hooks. */
export interface Env {
    /** Value of a name (parameter, state, let, loop variable, response). */
    lookup(name: string): Value;
    /** Coding functions over response variables; available in codings only. */
    meta?(fn: string, vars: string[]): Value;
    /** Additional functions, or overrides of built-ins. */
    functions?: Readonly<Record<string, Builtin>>;
    /** Coders' judgment on a manual question; undefined while still open. */
    judge?(question: ManualQuestion): boolean | undefined;
}

/** Result of a condition with manual parts: true, false, or open (not yet judged). */
export type Truth = boolean | 'open';

/**
 * Evaluates a condition in three-valued logic: `manual(…)` is open until judged; `and`, `or` and `not` follow
 * Kleene (false and open = false, true or open = true). `open` receives only the questions the result still
 * depends on.
 */
export function evaluateCondition(expr: Expr, env: Env, open: (q: ManualQuestion) => void = () => {}): Truth {
    const [truth, questions] = condition(expr, env);
    if (truth === 'open') questions.forEach(open);
    return truth;
}

function condition(expr: Expr, env: Env): [Truth, ManualQuestion[]] {
    if (expr.op === 'manual') {
        const verdict = env.judge?.(expr.question);
        return verdict === undefined ? ['open', [expr.question]] : [verdict, []];
    }
    if (expr.op === 'un' && expr.operator === 'not') {
        const [v, q] = condition(expr.operand, env);
        return [v === 'open' ? v : !v, q];
    }
    if (expr.op === 'bin' && (expr.operator === 'and' || expr.operator === 'or')) {
        const decisive = expr.operator === 'or';
        const [left, lq] = condition(expr.left, env);
        if (left === decisive) return [decisive, []];
        const [right, rq] = condition(expr.right, env);
        if (right === decisive) return [decisive, []];
        return left === 'open' || right === 'open' ? ['open', [...lq, ...rq]] : [!decisive, []];
    }
    return [truthy(evaluate(expr, env)), []];
}

/** Evaluates an expression; throws {@link EvalError}. */
export function evaluate(expr: Expr, env: Env): Value {
    switch (expr.op) {
        case 'lit': return literal(expr.value);
        case 'enum': return expr.value;
        case 'ref': return env.lookup(expr.name);
        case 'set': return new ValueSet(expr.items.map(e => evaluate(e, env)));
        case 'list': return expr.items.map(e => evaluate(e, env));
        case 'if': return truthy(evaluate(expr.cond, env)) ? evaluate(expr.then, env) : evaluate(expr.else, env);
        case 'range': return new Interval(num(evaluate(expr.from, env)), num(evaluate(expr.to, env)));
        case 'un': {
            const v = evaluate(expr.operand, env);
            return expr.operator === 'not' ? !truthy(v) : v === null ? null : num(v).neg();
        }
        case 'bin': return binary(expr.operator, expr.left, expr.right, env);
        case 'member': {
            const target = evaluate(expr.target, env);
            if (target === null) return null;
            // Point coordinates: p.x, p.y
            if (target instanceof Point && (expr.name === 'x' || expr.name === 'y')) return target[expr.name];
            throw new EvalError(`Abgeleitete Größe '.${expr.name}' wird noch nicht unterstützt`);
        }
        case 'index': {
            const list = evaluate(expr.target, env), i = evaluate(expr.index, env);
            if (list === null) return null;
            if (!Array.isArray(list)) throw new EvalError('Index nur bei Listen');
            const n = num(i);
            return n.isInteger && n.n >= 1n && n.n <= BigInt(list.length) ? list[Number(n.n) - 1] : null;
        }
        case 'meta': {
            if (!env.meta) throw new EvalError(`'${expr.fn}' ist nur in Kodierungen verfügbar`);
            return env.meta(expr.fn, expr.vars);
        }
        case 'manual': throw new EvalError("'manual' ist nur als Bedingung einer Kodierung erlaubt");
        case 'call': {
            // Own properties only: a name like `toString` is no function of the bundle
            const own = (table: Readonly<Record<string, Builtin>> | undefined) => (table && Object.hasOwn(table, expr.fn) ? table[expr.fn] : undefined);
            const fn = own(env.functions) ?? own(BUILTINS);
            if (!fn) throw new EvalError(`Unbekannte Funktion '${expr.fn}'`);
            return fn(expr.args.map(a => evaluate(a, env)));
        }
    }
}

function literal(value: Literal): Value {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if ('num' in value) return Rational.parse(value.num)!;
    return new Dimension(value.size);
}

function binary(operator: string, leftExpr: Expr, rightExpr: Expr, env: Env): Value {
    // Short-circuit and/or
    if (operator === 'and') return truthy(evaluate(leftExpr, env)) && truthy(evaluate(rightExpr, env));
    if (operator === 'or') return truthy(evaluate(leftExpr, env)) || truthy(evaluate(rightExpr, env));
    const left = evaluate(leftExpr, env), right = evaluate(rightExpr, env);
    switch (operator) {
        case '==': return valueEquals(left, right);
        case '!=': return !valueEquals(left, right);
        case '<': case '<=': case '>': case '>=': {
            if (!(left instanceof Rational) || !(right instanceof Rational)) return false;
            const c = left.compare(right);
            return operator === '<' ? c < 0 : operator === '<=' ? c <= 0 : operator === '>' ? c > 0 : c >= 0;
        }
        case 'in': {
            if (left === null) return false;
            if (right instanceof Interval) return left instanceof Rational && right.contains(left);
            if (right instanceof ValueSet) return right.has(left);
            if (Array.isArray(right)) return right.some(x => valueEquals(x, left));
            return false;
        }
        case '+':
            // Content with markup or images stays content: "Kaktus / " + del("Kacktus")
            if (isContentValue(left) || isContentValue(right)) return sequence(left, right);
            if (typeof left === 'string' || typeof right === 'string') return display(left) + display(right);
            if (left instanceof ValueSet && right instanceof ValueSet) return left.union(right);
            return arithmetic(left, right, (a, b) => a.add(b));
        case '-':
            if (left instanceof ValueSet && right instanceof ValueSet) return left.difference(right);
            return arithmetic(left, right, (a, b) => a.sub(b));
        case '*': return arithmetic(left, right, (a, b) => a.mul(b));
        case '/': return arithmetic(left, right, (a, b) => a.div(b));
    }
    throw new EvalError(`Unbekannter Operator '${operator}'`);
}

/** Sequence of content (text, markup, images); nested sequences are flattened. */
function sequence(left: Value, right: Value): Value {
    const items = (v: Value): Value[] => (isContentValue(v) && v.content === 'seq' && Array.isArray(v.args.items) ? [...v.args.items] : [v]);
    return { content: 'seq', args: { items: [...items(left), ...items(right)] } };
}

function arithmetic(left: Value, right: Value, op: (a: Rational, b: Rational) => Rational): Value {
    if (left === null || right === null) return null;
    return op(num(left), num(right));
}

/** Only `true` is truthy; `none` and every other value count as false. */
export function truthy(v: Value): boolean {
    return v === true;
}

/** The value as a number; throws {@link EvalError} otherwise. */
export function num(v: Value): Rational {
    if (v instanceof Rational) return v;
    throw new EvalError(`Zahl erwartet, gefunden ${display(v) || String(v)}`);
}

/** Values `for` iterates over: lists, sets, integer ranges; `none` is empty. */
export function iterate(v: Value): Value[] {
    if (Array.isArray(v)) return [...v];
    if (v instanceof ValueSet) return [...v.items];
    if (v instanceof Interval) {
        if (!v.from.isInteger || !v.to.isInteger) throw new EvalError('Nur ganzzahlige Bereiche sind iterierbar');
        if (v.to.n - v.from.n >= BigInt(MAX_ITEMS)) throw new EvalError(`Bereich mit mehr als ${MAX_ITEMS} Werten`);
        const result: Value[] = [];
        for (let i = v.from.n; i <= v.to.n; i++) result.push(new Rational(i));
        return result;
    }
    if (v === null) return [];
    throw new EvalError('Wert ist nicht iterierbar');
}

/** Splits a loop value into the loop variables: value, or value and index. */
export function destructure(v: Value, index: number, count: number): Value[] {
    if (count === 1) return [v];
    // 1-based, like every index
    return [v, new Rational(BigInt(index + 1))];
}
