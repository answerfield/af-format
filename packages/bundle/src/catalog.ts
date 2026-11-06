/**
 * Catalog of the built-in base types, enums, functions and elements (`catalog.json` in this package).
 *
 * The catalog is the contract between language and runtime, seen from the bundle: it lists exactly the names that reach
 * a bundle (`ElementNode.element`, `call.fn`, `meta.fn`, `enum` values, type names) with the arguments the runtime
 * receives there. Built-ins the compiler resolves into bundle structure (`show`, `correct`, `part`, ...) are not part of
 * it; the language keeps them in its own list. A runtime implements every entry. The catalog is maintained by hand and
 * shares `BUNDLE_VERSION`: adding an entry raises the minor version, changing or removing one raises the major version
 * (below 1.0 every change raises the minor version). A runtime runs bundles up to its own minor version.
 */
import type { TypeDesc } from './index.js';

/** Root of `catalog.json`. */
export interface Catalog {
    /** Equal to `BUNDLE_VERSION`: new entries raise the minor version, changed or removed ones the major version. */
    version: string;
    /** Base types of the type system. */
    baseTypes: BaseType[];
    /** Enums; their values appear in bundles as `{ op: 'enum' }`. */
    enums: EnumType[];
    /** Functions a bundle calls (`call` or `meta`). */
    functions: BuiltinFunction[];
    /** Elements a bundle contains (`ElementNode`). */
    elements: BuiltinElement[];
}

/** Base type, e.g. `Int` or the generic `List<T>`. */
export interface BaseType {
    name: string;
    /** Type parameters of a generic type. */
    typeParameters?: string[];
    /** One sentence in German. */
    description: string;
}

/** Enum with its values in declaration order. */
export interface EnumType {
    name: string;
    values: string[];
    /** One sentence in German. */
    description: string;
}

/**
 * Parameter as the runtime receives it. The bundle always carries an argument for every parameter (the compiler fills
 * in defaults), so there is no default here.
 */
export interface Parameter {
    name: string;
    /** Type in source notation, e.g. `Set<Accommodation>`, `Content?`; `Text` for a name in the `meta` form. */
    type: TypeDesc;
    /** Takes any number of arguments, after all other parameters. */
    variadic?: true;
}

/** Built-in function as a bundle calls it. */
export interface BuiltinFunction {
    name: string;
    typeParameters?: string[];
    /**
     * `meta`: a `{ op: 'meta', fn, vars }` expression whose `vars` hold the names of response variables, one per
     * parameter (all `Text`). Absent: a `{ op: 'call', fn, args }` expression with one argument per parameter, in order.
     */
    form?: 'meta';
    parameters: Parameter[];
    /** Result type in source notation. */
    result: TypeDesc;
    /** One sentence in German. */
    description: string;
}

/** Built-in element as a bundle contains it: `ElementNode.args` holds exactly the parameters, in order, by name. */
export interface BuiltinElement {
    name: string;
    typeParameters?: string[];
    parameters: Parameter[];
    /**
     * Type of the state the element binds two-way: its name is in `ElementNode.bind` (for one element of a list state
     * with `bindIndex`), not among the arguments. Absent: the element binds nothing.
     */
    binding?: TypeDesc;
    /** Takes content (`ElementNode.children`). */
    children: boolean;
    /** Events the element fires, the keys of `ElementNode.on`. */
    events?: string[];
    /** One sentence in German. */
    description: string;
}
