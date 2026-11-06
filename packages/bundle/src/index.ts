/**
 * Bundle format: a validated, self-contained representation of items, components and codings.
 *
 * This is the contract between the compiler and the runtimes. Runtimes depend only on this format, never on the
 * language. Values are plain JSON; expressions are trees ({@link Expr}) evaluated by `@answerfield/expr`.
 */

/** Value of {@link Bundle.format}; identifies a JSON document as an AF bundle. */
export const BUNDLE_FORMAT = 'af-bundle';
/**
 * Format version this package describes (`major.minor`), shared by the catalog of built-ins (`catalog.json`, type
 * `Catalog`); see {@link supportsVersion} for which bundles a runtime accepts.
 *
 * - Minor: new catalog entries, or new bundle fields an older runtime cannot ignore. A runtime runs bundles up to its
 *   own minor version, so a bundle that uses something newer is rejected instead of failing midway.
 * - Major: a catalog entry changes or disappears, or the meaning of existing bundle content changes.
 * - Unchanged: new optional bundle fields that an older runtime may ignore without changing the item.
 *
 * While the major version is 0 the format still changes, and every minor version counts as incompatible.
 */
export const BUNDLE_VERSION = '0.1';

export type { Catalog, BaseType, EnumType, BuiltinFunction, BuiltinElement, Parameter } from './catalog.js';

/** Root of a compiled bundle. */
export interface Bundle {
    format: typeof BUNDLE_FORMAT;
    /** Format version (`major.minor`) the bundle was written with. */
    version: string;
    /** Dev bundle: carries source references ({@link Src}, `id`) and {@link ErrorNode} placeholders for faulty code. */
    dev?: boolean;
    /** All items, including the instruction pages of booklets. */
    items: ItemDef[];
    /** Booklets; their entries refer to items in `items` by name. */
    booklets?: BookletDef[];
    /** Every component used, including those from libraries, keyed by name. */
    components: Record<string, ComponentDef>;
    /** Codings, at most one per item. */
    codings: CodingDef[];
    /**
     * Practice feedback per item and coding rule. Kept separate from `codings` so the binding coding stays unchanged;
     * omitted when delivering a test.
     */
    feedback?: FeedbackDef[];
    /**
     * Media (images, audio, files) keyed by their path relative to the compiled source file. The files themselves are
     * not part of the bundle; the host loads them (e.g. from a CDN). In a release bundle each entry carries hash, size
     * and type, and the stored file is named `<hash><extension>` (see {@link assetFileName}).
     */
    assets?: Record<string, AssetInfo>;
    /** Dev bundle only: source documents that {@link Src} indexes into. */
    sources?: string[];
}

/** Metadata of a media file; empty in dev bundles. */
export interface AssetInfo {
    /** `sha256:<hex>` of the content (release bundle only). */
    hash?: string;
    /** Size in bytes. */
    size?: number;
    /** Media type, e.g. `audio/mpeg`. */
    type?: string;
}

/**
 * Content-addressed storage name of a media file, e.g. `9f2c….mp3` (immutable, so cacheable indefinitely).
 * Undefined without a hash.
 */
export function assetFileName(path: string, info: AssetInfo): string | undefined {
    if (!info.hash) return undefined;
    const ext = /\.[A-Za-z0-9]+$/.exec(path)?.[0].toLowerCase() ?? '';
    return info.hash.replace(/^sha256:/, '') + ext;
}

/**
 * Source reference in a dev bundle: [index into {@link Bundle.sources}, start offset, end offset].
 * Offsets shift while the author types; the node `id` does not.
 */
export type Src = [document: number, start: number, end: number];

/** Type in source notation, e.g. `Set<Int>`, `Rational?`. */
export type TypeDesc = string;

/** An item (or an instruction page of a booklet). */
export interface ItemDef {
    name: string;
    title?: string;
    /** Instruction page of a booklet: no responses, no coding. */
    instruction?: boolean;
    /**
     * Accommodation rules: `deny(…)` (what would distort the construct, with its reason), plus accommodations under
     * which no version satisfies `versions(when: …)`.
     */
    accommodations?: AccommodationRules;
    /** Item parameters; each version fixes one value per parameter (default and domain given). */
    params?: ItemParamDef[];
    /** Condition over parameters and `accommodations()` restricting the versions (only with `params`). */
    versions?: Expr;
    body: Node[];
    /** Response variables the item produces. */
    variables: VariableInfo[];
    src?: Src;
    /** Dev bundle only: stable node ID in the main document (AST path) for the visual editor. */
    id?: string;
}

