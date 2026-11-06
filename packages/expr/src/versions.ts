// Versions of an item with parameters: every combination of domain values that satisfies the condition from
// `versions(when: …)`. The compiler checks with the same computation the host uses (e.g. practice with new numbers).

import type { ItemDef, JsonValue } from '@answerfield/bundle';
import { evaluate, truthy } from './evaluate.js';
import { fromJson } from './json.js';
import { EvalError, ValueSet, type Value } from './values.js';

/** Maximum number of combinations checked; more is an error. */
export const MAX_VERSION_COMBINATIONS = 100_000;

/** Parameter values of one version, JSON-encoded as in `ItemParamDef`. */
export type ParamValues = Record<string, JsonValue>;

/** Parameters with their default values. */
export function defaultParams(item: ItemDef): ParamValues {
    return Object.fromEntries((item.params ?? []).map(p => [p.name, p.default]));
}

/**
 * Version test for a fixed set of accommodations, set up once rather than per combination.
 * Evaluation errors count as no.
 */
function tester(item: ItemDef, accommodations: Iterable<string>): (params: Record<string, Value>) => boolean {
    const profile = new ValueSet([...accommodations]);
    const functions = { accommodations: (): Value => profile };
    const condition = item.versions;
    return values => {
        if (!condition) return true;
        try {
            return truthy(evaluate(condition, {
                lookup: name => {
                    if (!(name in values)) throw new EvalError(`'${name}' ist nicht definiert`);
                    return values[name];
                },
                functions
            }));
        } catch {
            return false;
        }
    };
}

/** Does the item's condition hold for these parameters and accommodations? Evaluation errors count as no. */
export function isVersion(item: ItemDef, params: ParamValues, accommodations: Iterable<string> = []): boolean {
    const values = Object.fromEntries((item.params ?? []).map(p => [p.name, fromJson(params[p.name] ?? p.default, p.type)]));
    return tester(item, accommodations)(values);
}

/**
 * All versions (parameter values) valid for these accommodations, in domain order; with `limit` only the first ones
 * (e.g. 1: is there any?). Throws if the domains have more than {@link MAX_VERSION_COMBINATIONS} combinations.
 */
export function itemVersions(item: ItemDef, accommodations: Iterable<string> = [], limit = Infinity): ParamValues[] {
    const params = item.params ?? [];
    const total = params.reduce((n, p) => n * p.values.length, 1);
    if (total > MAX_VERSION_COMBINATIONS) {
        throw new EvalError(`Zu viele Kombinationen (${total}); höchstens ${MAX_VERSION_COMBINATIONS}. Wertebereiche verkleinern.`);
    }
    const test = tester(item, accommodations);
    const decoded = params.map(p => p.values.map(v => fromJson(v, p.type)));
    const result: ParamValues[] = [];
    const values: Record<string, Value> = {};
    const chosen: ParamValues = {};
    const choose = (i: number): boolean => {
        if (i === params.length) {
            if (test(values)) result.push({ ...chosen });
            return result.length >= limit;
        }
        for (let k = 0; k < params[i].values.length; k++) {
            values[params[i].name] = decoded[i][k];
            chosen[params[i].name] = params[i].values[k];
            if (choose(i + 1)) return true;
        }
        return false;
    };
    choose(0);
    return result;
}
