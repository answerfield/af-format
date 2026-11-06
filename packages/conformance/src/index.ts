// Format of the conformance cases in cases/: per theme `<theme>.af` (source, for reading only),
// `<theme>.bundle.json` (release bundle) and `<theme>.cases.json` (cases). The meaning of every expectation is
// docs/semantik.md of the language; each case names its section in `description`.

/** Themes in cases/, each with `.af`, `.bundle.json` and `.cases.json`. */
export const THEMES = [
    'accommodations', 'booklet', 'coding', 'expressions', 'functions', 'listening', 'standard', 'state'
] as const;

export type Theme = typeof THEMES[number];

/**
 * Sources in cases/ without a theme of their own: components the themes use (`probes.af`: probe components whose
 * response is the value of their argument). Needed to compile the `.af` files, not to run the bundles.
 */
export const SHARED_SOURCES = ['probes.af'] as const;

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

/** Content of `<theme>.cases.json`. */
export interface CaseFile {
    cases: Case[];
}

/** Common part of a case: name, justification and steps. */
interface CaseBase {
    /** Unique within the file. */
    name: string;
    /** What the case asserts, ending with the section of docs/semantik.md, e.g. "(semantik.md, Abschnitt 4)". */
    description: string;
    steps: Step[];
}

/** Case that starts one item of the bundle. */
export interface ItemCase extends CaseBase {
    item: string;
    /** Requested accommodations (before `deny` and versions filter them). */
    accommodations?: string[];
    /** Version chosen by the host: parameter name → value. */
    params?: Record<string, JsonValue>;
}

/** Case that starts one booklet of the bundle. */
export interface BookletCase extends CaseBase {
    booklet: string;
    /**
     * Needs profile of the person, sections `display`, `content`, `interaction`, `timing`
     * (e.g. `{ "display": { "contrast": "high" }, "timing": { "extension": 1.5 } }`).
     */
    profile?: Record<string, JsonValue>;
}

export type Case = ItemCase | BookletCase;

/** The n-th atom of a kind in the current item, in source order, counted from 0. */
export interface ElementRef {
    element: string;
    index: number;
}

/**
 * Event at an atom. `bind` carries `value`: decoded with `type` (`"Rational"`, `"Point"`) if given, otherwise by its
 * JSON shape (text, number, `{ x, y }` point).
 */
export interface EmitStep {
    emit: ElementRef;
    event: string;
    value?: JsonValue;
    type?: string;
}

/** Shows page n (from 0) of the current item. */
export interface PageStep { page: number }

/** Advances the clock by n milliseconds, then one tick. */
export interface AdvanceStep { advance: number }

/** What the renderer reports for the n-th `media` (from 0): loaded, playback started, playback ended. */
export interface MediaStep {
    media: number;
    signal: 'ready' | 'started' | 'ended';
}

/** Judgments of coders from now on: question ID (`"rule: criterion"`) → yes/no. */
export interface JudgeStep { judge: Record<string, boolean> }

/** Saves the state, discards the instance and resumes from the saved state (JSON round trip). */
export interface RestoreStep { restore: true }

/** Booklet navigation: next, previous, entry n of the current part (from 0), finish. */
export interface NextStep { next: true }
export interface PreviousStep { previous: true }
export interface GoToStep { goTo: number }
export interface FinishStep { finish: true }

/**
 * Command of the test administrator. `part`: part name, otherwise the current part. `seq`: number of the command; a
 * command with the same or a lower number is ignored.
 */
export interface ControlStep {
    control:
        | { kind: 'release'; part?: string; seq?: number }
        | { kind: 'pause'; seq?: number }
        | { kind: 'resume'; seq?: number }
        | { kind: 'extend'; seconds: number; part?: string; seq?: number }
        | { kind: 'end'; part?: string; seq?: number };
}

/** Checks the stated observations. */
export interface ExpectStep { expect: Expectation }

export type Step =
    | EmitStep | PageStep | AdvanceStep | MediaStep | JudgeStep | RestoreStep
    | NextStep | PreviousStep | GoToStep | FinishStep | ControlStep | ExpectStep;

/**
 * Expected observations; only the stated ones are compared. Comparison is partial: objects compare only the stated
 * keys, arrays element by element with equal length, `"*"` matches any present value, `null` also an absent one.
 */
export interface Expectation {
    /** Responses of the item; in a booklet keyed by item name. */
    responses?: JsonValue;
    /** Coding result of the responses with the judgments so far; in a booklet keyed by item name. */
    coding?: JsonValue;
    /** Saved state: `"/path.state"` → value. */
    state?: Record<string, JsonValue>;
    /** Effective accommodations, sorted. */
    accommodations?: string[];
    /** Parameters of the running version. */
    params?: Record<string, JsonValue>;
    /** Current page, from 0. */
    page?: number;
    pageCount?: number;
    /** Atoms with their evaluated arguments, variants and bound value. */
    elements?: ElementExpectation[];
    /** Texts of visible content that must (`shows`) or must not (`hides`) appear. */
    shows?: string[];
    hides?: string[];
    /** State of every `timer` of the current item, in source order. */
    timers?: TimerExpectation[];
    /** Whether each `media` of the current item should play, in source order. */
    playing?: boolean[];
    /** Value of `heard()`. */
    heard?: number;
    /** A `flow` locks the item. */
    locked?: boolean;
    /** All `flow` allow navigation. */
    navigation?: boolean;
    /** Log entries (event name or partial entry) that must occur in this order; others may lie between. */
    log?: Array<string | Record<string, JsonValue>>;

    // Booklet only
    /** Part and entry, from 0. */
    position?: { part: number; entry: number };
    /** Name of the current entry (item, or instruction page `<booklet>.<part>.<n>`). */
    current?: string;
    /** Name of the current part (`teil1`, …). */
    part?: string;
    /** Remaining seconds of the part; `null` without a limit or after the end. */
    remaining?: number | null;
    finished?: boolean;
    /** Waiting for release by the test administrator. */
    waiting?: boolean;
    paused?: boolean;
    /** "Next" stays within the current part. */
    canNext?: boolean;
    canPrevious?: boolean;
    /** "Next" would leave the part. */
    atPartEnd?: boolean;
}

export interface ElementExpectation extends ElementRef {
    args?: Record<string, JsonValue>;
    variants?: Record<string, JsonValue>;
    bind?: JsonValue;
}

export interface TimerExpectation {
    running?: boolean;
    /** Milliseconds, while running. */
    remaining?: number;
    /** Effective duration in milliseconds (with the extended-time factor). */
    duration?: number;
}