/** Item parameter; values are JSON in the same encoding as responses (see `toJson` in `@answerfield/expr`). */
export interface ItemParamDef {
    name: string;
    type: TypeDesc;
    default: JsonValue;
    /** Domain from `versions(when: name in …)`, before the condition is applied. */
    values: JsonValue[];
}

/** Which accommodations may apply: a non-empty `allow` restricts, `deny` excludes. */
export interface AccommodationRules {
    allow: string[];
    deny: string[];
    /** Why `deny` excludes them, e.g. „misst Leseverstehen“. */
    reason?: string;
}

/** Booklet: parts holding items and instruction pages, plus study rules for accommodations. */
export interface BookletDef {
    name: string;
    title?: string;
    /** Study rules (`allow`, `deny`); apply in addition to each item's own rules. */
    accommodations?: AccommodationRules;
    parts: PartDef[];
    src?: Src;
    /** Dev bundle only: stable node ID (AST path). */
    id?: string;
}

/** Part of a booklet. */
export interface PartDef {
    name: string;
    title?: string;
    /** Time limit in seconds, before any extension. Absent: untimed. */
    time?: number;
    /** `free`: move back and forth; `forward`: no going back. */
    navigation: 'free' | 'forward';
    /** `released`: starts only after release by the test administrator. Absent: starts immediately. */
    start?: 'released';
    /** Names of items in {@link Bundle.items} (including instruction pages), in order. */
    entries: string[];
    src?: Src;
    /** Dev bundle only: stable node ID (AST path). */
    id?: string;
}

/** Response variable of an item. */
export interface VariableInfo {
    /** Variable name, unique within the item (the binding name in the source). */
    id: string;
    /** Response type of the producing component. */
    type: TypeDesc;
    /** Name of the component that produces the response. */
    component: string;
}

/** Component definition. */
export interface ComponentDef {
    name: string;
    params: ParamDef[];
    /** Response type; absent for presentation-only components. */
    response?: TypeDesc;
    body: Node[];
    src?: Src;
    /** Dev bundle only: stable node ID in the main document (AST path) for the visual editor. */
    id?: string;
}

/** Component parameter. */
export interface ParamDef {
    name: string;
    type: TypeDesc;
    /** Default value, evaluated in the component's scope. */
    default?: Expr;
    /** State parameter: unless bound by the caller, an own state with `default` as initial value. */
    state?: true;
}

/** Binds a state parameter to a state of the caller (or, with `index`, to one of its list elements, 1-based). */
export interface StateBinding {
    state: string;
    index?: Expr;
}

// ---------------------------------------------------------------------------
// Nodes
// ---------------------------------------------------------------------------

/** Node of an item or component body. */
export type Node =
    | StateNode | LetNode | ElementNode | ComponentNode | ContentNode | ForNode | ShowNode | ResponseNode | ChildrenNode | ErrorNode;

/** `state name: type = init`: a mutable state of the enclosing block, saved in snapshots. */
export interface StateNode {
    kind: 'state';
    name: string;
    type: TypeDesc;
    init: Expr;
}

/** `let name = value`: a derived value of the enclosing block. */
export interface LetNode {
    kind: 'let';
    name: string;
    value: Expr;
}

/** Built-in element or atom; every parameter has an argument (defaults filled in by the compiler). */
export interface ElementNode {
    kind: 'element';
    element: string;
    args: Record<string, Expr>;
    /** Two-way binding to a state (`bind:`). */
    bind?: string;
    /** Binding to one element of a list state (`bind: list[i]`, 1-based). */
    bindIndex?: Expr;
    /** Event handlers: event name → assignments, applied together. */
    on?: Record<string, Assignment[]>;
    children: Node[];
    /** Variants keyed by accommodation, e.g. `simple_language`, `extended_descriptions`. */
    variants?: Record<string, Expr>;
    /** Language levels given as a block (`variant(easy_language) { p "…" p "…" }`); they replace the children. */
    replacements?: Record<string, Node[]>;
    src?: Src;
    /** Dev bundle only: stable node ID in the main document (AST path) for the visual editor. */
    id?: string;
}

