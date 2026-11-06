// Checks the shape of the cases in cases/ without a runtime: files per theme, known steps and expectations,
// references into the bundle, justification in docs/semantik.md, deterministic bundle files of one format version.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SHARED_SOURCES, THEMES } from '../out/index.js';

const dir = join(dirname(fileURLToPath(import.meta.url)), '../cases');
const read = file => readFileSync(join(dir, file), 'utf8');

const STEPS = ['emit', 'page', 'advance', 'media', 'judge', 'restore', 'next', 'previous', 'goTo', 'finish', 'control', 'expect'];
const EXPECTATIONS = [
    'responses', 'coding', 'state', 'accommodations', 'params', 'page', 'pageCount', 'elements', 'shows', 'hides',
    'timers', 'playing', 'heard', 'locked', 'navigation', 'log'
];
const BOOKLET_EXPECTATIONS = ['position', 'current', 'part', 'remaining', 'finished', 'waiting', 'paused', 'canNext', 'canPrevious', 'atPartEnd'];

/** Same as scripts/konformitaet.intern.mjs writes it: sorted keys, two-space indentation, final newline. */
function stableJson(value) {
    const sort = v => Array.isArray(v) ? v.map(sort)
        : v !== null && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sort(v[k])]))
        : v;
    return JSON.stringify(sort(value), null, 2) + '\n';
}

test('cases/ enthält je Thema .af, .bundle.json und .cases.json, sonst nur die gemeinsamen Quellen', () => {
    const expected = [...THEMES.flatMap(t => [`${t}.af`, `${t}.bundle.json`, `${t}.cases.json`]), ...SHARED_SOURCES].sort();
    assert.deepEqual(readdirSync(dir).sort(), expected);
});

// The bundles are frozen vectors of one format version; they are written anew together, never one by one.
test('alle Bundles tragen dieselbe Formatversion', () => {
    const versions = Object.fromEntries(THEMES.map(t => [t, JSON.parse(read(`${t}.bundle.json`)).version]));
    const first = versions[THEMES[0]];
    assert.equal(typeof first, 'string');
    assert.deepEqual(versions, Object.fromEntries(THEMES.map(t => [t, first])));
});

for (const theme of THEMES) {
    test(`${theme}: Bundle ohne Dev-Felder, deterministisch geschrieben`, () => {
        const text = read(`${theme}.bundle.json`);
        const bundle = JSON.parse(text);
        assert.equal(text, stableJson(bundle));
        assert.equal(bundle.format, 'af-bundle');
        for (const key of ['dev', 'sources']) assert.ok(!(key in bundle), key);
    });

    test(`${theme}: Fälle nennen den Abschnitt, starten Vorhandenes und nutzen nur bekannte Schritte`, () => {
        const bundle = JSON.parse(read(`${theme}.bundle.json`));
        const { cases } = JSON.parse(read(`${theme}.cases.json`));
        const items = new Set(bundle.items.map(i => i.name));
        const booklets = new Set((bundle.booklets ?? []).map(b => b.name));
        assert.ok(cases.length > 0);
        assert.equal(new Set(cases.map(c => c.name)).size, cases.length, 'Namen eindeutig');
        for (const c of cases) {
            const at = `${theme}/${c.name}`;
            assert.match(c.description, /\(semantik\.md, Abschnitte? \d+[^)]*\)\.$/, at);
            assert.ok('item' in c !== 'booklet' in c, `${at}: genau eines von item und booklet`);
            if ('item' in c) assert.ok(items.has(c.item), `${at}: Aufgabe ${c.item} nicht im Bundle`);
            else assert.ok(booklets.has(c.booklet), `${at}: Testheft ${c.booklet} nicht im Bundle`);
            c.steps.forEach((step, i) => {
                const actions = Object.keys(step).filter(k => STEPS.includes(k));
                assert.equal(actions.length, 1, `${at}, Schritt ${i + 1}: ${JSON.stringify(step)}`);
                if (!('expect' in step)) return;
                const known = 'booklet' in c ? [...EXPECTATIONS, ...BOOKLET_EXPECTATIONS] : EXPECTATIONS;
                for (const key of Object.keys(step.expect)) assert.ok(known.includes(key), `${at}, Schritt ${i + 1}: unbekannte Erwartung ${key}`);
            });
        }
    });
}
