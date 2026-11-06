/**
 * Answer patterns in the notation of the IQB coding guides:
 *   `( )`  optional part:                "(the) (red) kettle (on the stove)"
 *   `[ ]`  required part with choices:   "vormittags [Holz hacken / ein Bild malen]"
 *   `/`    alternative for the word:     "tricot/chandail laine"
 *          inside `( )` and `[ ]` it applies to the whole bracket content: "(around) 5/five (am/at dawn)"
 *   ` / `  alternative for the whole:    "a quarter of a mile / 400 metres"
 * Plain numbers with `/` are one word ("12/5/2019", "5/7"); "7:35/7.35" are two spelling variants.
 *
 * Matching ignores case (unless `case`), unifies apostrophes and quotes, and drops punctuation and slashes (except
 * between digits: 4,25 · 7:35 · 5/7). `typos` allows typos **per word**, capped by word length (none up to 3
 * characters, one up to 7, otherwise two); words containing digits must match exactly.
 */

import { EvalError } from './values.js';

const MAX_VARIANTS = 5000;

/** Options for {@link accept} and {@link accepted}. */
export interface AcceptOptions {
    /** Maximum typos per word (further capped by word length). */
    typos: number;
    /** Case-sensitive (e.g. for spelling tasks). */
    case: boolean;
}