/** Component call. */
export interface ComponentNode {
    kind: 'component';
    component: string;
    /** Only the arguments given; the runtime evaluates defaults in the component's scope. */
    args: Record<string, Expr>;
    /** Name of the response variable (`name = Component(…)`). */
    binding?: string;
    /** Bound state parameters: parameter name → state of the caller. */
    binds?: Record<string, StateBinding>;
    /** Content of the call (component with `children`); evaluated in the caller's scope. */
    children?: Node[];
    src?: Src;
    /** Dev bundle only: stable node ID in the main document (AST path) for the visual editor. */
    id?: string;
}

/** Text or value to display. */
export interface ContentNode {
    kind: 'content';
    value: Expr;
    src?: Src;
    /** Dev bundle only: stable node ID in the main document (AST path) for the visual editor. */
    id?: string;
}

/** `for vars in iterable { body }`; with two vars, the second is the 1-based index. */
export interface ForNode {
    kind: 'for';
    vars: string[];
    iterable: Expr;
    body: Node[];
    src?: Src;
    /** Dev bundle only: stable node ID in the main document (AST path) for the visual editor. */
    id?: string;
}

/** `show when cond { body }`: body is visible only while the condition holds. */
export interface ShowNode {
    kind: 'show';
    when: Expr;
    body: Node[];
    src?: Src;
    /** Dev bundle only: stable node ID in the main document (AST path) for the visual editor. */
    id?: string;
}

/** Inside a component with `children`: where the call's content is inserted. */
export interface ChildrenNode {
    kind: 'children';
}

/** `response value`: the component's response, read through the caller's binding. */
export interface ResponseNode {
    kind: 'response';
    value: Expr;
}

/** Dev bundle only: placeholder for faulty source code. */
export interface ErrorNode {
    kind: 'error';
    message: string;
    src?: Src;
    /** Dev bundle only: stable node ID in the main document (AST path) for the visual editor. */
    id?: string;
}

/** `state = value` in an event handler. */
export interface Assignment {
    state: string;
    value: Expr;
}

// ---------------------------------------------------------------------------
// Expressions
// ---------------------------------------------------------------------------

/** Expression tree. */
export type Expr =
    | { op: 'lit'; value: Literal }
    | { op: 'enum'; value: string }
    | { op: 'ref'; name: string }
    | { op: 'call'; fn: string; args: Expr[] }
    /** Coding functions over response variables: `changed`, `displayed`, `sum_score`. */
    | { op: 'meta'; fn: string; vars: string[] }
    /** Condition judged by human coders (only in codings, in condition position). */
    | { op: 'manual'; question: ManualQuestion }
    | { op: 'bin'; operator: BinaryOperator; left: Expr; right: Expr }
    | { op: 'un'; operator: 'not' | '-'; operand: Expr }
    | { op: 'if'; cond: Expr; then: Expr; else: Expr }
    | { op: 'range'; from: Expr; to: Expr }
    | { op: 'set'; items: Expr[] }
    | { op: 'list'; items: Expr[] }
    | { op: 'member'; target: Expr; name: string }
    /** List element, 1-based; out of range yields `none`. */
    | { op: 'index'; target: Expr; index: Expr };

export type BinaryOperator =
    | 'and' | 'or' | '==' | '!=' | '<' | '<=' | '>' | '>=' | 'in' | '+' | '-' | '*' | '/';

/** Literal value; `null` is `none`. Numbers are exact decimal or integer strings (`num`), sizes like `4em` are `size`. */
export type Literal = string | boolean | null | { num: string } | { size: string };

// ---------------------------------------------------------------------------
// Coding
// ---------------------------------------------------------------------------

/** Coding of one item. */
export interface CodingDef {
    item: string;
    /** Rules in evaluation order; a later rule may use earlier scores (`sum_score`). */
    rules: CodingRuleDef[];
    /** Derived scores, evaluated after all rules; non-numeric results count as 0. */
    scores: Array<{ name: string; value: Expr }>;
}

/** Feedback on the coding rules of an item (rule name → feedback). */
export interface FeedbackDef {
    item: string;
    rules: Record<string, RuleFeedback>;
}

/** Feedback on one coding rule. */
export interface RuleFeedback {
    /** Feedback per code. */
    codes?: Record<string, Expr>;
    /** Feedback when no code applies. */
    otherwise?: Expr;
    /** Hints, one per attempt. */
    hints?: Expr[];
    /** Worked solution. */
    solution?: Expr;
}

