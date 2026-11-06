import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { describe, expect, test } from 'vitest';
import { BUNDLE_VERSION, type Catalog, type Parameter } from '../src/index.js';

const catalog: Catalog = createRequire(import.meta.url)('../catalog.json');
const sections = ['baseTypes', 'enums', 'functions', 'elements'] as const;

/** Allowed fields per kind of object; required ones first, then optional ones after the `?`. */
const FIELDS: Record<string, { required: string[]; optional: string[] }> = {
    catalog: { required: ['version', ...sections], optional: [] },
    baseTypes: { required: ['name', 'description'], optional: ['typeParameters'] },
    enums: { required: ['name', 'values', 'description'], optional: [] },
    functions: { required: ['name', 'parameters', 'result', 'description'], optional: ['typeParameters', 'form'] },
    elements: { required: ['name', 'parameters', 'children', 'description'], optional: ['typeParameters', 'binding', 'events'] },
    parameters: { required: ['name', 'type'], optional: ['variadic'] }
};

/** Unknown and missing fields, one message each. */
function fieldProblems(where: string, kind: string, value: unknown): string[] {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return [`${where}: kein Objekt.`];
    const { required, optional } = FIELDS[kind];
    const keys = Object.keys(value);
    return [
        ...keys.filter(k => !required.includes(k) && !optional.includes(k)).map(k => `${where}: unbekanntes Feld '${k}'.`),
        ...required.filter(k => !keys.includes(k)).map(k => `${where}: Feld '${k}' fehlt.`)
    ];
}

/** Every deviation of the catalog from its schema, one message each. */
function schemaProblems(k: Catalog): string[] {
    const found = fieldProblems('Katalog', 'catalog', k);
    for (const section of sections) {
        for (const entry of (k[section] ?? []) as unknown as Array<Record<string, unknown>>) {
            const where = `${section} '${String(entry.name)}'`;
            found.push(...fieldProblems(where, section, entry));
            if (!('parameters' in entry)) continue;
            if (!Array.isArray(entry.parameters)) found.push(`${where}: 'parameters' ist keine Liste.`);
            else found.push(...entry.parameters.flatMap((p: Parameter, i) => fieldProblems(`${where}, Parameter ${i + 1}`, 'parameters', p)));
        }
    }
    return found;
}

/**
 * Rules of the bundle form that the schema cannot express: `form` is `meta` or absent, and in the `meta` form every
 * parameter is a name (`Text`); only the last parameter is variadic; `bind` is never an argument of an element, a
 * bound state is named in `ElementNode.bind` (field `binding`).
 */
function formProblems(k: Catalog): string[] {
    const found: string[] = [];
    for (const f of k.functions) {
        if (f.form !== undefined && f.form !== 'meta') found.push(`Funktion '${f.name}': unbekannte Form '${String(f.form)}'.`);
        if (f.form === 'meta') {
            for (const p of f.parameters.filter(p => p.type !== 'Text')) found.push(`Funktion '${f.name}': in der Form meta ist Parameter '${p.name}' ein Name (Text), nicht ${p.type}.`);
        }
    }
    for (const [label, entries] of [['Funktion', k.functions], ['Element', k.elements]] as const) {
        for (const e of entries) {
            const variadic = e.parameters.findIndex(p => p.variadic);
            if (variadic >= 0 && variadic !== e.parameters.length - 1) found.push(`${label} '${e.name}': nur der letzte Parameter darf variadisch sein.`);
        }
    }
    for (const e of k.elements.filter(e => e.parameters.some(p => p.name === 'bind'))) {
        found.push(`Element '${e.name}': bind ist kein Argument, der gebundene Zustand steht in ElementNode.bind (Feld binding).`);
    }
    return found;
}

/** Same value regardless of the order of object keys. */
function canonical(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

/**
 * Fingerprint of the canonical catalog.json (key order ignored) per format version, without the `description` fields:
 * they are documentation, not contract. Every other change to the catalog (names, types, parameters,
 * enum values, `form`, `binding`, `children`, ...) raises BUNDLE_VERSION (entwurf.md, decision 2), so a runtime
 * rejects a bundle that uses something it does not know instead of failing midway. Such an edit therefore fails here
 * until the version and this table change together; entries of earlier versions stay.
 */
const FINGERPRINTS: Record<string, string> = {
    // Set anew when the catalog switched to the bundle view and again when its keys became English; 0.1 was never
    // published (entwurf.md, decision 2)
    '0.1': 'sha256-VDqGrhUXTnLQdyGmsGaRYncIi6/EISUBjOBpGo0kPU8=',
};

/** The catalog without its descriptions, at any depth. */
function contract(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(contract);
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).filter(([k]) => k !== 'description').map(([k, v]) => [k, contract(v)]));
    }
    return value;
}

const fingerprint = (value: unknown) => `sha256-${createHash('sha256').update(canonical(contract(value))).digest('base64')}`;