/** Normalized form of a text for matching, as space-separated words. */
export function canonical(text: string, keepCase = false): string {
    let t = text.normalize('NFC');
    if (!keepCase) t = t.toLowerCase();
    return t
        .replace(/[’‘`´ʼ]/g, "'")
        .replace(/[“”„«»‚]/g, '"')
        .replace(/[–—]/g, '-')
        // Drop punctuation except between digits (4,25 · 7:35 · 2.375 · 5/7); also splits addresses: musterseite.net/start
        .replace(/(?<!\d)[.,;:/]|[.,;:/](?!\d)/g, ' ')
        .replace(/[!?"()[\]]/g, ' ')
        .replace(/(^|\s)['-]+|['-]+(?=\s|$)/g, '$1')
        .replace(/\s+/g, ' ')
        .trim();
}

/** Does the answer match one of the spelling variants of the pattern? Empty answers never match. */
export function accept(answer: string, pattern: string, options: AcceptOptions): boolean {
    const given = canonical(answer, options.case);
    if (given === '') return false;
    return variants(pattern, options.case).some(v => matches(given, v, options.typos));
}

/**
 * How many patterns are matched by **distinct** answers? (maximum bipartite matching)
 * "Name two": accepted([a, b], ["hammer", "pliers"]) == 2 · "two out of three": … >= 2
 */
export function accepted(answers: string[], patterns: string[], options: AcceptOptions): number {
    const hits = answers.map(a => patterns.map((p, j) => (accept(a, p, options) ? j : -1)).filter(j => j >= 0));
    const owner = new Array<number>(patterns.length).fill(-1);
    const assign = (i: number, seen: boolean[]): boolean => {
        for (const j of hits[i]) {
            if (seen[j]) continue;
            seen[j] = true;
            if (owner[j] < 0 || assign(owner[j], seen)) {
                owner[j] = i;
                return true;
            }
        }
        return false;
    };
    return answers.reduce((n, _, i) => n + (assign(i, new Array(patterns.length).fill(false)) ? 1 : 0), 0);
}

function matches(given: string, variant: string, typos: number): boolean {
    if (given === variant) return true;
    if (typos <= 0) return false;
    const a = given.split(' '), b = variant.split(' ');
    if (a.length !== b.length) {
        // Written as one word or two ("tool box" / "toolbox") counts as one typo
        return a.join('') === b.join('');
    }
    return a.every((word, i) => {
        const target = b[i];
        if (word === target) return true;
        if (/\d/.test(word) || /\d/.test(target)) return false;
        const allowed = Math.min(typos, target.length <= 3 ? 0 : target.length <= 7 ? 1 : 2);
        return allowed > 0 && withinDistance(word, target, allowed);
    });
}

const cache = new Map<string, string[]>();

/** All spelling variants a pattern allows, in normalized form (see {@link canonical}). Throws on invalid patterns. */
export function variants(pattern: string, keepCase = false): string[] {
    const key = `${keepCase ? 'C' : 'c'}${pattern}`;
    let result = cache.get(key);
    if (!result) {
        // Bound the cache (long-lived processes such as the language server)
        if (cache.size >= 2000) cache.clear();
        const raw = new PatternParser(pattern).parse();
        result = [...new Set(raw.map(v => canonical(v, keepCase)))].filter(v => v !== '');
        cache.set(key, result);
    }
    return result;
}

/** Expands a pattern into all its spelling variants (raw, not yet normalized). */
class PatternParser {
    private pos = 0;
    constructor(private readonly src: string) {}

    parse(): string[] {
        const result = this.alternatives(undefined);
        if (this.pos < this.src.length) throw new EvalError(`Muster: unerwartetes '${this.src[this.pos]}' in "${this.src}"`);
        return result;
    }

    /**
     * Alternatives up to the closing bracket `close`. At top level only ` / ` (with whitespace) separates;
     * inside brackets every slash does.
     */
    private alternatives(close: string | undefined): string[] {
        const result = this.sequence(close);
        while (this.atSeparator(close)) {
            this.pos = this.src.indexOf('/', this.pos) + 1;
            result.push(...this.sequence(close));
            limit(result);
        }
        return result;
    }

    /** Sequence of words and groups. */
    private sequence(close: string | undefined): string[] {
        let result = [''];
        for (;;) {
            this.skipSpace(close);
            const c = this.src[this.pos];
            if (c === undefined || c === ')' || c === ']' || this.atSeparator(close)) return result;
            const before = this.pos > 0 && /\s/.test(this.src[this.pos - 1]);
            const parts = c === '(' || c === '[' ? this.group(c) : this.word(close);
            // Check the limit before expanding, not after (otherwise millions of strings could be built)
            limitSize(result.length * parts.length);
            result = result.flatMap(r => parts.map(p => (before ? `${r} ${p}` : r + p)));
        }
    }

    /** `( … )` optional, `[ … ]` required; both may contain alternatives. */
    private group(open: string): string[] {
        const close = open === '(' ? ')' : ']';
        this.pos++;
        const inner = this.alternatives(close);
        this.skipSpace(close);
        if (this.src[this.pos] !== close) throw new EvalError(`Muster: '${close}' fehlt in "${this.src}"`);
        this.pos++;
        if (open === '[') return inner;
        // "(Gemüse-)Garten": Gemüsegarten or Garten (also Gemüse-Garten)
        const attached = this.pos < this.src.length && !/[\s/)\]]/.test(this.src[this.pos]);
        const compounds = attached ? inner.filter(v => v.endsWith('-')).map(v => v.slice(0, -1)) : [];
        return ['', ...inner, ...compounds];
    }

    /** Word; at top level `/` gives alternatives for the word, inside brackets a slash ends it. */
    private word(close: string | undefined): string[] {
        const result: string[] = [];
        let current = '';
        while (this.pos < this.src.length) {
            const c = this.src[this.pos];
            if (/\s/.test(c) || '()[]'.includes(c)) break;
            if (c === '/' && !this.numericSlash()) {
                if (close !== undefined) break; // inside brackets: alternative for the bracket content
                result.push(current);
                current = '';
            } else {
                current += c;
            }
            this.pos++;
        }
        result.push(current);
        return result;
    }

    /** Does the slash belong to a plain number like 12/5/2019 or 5/7? */
    private numericSlash(): boolean {
        // Fast reject: no digits right at the slash means no number (avoids scanning long chains of alternatives)
        const slash = this.src.indexOf('/', this.pos);
        if (slash < 1 || !/\d/.test(this.src[slash - 1]) || !/\d/.test(this.src[slash + 1] ?? '')) return false;
        let start = this.pos, end = this.pos;
        while (start > 0 && !/[\s()[\]]/.test(this.src[start - 1])) start--;
        while (end < this.src.length && !/[\s()[\]]/.test(this.src[end])) end++;
        return /^\d+(\/\d+)+$/.test(this.src.slice(start, end));
    }

    /** Sticky match at the current position without copying the rest of the pattern (would be quadratic). */
    private at(re: RegExp): boolean {
        re.lastIndex = this.pos;
        return re.test(this.src);
    }

    private atSeparator(close: string | undefined): boolean {
        if (close !== undefined) return this.at(/\s*\//y) && !this.numericSlash();
        return this.at(/\s+\/\s/y) || (this.pos > 0 && /\s/.test(this.src[this.pos - 1]) && this.at(/\/\s/y));
    }

    private skipSpace(close: string | undefined): void {
        while (this.pos < this.src.length && /\s/.test(this.src[this.pos]) && !this.atSeparator(close)) this.pos++;
    }
}

function limit(list: string[]): string[] {
    limitSize(list.length);
    return list;
}

function limitSize(n: number): void {
    if (n > MAX_VARIANTS) throw new EvalError(`Muster erlaubt mehr als ${MAX_VARIANTS} Schreibweisen`);
}

/** Edit distance at most `max`? Swapped adjacent letters ("tael" for "teal") count as one error. */
function withinDistance(a: string, b: string, max: number): boolean {
    if (Math.abs(a.length - b.length) > max) return false;
    const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array<number>(b.length).fill(0)]);
    for (let j = 0; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
        let best = Infinity;
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
            if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
            best = Math.min(best, d[i][j]);
        }
        if (best > max) return false;
    }
    return d[a.length][b.length] <= max;
}
