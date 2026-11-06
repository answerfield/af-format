import { describe, expect, test } from 'vitest';
import type { Expr } from '@answerfield/bundle';
import { BUILTINS, Interval, Rational, ValueSet, display, evaluate, fromJson, iterate, toJson, valueEquals, variants, type Value } from '../src/index.js';

const n = (s: string): Expr => ({ op: 'lit', value: { num: s } });
const r = (s: string) => Rational.parse(s)!;
const env = (vars: Record<string, Value> = {}) => ({ lookup: (name: string) => vars[name] ?? null });

describe('Rational', () => {
    test('kürzt und rechnet exakt', () => {
        expect(r('6/8').toString()).toBe('3/4');
        expect(r('1/3').add(r('1/6')).toString()).toBe('1/2');
        expect(r('0,75').equals(r('3/4'))).toBe(true);
        expect(r('-1.5').toString()).toBe('-3/2');
        expect(r('1/20').mul(Rational.of(12)).toString()).toBe('3/5');
    });

    test('Division Int / Int ergibt Bruch', () => {
        expect(display(evaluate({ op: 'bin', operator: '/', left: n('3'), right: n('4') }, env()))).toBe('3/4');
    });
});

describe('Ausdrücke', () => {
    test('Mengen: Vereinigung, Differenz, Gleichheit unabhängig von Reihenfolge', () => {
        const a = new ValueSet([r('3'), r('1')]);
        const b = evaluate({ op: 'set', items: [n('1'), n('3'), n('1')] }, env());
        expect(valueEquals(a, b)).toBe(true);
        const minus = evaluate({ op: 'bin', operator: '-', left: { op: 'ref', name: 'a' }, right: { op: 'set', items: [n('1')] } }, env({ a }));
        expect(display(minus)).toBe('{3}');
    });

    test('in mit Intervall und none', () => {
        const range: Expr = { op: 'range', from: { op: 'bin', operator: '/', left: n('1'), right: n('2') }, to: { op: 'bin', operator: '/', left: n('7'), right: n('10') } };
        const inRange = (v: Value) => evaluate({ op: 'bin', operator: 'in', left: { op: 'ref', name: 'x' }, right: range }, env({ x: v }));
        expect(inRange(r('3/5'))).toBe(true);
        expect(inRange(r('3/4'))).toBe(false);
        expect(inRange(null)).toBe(false);
    });

    test('Textverkettung', () => {
        expect(evaluate({ op: 'bin', operator: '+', left: { op: 'lit', value: 'Teil ' }, right: n('3') }, env())).toBe('Teil 3');
    });

    test('ganzzahlige Bereiche sind iterierbar', () => {
        expect(iterate(new Interval(r('1'), r('4'))).map(display)).toEqual(['1', '2', '3', '4']);
    });
});

describe('Funktionen', () => {
    test('number liest Brüche exakt; is_reduced', () => {
        expect(display(BUILTINS.number([' 6 / 8 ']))).toBe('3/4');
        expect(BUILTINS.number(['xyz'])).toBe(null);
        expect(BUILTINS.is_reduced(['3/4'])).toBe(true);
        expect(BUILTINS.is_reduced(['6/8'])).toBe(false);
        expect(BUILTINS.is_reduced(['0,75'])).toBe(false);
    });

    test('count und count_in zählen genau, auch leere Werte', () => {
        const faces: Value[] = ['3', '1', '3', '', '7', '3'];
        expect(display(BUILTINS.count([faces, '3']))).toBe('3');
        expect(display(BUILTINS.count([faces, '']))).toBe('1');
        expect(display(BUILTINS.count([[r('3'), null, r('6/2')], r('3')]))).toBe('2');
        expect(display(BUILTINS.count([[r('3'), null], null]))).toBe('1');
        expect(display(BUILTINS.count_in([faces, new ValueSet(['0', '7', '9'])]))).toBe('1');
    });
});

describe('JSON', () => {
    test('Hin- und Rückweg', () => {
        const cases: Array<[Value, string]> = [
            [new ValueSet([r('2')]), 'Set<Int>'],
            [r('3/5'), 'Rational?'],
            [null, 'Rational?'],
            ['3/4', 'Text']
        ];
        for (const [value, type] of cases) {
            expect(valueEquals(fromJson(toJson(value), type), value)).toBe(true);
        }
        expect(toJson(r('3/5'))).toBe('3/5');
        expect(toJson(new ValueSet([r('2')]))).toEqual([2]);
    });
});

describe('Obergrenzen', () => {
    test('lange Texte, große Bereiche, Listen und Muster legen nichts lahm', () => {
        const long = Array.from({ length: 20000 }, () => 'wort').join(' ');
        let t = Date.now();
        expect(BUILTINS.number([long])).toBe(null);
        expect(Date.now() - t).toBeLessThan(500);
        expect(() => iterate(new Interval(Rational.of(1), Rational.of(10_000_000)))).toThrow(/mehr als 100000/);
        expect(() => BUILTINS.repeat(['x', Rational.of(1e7)])).toThrow(/repeat/);
        const many = Array.from({ length: 2000 }, (_, i) => `w${i}`).join('/');
        t = Date.now();
        expect(() => variants(`[${many}] [${many}]`)).toThrow(/mehr als 5000/);
        expect(Date.now() - t).toBeLessThan(500);
    });
});