/**
 * Coding of one response, or of a sub-task across several responses. Codes apply only if one of the sources was
 * changed; if no case matches, code 0 applies. Unchanged sources yield a missing code (`omitted` if displayed,
 * otherwise `not_reached`).
 */
export interface CodingRuleDef {
    /** Name of the coded variable (a response variable or a derived sub-task). */
    variable: string;
    /** Responses whose status (changed, displayed) counts for this rule. */
    answers: string[];
    /** Cases in order; the first one that matches applies. */
    cases: CaseDef[];
}

/** One case of a coding rule. */
export interface CaseDef {
    code: number;
    label?: string;
    /** Score for this code; default 0. */
    score?: number;
    when: Expr;
}

// ---------------------------------------------------------------------------
// Responses and results
// ---------------------------------------------------------------------------

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/** Responses of one item, as handed to coding and storage. */
export interface ResponseSet {
    item: string;
    /** Response variable → value and status. */
    variables: Record<string, ResponseValue>;
    /** Effective accommodations, sorted (for analysis and comparability). */
    accommodations: string[];
    /** Parameters of the version (only for items with parameters); coding computes with them. */
    params?: Record<string, JsonValue>;
}

/** Value and status of one response variable. */
export interface ResponseValue {
    /** Value in JSON encoding (see `toJson` in `@answerfield/expr`). */
    value: JsonValue;
    /** Differs from the initial value. */
    changed: boolean;
    /** Was visible to the test taker at some point. */
    displayed: boolean;
}

/** Coding result of one item. */
export interface CodingResult {
    item: string;
    variables: Record<string, VariableCode>;
    scores: Record<string, number>;
}

/** Result of one coding rule: exactly one of `code`, `missing`, `error` or `pending` is set. */
export interface VariableCode {
    code?: number;
    label?: string;
    score?: number;
    /** Missing code: `omitted` or `not_reached`. */
    missing?: string;
    /** Evaluation error message. */
    error?: string;
    /** Still open: human coders must judge these questions (judgments → `codeResponses(…, judgments)`). */
    pending?: ManualQuestion[];
}

/** Question for human coders: does the criterion apply? With anchor examples from the coding guide. */
export interface ManualQuestion {
    /** Stable as long as rule name and criterion stay the same. */
    id: string;
    criterion: string;
    /** Anchor examples where the criterion applies. */
    yes: string[];
    /** Anchor examples where it does not. */
    no: string[];
    /** Responses being judged (shown to the coders). */
    answers?: string[];
}

/** Coders' judgments for one item: question ID → criterion applies. */
export type Judgments = Record<string, boolean>;

/**
 * Serialized item state for resume. Keys are `<instance path>.<state name>`; keys starting with `$` are reserved
 * for runtime bookkeeping (page, log, listening, initial values, displayed flags, parameters).
 */
export type StateSnapshot = Record<string, JsonValue>;

/** Checks only the format marker; use {@link bundleProblem} for a full compatibility check. */
export function isBundle(value: unknown): value is Bundle {
    return typeof value === 'object' && value !== null && (value as Bundle).format === BUNDLE_FORMAT;
}

/**
 * Whether a runtime of format version `own` can run a bundle of version `bundle` (both `major.minor`, see
 * {@link BUNDLE_VERSION}): the major versions must match; below 1.0 the minor versions too, from 1.0 on the bundle's
 * minor version must not exceed the runtime's (it may use catalog entries added later).
 */
export function supportsVersion(own: string, bundle: string): boolean {
    const [ownMajor, ownMinor] = own.split('.');
    const [major, minor] = bundle.split('.');
    if (major !== ownMajor) return false;
    if (ownMajor === '0') return minor === ownMinor;
    const number = (part: string | undefined) => (part !== undefined && /^\d+$/.test(part) ? Number(part) : NaN);
    return number(minor) <= number(ownMinor);
}

/** Why a runtime cannot run this bundle; undefined if it can. The version must pass {@link supportsVersion}. */
export function bundleProblem(value: unknown): string | undefined {
    if (!isBundle(value)) return 'Kein AF-Bundle (format fehlt oder ist falsch).';
    if (!supportsVersion(BUNDLE_VERSION, String(value.version ?? ''))) {
        return `Bundle-Version ${value.version} wird nicht unterstützt (diese Runtime: ${BUNDLE_VERSION}).`;
    }
    if (!Array.isArray(value.items)) return 'Bundle ohne Aufgaben (items fehlt).';
    return undefined;
}
