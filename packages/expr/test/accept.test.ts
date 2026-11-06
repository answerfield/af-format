import { describe, expect, test } from 'vitest';
import { accept, accepted, variants } from '../src/accept.js';
import { readNumber, readProportion, readQuantity, roundsTo } from '../src/numbers.js';
import { Arc, Point, Rational, ValueSet, valueEquals } from '../src/values.js';
import * as geo from '../src/geometry.js';
import { BUILTINS } from '../src/builtins.js';
import { fromJson, toJson } from '../src/json.js';

const ok = (answer: string, pattern: string, typos = 0, kase = false) => accept(answer, pattern, { typos, case: kase });

describe('accept: Notation der Auswertungsanleitungen', () => {
    test('Schrägstrich in Klammern trennt den ganzen Klammerinhalt', () => {
        expect(variants('(around) 5/five (am/at dawn)')).toContain('5 am');
        expect(variants('(around) 5/five (am/at dawn)')).toContain('around five at dawn');
        expect(ok('5 am', '(around) 5/five (am/at dawn)')).toBe(true);
        expect(variants('tricot/chandail (en/de) laine')).toEqual(expect.arrayContaining(['tricot en laine', 'chandail laine']));
    });

    test('[ ] ist ein Pflichtteil mit Alternativen', () => {
        const p = 'vormittags [Holz hacken / ein Bild malen]';
        expect(ok('vormittags ein Bild malen', p)).toBe(true);
        expect(ok('vormittags Holz hacken', p)).toBe(true);
        expect(ok('vormittags', p)).toBe(false);
    });

    test('( ) ist optional, / trennt Wörter oder das Ganze', () => {
        const p = '(a) quarter of a mile / 400 metres';
        expect(ok('quarter of a mile', p)).toBe(true);
        expect(ok('a quarter of a mile', p)).toBe(true);
        expect(ok('400 metres', p)).toBe(true);
        expect(ok('a quarter', p)).toBe(false);
    });

    test('(Vorsilbe-)Wort: zusammen, ohne Vorsilbe oder mit Bindestrich', () => {
        expect(variants('(Gemüse-)Garten')).toEqual(expect.arrayContaining(['gemüsegarten', 'garten', 'gemüse-garten']));
        expect(ok('Gemüsegarten', '(Gemüse-)Garten')).toBe(true);
    });

    test('reine Zahlen mit / sind ein Wort, sonst Alternativen', () => {
        expect(variants('12/5/2019')).toEqual(['12/5/2019']);
        expect(variants('(by) 7:35/7.35')).toEqual(expect.arrayContaining(['7:35', 'by 7.35']));
    });

    test('Apostrophe, Anführungszeichen und Satzzeichen werden angeglichen', () => {
        expect(ok("Tom's old bike", 'Tom’s old bike')).toBe(true);
        expect(ok('Dr. Okafor fixes the roof', 'Dr Okafor fixes the roof')).toBe(true);
        expect(ok('June 9th, 2019', 'June 9th 2019')).toBe(true);
        expect(ok('4,25 kg', '4,25 kg')).toBe(true);
        expect(ok('4.25 kg', '4,25 kg')).toBe(false);
    });

    test('Adressen: Punkte und Schrägstriche trennen Wörter, Brüche bleiben', () => {
        const portal = '(https) (www) musterseite net (fragen-und-antworten)';
        expect(ok('www.musterseite.net', portal)).toBe(true);
        expect(ok('https://www.musterseite.net/fragen-und-antworten', portal)).toBe(true);
        expect(ok('5/7', '5/7')).toBe(true);
    });

    test('Tippfehler je Wort, nach Wortlänge; Ziffern genau', () => {
        expect(ok('umbrela', '(an) umbrella', 1)).toBe(true);
        expect(ok('tael', 'teal (paint)', 1)).toBe(true);        // 4 characters: one typo allowed
        expect(ok('pen', 'pin', 1)).toBe(false);                 // 3 characters: no typo
        expect(ok('£17', '£18', 1)).toBe(false);
        expect(ok('12/5/2018', '12/5/2019', 1)).toBe(false);
        expect(ok('46 chaises', '45 (chaises)', 1)).toBe(false);
        expect(ok('seve', 'sève', 1)).toBe(true);
        expect(ok('toolbox', '(a) tool box', 1)).toBe(true);
    });

    test('case: Groß-/Kleinschreibung beachten (Orthografie)', () => {
        expect(ok('beim Rudern', 'beim Rudern', 0, true)).toBe(true);
        expect(ok('beim rudern', 'beim Rudern', 0, true)).toBe(false);
        expect(ok('beim rudern', 'beim Rudern')).toBe(true);
    });

    test('accepted: verschiedene Antworten zu verschiedenen Mustern', () => {
        const opts = { typos: 1, case: false };
        expect(accepted(['pliers', 'hamer'], ['hammer', 'pliers'], opts)).toBe(2);
        expect(accepted(['pliers', 'pliers'], ['hammer', 'pliers'], opts)).toBe(1);
        expect(accepted(['Senf', 'vinaigre'], ['Honig/miel', 'Senf/moutarde', 'Essig/vinaigre'], opts)).toBe(2);
    });
});

