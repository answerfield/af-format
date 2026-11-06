// Type check of catalog.json against the types in src/catalog.ts (`tsc -p test`, part of `npm test`). JSON imports
// widen string literals, so literal unions are widened here; their values are checked by catalog.test.ts.
import catalog from '../catalog.json' with { type: 'json' };
import type { Catalog } from '../src/catalog.js';

type Widened<T> = T extends string ? string
    : T extends boolean ? boolean
    : T extends ReadonlyArray<infer U> ? Widened<U>[]
    : T extends object ? { [K in keyof T]: Widened<T[K]> }
    : T;

export const checked = catalog satisfies Widened<Catalog>;