describe('Katalog', () => {
    test('trägt die Version des Formats', () => {
        expect(catalog.version).toBe(BUNDLE_VERSION);
    });

    test('ändert sich nur zusammen mit BUNDLE_VERSION', () => {
        const actual = fingerprint(catalog);
        const expected = FINGERPRINTS[BUNDLE_VERSION];
        const hint = `Eintrag '${BUNDLE_VERSION}': '${actual}' in FINGERPRINTS (test/catalog.test.ts)`;
        expect(expected, `Für die Version ${BUNDLE_VERSION} fehlt der Fingerabdruck des Katalogs. Neu: ${hint}.`).toBeDefined();
        expect(actual, `catalog.json hat sich geändert, BUNDLE_VERSION ist aber noch ${BUNDLE_VERSION}. Jede Änderung am Katalog `
            + 'hebt die Version (Regeln bei BUNDLE_VERSION in src/index.ts): BUNDLE_VERSION und version in catalog.json '
            + `erhöhen, dann ${hint} ergänzen; die Einträge früherer Versionen bleiben.`).toBe(expected);
        const older = Object.entries(FINGERPRINTS).filter(([v, f]) => v !== BUNDLE_VERSION && f === actual).map(([v]) => v);
        expect(older, 'Der Katalog gleicht einer früheren Version; eine neue Version braucht einen geänderten Katalog.').toEqual([]);
    });

    test('der Fingerabdruck sieht jede Änderung am Vertrag, nicht Beschreibungen und nicht die Reihenfolge der Felder', () => {
        const copy = () => structuredClone(catalog) as unknown as Record<string, Array<Record<string, any>>>;
        const described = copy();
        described.functions[0].description = `${described.functions[0].description} Mehr Text.`;
        described.enums[0].description = 'Anders beschrieben.';
        expect(fingerprint(described)).toBe(fingerprint(catalog));

        const changes: Array<(k: ReturnType<typeof copy>) => void> = [
            k => { k.enums[0].values = [...k.enums[0].values, 'neu']; },
            k => { k.functions[0].form = 'meta'; },
            k => { k.elements[0].children = !k.elements[0].children; },
            k => { k.elements[0].binding = 'Text'; },
            k => { k.functions[0].parameters[0].type = 'Irgendwas'; },
            k => { k.functions[0].parameters[0].variadic = true; },
            k => { k.functions[0].parameters.reverse(); },
        ];
        for (const change of changes) {
            const changed = copy();
            change(changed);
            expect(fingerprint(changed)).not.toBe(fingerprint(catalog));
        }

        const reordered = Object.fromEntries(Object.entries(catalog).reverse());
        expect(fingerprint(reordered)).toBe(fingerprint(catalog));
    });

    test('jeder Name kommt einmal vor', () => {
        const names = sections.flatMap(s => catalog[s].map(e => e.name));
        expect(names.filter((n, i) => names.indexOf(n) !== i)).toEqual([]);
    });

    test('jedes Objekt hat genau die Felder seines Typs', () => {
        expect(schemaProblems(catalog)).toEqual([]);
        const copy = structuredClone(catalog) as unknown as Record<string, Array<Record<string, unknown>>>;
        copy.functions.find(f => f.name === 'heard')!.children = false;
        copy.functions.find(f => f.name === 'math')!.implemented = 'runtime';
        delete copy.elements.find(e => e.name === 'page')!.children;
        (copy.functions.find(f => f.name === 'image')!.parameters as Array<Record<string, unknown>>)[2].default = 'none';
        expect(schemaProblems(copy as unknown as Catalog)).toEqual([
            "functions 'image', Parameter 3: unbekanntes Feld 'default'.",
            "functions 'math': unbekanntes Feld 'implemented'.",
            "functions 'heard': unbekanntes Feld 'children'.",
            "elements 'page': Feld 'children' fehlt."
        ]);
    });

    test('meta-Funktionen erhalten Namen, nur der letzte Parameter ist variadisch, bind ist nie ein Argument', () => {
        expect(formProblems(catalog)).toEqual([]);
        const copy = structuredClone(catalog);
        copy.functions.find(f => f.name === 'changed')!.parameters[0].type = 'T';
        (copy.functions.find(f => f.name === 'heard') as { form?: string }).form = 'call';
        copy.functions.find(f => f.name === 'point')!.parameters[0].variadic = true;
        copy.elements.find(e => e.name === 'input')!.parameters.unshift({ name: 'bind', type: 'Text' });
        expect(formProblems(copy)).toEqual([
            "Funktion 'heard': unbekannte Form 'call'.",
            "Funktion 'changed': in der Form meta ist Parameter 'response' ein Name (Text), nicht T.",
            "Funktion 'point': nur der letzte Parameter darf variadisch sein.",
            "Element 'input': bind ist kein Argument, der gebundene Zustand steht in ElementNode.bind (Feld binding)."
        ]);
    });

    test('jede Beschreibung ist ein Satz ohne Gedankenstrich', () => {
        const texts = sections.flatMap(s => catalog[s] as Array<{ name: string; description: string }>).map(e => [e.name, e.description]);
        const bad = texts.filter(([, text]) => !/^\p{Lu}[^.!?]*\.$/u.test(text) || /[–—]/.test(text));
        expect(bad.map(([name, text]) => `${name}: ${text}`)).toEqual([]);
    });
});