describe('Zahlen', () => {
    const n = (t: string) => readNumber(t)?.toString();
    test('Tausender, Dezimal, Einheiten, Währung', () => {
        expect(n('48.000')).toBe('48000');
        expect(n('48 000')).toBe('48000');
        expect(n('2.375')).toBe('2375');
        expect(n('73.4')).toBe('367/5');
        expect(n('0.750')).toBe('3/4');
        expect(n('4,25 kg')).toBe('17/4');
        expect(n('15 kg kg')).toBe('15');
        expect(n('£14')).toBe('14');
        expect(n('62,5 %')).toBe('125/2');
        expect(n('5/7')).toBe('5/7');
        expect(n('8 to 9')).toBeUndefined();
        expect(n('irgendwann')).toBeUndefined();
    });

    test('Zahlwörter de/en/fr', () => {
        expect(n('seventeen')).toBe('17');
        expect(n('forty-three')).toBe('43');
        expect(n('nine weeks')).toBe('9');
        expect(n('two hundred and eight')).toBe('208');
        expect(n('dreiundvierzig')).toBe('43');
        expect(n('fünfhundertsiebzehn')).toBe('517');
        expect(n('zweiunddreissig')).toBe('32');
        expect(n('trente et un')).toBe('31');
        expect(n('soixante-dix-huit')).toBe('78');
        expect(n('quatre-vingt-quatorze')).toBe('94');
        expect(n('quinze')).toBe('15');
    });

    test('proportion: Bruch = Dezimal = Prozent = 3:16', () => {
        for (const t of ['3/16', '0,1875', '18,75 %', '18,75%', '3:16', '3 : 16']) expect(readProportion(t)?.toString(), t).toBe('3/16');
        expect(readProportion('2 zu 7')).toBeUndefined();
    });

    test('rounds_to: korrekt gerundet auf die eigenen Stellen', () => {
        const x = new Rational(1n, 7n); // 0.142857…
        for (const t of ['0,14', '0,143', '14 %', '14,3 %', '14,29 %']) expect(roundsTo(t, x), t).toBe(true);
        for (const t of ['0,15', '14,2 %', '0,1428']) expect(roundsTo(t, x), t).toBe(false);
        expect(roundsTo('77,8 %', new Rational(7n, 9n))).toBe(true);
    });

    test('Zahlwörter über 999', () => {
        expect(n('dreitausendzweihundertachtzehn')).toBe('3218');
        expect(n('three thousand two hundred and eighteen')).toBe('3218');
        expect(n('soixante-trois mille')).toBe('63000');
        expect(n('mille')).toBe('1000');
        expect(n('neuntausend')).toBe('9000');
    });

    test('rounds_to mit Mindeststellen', () => {
        const x = new Rational(1n, 7n);
        expect(roundsTo('0', x)).toBe(true);
        expect(roundsTo('0', x, 1)).toBe(false);
        expect(roundsTo('0,1', x, 1)).toBe(true);
        expect(roundsTo('14 %', x, 1)).toBe(false);
        expect(roundsTo('14,3 %', x, 1)).toBe(true);
    });

    test('quantity: Zahl mit Pflicht-Einheit, umgerechnet', () => {
        const q = (t: string, u: string) => readQuantity(t, u)?.toString();
        expect(q('4 km', 'm')).toBe('4000');
        expect(q('4000 m', 'm')).toBe('4000');
        expect(q('4000', 'm')).toBeUndefined();
        expect(q('4,25 kilomètres', 'km')).toBe('17/4');
        expect(q('4,25km', 'km')).toBe('17/4');
        expect(q('£14', '£')).toBe('14');
        expect(q('14 pounds', '£')).toBe('14');
        expect(q('fourteen pounds', '£')).toBe('14');
        expect(q('14 €', '£')).toBeUndefined();
        expect(q('350 m2', 'm²')).toBe('350');
        expect(q('2,5 h', 'min')).toBe('150');
        expect(q('15 kg kg', 'kg')).toBe('15');
        expect(q('80 Cent', '€')).toBe('4/5');
    });
});

describe('Geometrie', () => {
    const P = (x: number, y: number) => new Point(Rational.of(x), Rational.of(y));
    // is_right_angle, on_line and slope live in std (written in the language) and are tested there through codings
    test('Abstand, Winkel, Fläche (eingebaut)', () => {
        expect(geo.distance(P(0, 0), P(3, 4)).toNumber()).toBe(5);
        expect(geo.angle(P(1, 0), P(0, 0), P(0, 1))!.toNumber()).toBe(90);
        expect(geo.area([P(1, 1), P(4, 1), P(4, 4), P(1, 4)]).toString()).toBe('9');
        expect(BUILTINS.distance([P(0, 0), null])).toBeNull();
    });
    test('Bogen: als Punkt sein Endpunkt, ohne Winkel ein ganzer Kreis; keine Fläche mit Bögen', () => {
        const a = BUILTINS.arc([P(0, 0), Rational.of(2), Rational.of(0), Rational.of(90)]) as Arc;
        expect(a).toBeInstanceOf(Arc);
        expect([a.x.toNumber(), a.y.toNumber()]).toEqual([0, 2]);
        const full = BUILTINS.arc([P(1, 1), Rational.of(1), null, null]) as Arc;
        expect([full.from.toNumber(), full.to.toNumber()]).toEqual([0, 360]);
        expect(BUILTINS.area([[P(0, 0), a, P(0, 2)]])).toBeNull();
    });
    test('shape: Gitterschritte, Richtung egal, Lage wahlweise egal', () => {
        const S = (...lines: [number, number, number, number][]) => new ValueSet(lines.map(([a, b, c, d]) => [P(a, b), P(c, d)]));
        // one side in a single stroke = in two pieces, drawn backwards
        expect(valueEquals(BUILTINS.shape([S([0, 0, 2, 0]), false]), BUILTINS.shape([S([2, 0, 1, 0], [0, 0, 1, 0]), false]))).toBe(true);
        // diagonal across lattice points: split into steps
        expect((BUILTINS.shape([S([0, 0, 2, 2]), false]) as ValueSet).size).toBe(2);
        // position-independent: a translated figure is equal; position-dependent: it is not
        expect(valueEquals(BUILTINS.shape([S([3, 1, 5, 1]), true]), BUILTINS.shape([S([0, 0, 2, 0]), true]))).toBe(true);
        expect(valueEquals(BUILTINS.shape([S([3, 1, 5, 1]), false]), BUILTINS.shape([S([0, 0, 2, 0]), false]))).toBe(false);
    });
    test('Punkt als JSON und Text', () => {
        expect(toJson(P(1, 4))).toEqual({ x: 1, y: 4 });
        expect((fromJson({ x: '1/2', y: 4 }, 'Point?') as Point).toString()).toBe('(1/2 | 4)');
    });
});
