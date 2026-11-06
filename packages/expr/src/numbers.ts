/**
 * Numbers in responses, the way students write them:
 *   "48 000", "48.000" (thousands), "4,25 kg", "15 kg kg", "£14", "62,5 %", "5/7",
 *   number words in German, English and French up to 999 999 ("dreiundvierzig", "forty-three", "trente et un").
 * Whatever follows the number must not contain another number ("8 to 9" is not a number).
 */

import { Rational } from './values.js';

const SPACE = /[\s  ]+/g;

/** Number in a response, ignoring unit and currency; undefined if there is no unambiguous number. */
export function readNumber(text: string): Rational | undefined {
    const t = text.normalize('NFC').toLowerCase().replace(SPACE, ' ').trim();
    if (t === '') return undefined;
    return digits(t) ?? words(t);
}

/**
 * Proportion or probability: fraction, decimal, percent and "1:4" are equivalent.
 * proportion("18,75 %") = proportion("3:16") = proportion("0,1875") = 3/16; "2 zu 7" (odds) is not a proportion.
 */
export function readProportion(text: string): Rational | undefined {
    const t = text.normalize('NFC').toLowerCase().replace(SPACE, ' ').trim();
    const ratio = /^(\d+)\s*:\s*(\d+)$/.exec(t);
    if (ratio) return BigInt(ratio[2]) === 0n ? undefined : new Rational(BigInt(ratio[1]), BigInt(ratio[2]));
    const percent = /^(.*?)\s*(%|prozent|percent|pour ?cent)$/.exec(t);
    if (percent) {
        const n = digits(percent[1]);
        return n?.div(new Rational(100n));
    }
    return digits(t);
}

/**
 * Is the text the value `exact`, correctly rounded to as many decimals as it states itself? `minDigits` sets the
 * minimum number of written decimals (for percent: percent decimals).
 * rounds_to("0,14", 1/7) · rounds_to("14,29 %", 1/7) · rounds_to("14 %", 1/7)
 */
export function roundsTo(text: string, exact: Rational, minDigits = 0): boolean {
    const t = text.normalize('NFC').toLowerCase().replace(SPACE, ' ').trim();
    const isPercent = /(%|prozent|percent|pour ?cent)$/.test(t);
    const value = isPercent ? readProportion(t) : digits(t);
    if (!value) return false;
    const written = /[.,](\d+)/.exec(t.replace(/(\d)[ .'](\d{3})(?!\d)/g, '$1$2'))?.[1].length ?? 0;
    if (value.compare(exact) === 0) return true;
    // Minimum precision (decimals as written; for percent, percent decimals); otherwise "0" would count as rounded
    if (written < minDigits) return false;
    return round(exact, written + (isPercent ? 2 : 0)).compare(value) === 0;
}

/** Rounds half away from zero to `decimals` places, exactly. */
function round(x: Rational, decimals: number): Rational {
    const scale = 10n ** BigInt(decimals);
    const scaled = x.mul(new Rational(scale));
    const negative = scaled.n < 0n;
    const abs = negative ? -scaled.n : scaled.n;
    let q = abs / scaled.d;
    if ((abs % scaled.d) * 2n >= scaled.d) q += 1n;
    return new Rational(negative ? -q : q, scale);
}

/** Digit notation: sign/currency, thousands groups, decimal part, fraction; no digits afterwards. */
function digits(t: string): Rational | undefined {
    // Thousands groups only without a leading zero (0.750 is 0.75)
    const m = /^[$€£]?\s*([+\-−]?)\s*([1-9]\d{0,2}(?:[ .'](\d{3}))+(?!\d)|\d+)(?:[.,](\d+))?(?:\s*\/\s*(\d+))?(.*)$/.exec(t);
    if (!m) return undefined;
    const [, sign, int, , frac, denominator, rest] = m;
    if (/\d/.test(rest)) return undefined;
    const whole = int.replace(/[ .']/g, '');
    if (denominator !== undefined) {
        if (frac !== undefined || BigInt(denominator) === 0n) return undefined;
        return new Rational(BigInt(whole) * (sign ? -1n : 1n), BigInt(denominator));
    }
    const fraction = frac ?? '';
    return new Rational(BigInt(whole + fraction) * (sign ? -1n : 1n), 10n ** BigInt(fraction.length));
}

// --- Number words --------------------------------------------------------------------------

let table: Map<string, number> | undefined;

/** Number word at the start (longest matching word sequence), followed at most by units without digits. */
function words(t: string): Rational | undefined {
    if (/\d/.test(t)) return undefined;
    const value = wordPrefix(normalizeWords(t).split(' '))?.value;
    return value === undefined ? undefined : new Rational(BigInt(value));
}

/** Longest leading word sequence that is a number up to 999 999; returns value and word count. */
function wordPrefix(tokens: string[]): { value: number; length: number } | undefined {
    // Numbers up to 999 999 need about ten words at most; don't try longer prefixes (would be quadratic)
    for (let n = Math.min(tokens.length, 12); n > 0; n--) {
        const value = wordValue(tokens.slice(0, n).join(' '));
        if (value !== undefined) return { value, length: n };
    }
    return undefined;
}

const THOUSAND = /^(.*?)\s*(tausend|thousand|mille)\s*(?:und\s+|and\s+)?(.*)$/;

/** Value of a complete number phrase, or undefined. */
function wordValue(phrase: string): number | undefined {
    const lookup = table ??= buildTable();
    const small = lookup.get(phrase);
    if (small !== undefined) return small;
    // "dreitausendzweihundertachtzehn", "three thousand two hundred (and) eighteen", "soixante-trois mille"
    const m = THOUSAND.exec(phrase);
    if (!m) return undefined;
    const [, head, , tail] = m;
    const factor = head === '' || head === 'ein' || head === 'one' || head === 'a' ? 1 : lookup.get(head.trim());
    const rest = tail === '' ? 0 : lookup.get(tail.trim());
    if (factor === undefined || rest === undefined || factor === 0) return undefined;
    return factor * 1000 + rest;
}

function normalizeWords(t: string): string {
    return t.replace(/ß/g, 'ss').replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
}

function buildTable(): Map<string, number> {
    const map = new Map<string, number>();
    const add = (n: number, ...forms: string[]) => forms.forEach(f => {
        const key = normalizeWords(f);
        if (!map.has(key)) map.set(key, n);
        const plain = key.normalize('NFD').replace(/[̀-ͯ]/g, '');
        if (!map.has(plain)) map.set(plain, n);
    });
    for (let n = 0; n <= 999; n++) {
        add(n, ...english(n));
        add(n, ...german(n));
        add(n, ...french(n));
    }
    return map;
}

const EN = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
    'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const EN_TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

function english(n: number): string[] {
    if (n < 20) return [EN[n]];
    if (n < 100) return [EN_TENS[Math.floor(n / 10)] + (n % 10 ? ` ${EN[n % 10]}` : '')];
    const h = Math.floor(n / 100), rest = n % 100;
    const heads = h === 1 ? ['one hundred', 'a hundred', 'hundred'] : [`${EN[h]} hundred`];
    if (rest === 0) return heads;
    return heads.flatMap(head => english(rest).flatMap(r => [`${head} and ${r}`, `${head} ${r}`]));
}

const DE = ['null', 'eins', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn', 'elf', 'zwölf',
    'dreizehn', 'vierzehn', 'fünfzehn', 'sechzehn', 'siebzehn', 'achtzehn', 'neunzehn'];
const DE_TENS = ['', '', 'zwanzig', 'dreißig', 'vierzig', 'fünfzig', 'sechzig', 'siebzig', 'achtzig', 'neunzig'];

function german(n: number): string[] {
    if (n === 1) return ['eins', 'ein', 'eine'];
    if (n < 20) return [DE[n]];
    if (n < 100) {
        const o = n % 10, t = DE_TENS[Math.floor(n / 10)];
        return [o ? `${o === 1 ? 'ein' : DE[o]}und${t}` : t];
    }
    const h = Math.floor(n / 100), rest = n % 100;
    const heads = h === 1 ? ['hundert', 'einhundert'] : [`${DE[h]}hundert`];
    if (rest === 0) return heads;
    const tails = rest === 1 ? ['eins'] : german(rest);
    return heads.flatMap(head => tails.flatMap(r => [`${head}${r}`, `${head}und${r}`]));
}

const FR = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze',
    'treize', 'quatorze', 'quinze', 'seize'];
const FR_TENS = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante'];

function french(n: number): string[] {
    if (n === 1) return ['un', 'une'];
    if (n <= 16) return [FR[n]];
    if (n < 20) return [`dix-${FR[n - 10]}`];
    if (n < 70) {
        const t = FR_TENS[Math.floor(n / 10)], o = n % 10;
        return [o === 0 ? t : o === 1 ? `${t} et un` : `${t}-${FR[o]}`];
    }
    if (n < 80) return [n === 71 ? 'soixante et onze' : `soixante-${french(n - 60)[0]}`];
    if (n < 100) return n === 80 ? ['quatre-vingts', 'quatre-vingt'] : [`quatre-vingt-${french(n - 80)[0]}`];
    const h = Math.floor(n / 100), rest = n % 100;
    const head = h === 1 ? 'cent' : `${FR[h]} cent`;
    if (rest === 0) return h === 1 ? ['cent'] : [`${head}s`, head];
    return french(rest).map(r => `${head} ${r}`);
}

// --- Quantities: number with unit -----------------------------------------------------------

/** Unit: dimension (length, area …) and factor to the base unit; currencies do not convert into each other. */
interface Unit { dim: string; factor: Rational }

const UNITS = new Map<string, Unit>();
function unit(dim: string, factor: string, ...names: string[]): void {
    const [n, d = '1'] = factor.split('/');
    names.forEach(name => UNITS.set(name, { dim, factor: new Rational(BigInt(n), BigInt(d)) }));
}
unit('länge', '1/1000', 'mm', 'millimeter', 'millimetre', 'millimètre', 'millimeters', 'millimetres', 'millimètres');
unit('länge', '1/100', 'cm', 'zentimeter', 'centimeter', 'centimetre', 'centimètre', 'centimeters', 'centimetres', 'centimètres');
unit('länge', '1/10', 'dm', 'dezimeter', 'decimeter', 'décimètre');
unit('länge', '1', 'm', 'meter', 'metre', 'mètre', 'meters', 'metres', 'mètres');
unit('länge', '1000', 'km', 'kilometer', 'kilometre', 'kilomètre', 'kilometers', 'kilometres', 'kilomètres');
unit('fläche', '1/1000000', 'mm²', 'quadratmillimeter');
unit('fläche', '1/10000', 'cm²', 'quadratzentimeter');
unit('fläche', '1/100', 'dm²', 'quadratdezimeter');
unit('fläche', '1', 'm²', 'qm', 'quadratmeter', 'square meters', 'square metres', 'mètres carrés');
unit('fläche', '100', 'a', 'ar');
unit('fläche', '10000', 'ha', 'hektar', 'hectare', 'hectares');
unit('fläche', '1000000', 'km²', 'quadratkilometer');
unit('volumen', '1/1000', 'ml', 'milliliter', 'millilitre', 'cm³', 'kubikzentimeter', 'ccm');
unit('volumen', '1/100', 'cl', 'zentiliter', 'centilitre');
unit('volumen', '1/10', 'dl', 'deziliter', 'décilitre');
unit('volumen', '1', 'l', 'liter', 'litre', 'litres', 'liters', 'dm³', 'kubikdezimeter');
unit('volumen', '1000', 'm³', 'kubikmeter');
unit('masse', '1/1000', 'mg', 'milligramm', 'milligram', 'milligramme');
unit('masse', '1', 'g', 'gramm', 'gram', 'grams', 'gramme', 'grammes');
unit('masse', '1000', 'kg', 'kilogramm', 'kilogram', 'kilograms', 'kilo', 'kilos', 'kilogramme');
unit('masse', '1000000', 't', 'tonne', 'tonnen', 'tonnes', 'ton', 'tons');
unit('zeit', '1', 's', 'sek', 'sekunde', 'sekunden', 'second', 'seconds', 'seconde', 'secondes');
unit('zeit', '60', 'min', 'minute', 'minuten', 'minutes');
unit('zeit', '3600', 'h', 'std', 'stunde', 'stunden', 'hour', 'hours', 'heure', 'heures');
unit('zeit', '86400', 'tag', 'tage', 'tagen', 'day', 'days', 'jour', 'jours');
unit('tempo', '1', 'km/h', 'kmh', 'km pro stunde', 'kilometer pro stunde', 'kilometres per hour', 'kilometers per hour');
unit('euro', '1', '€', 'euro', 'euros', 'eur');
unit('euro', '1/100', 'ct', 'cent', 'cents', 'centime', 'centimes');
unit('dollar', '1', '$', 'dollar', 'dollars', 'usd');
unit('dollar', '1/100', '¢');
unit('pfund', '1', '£', 'pound', 'pounds', 'gbp');
unit('pfund', '1/100', 'p', 'pence', 'penny', 'pennies');
unit('prozent', '1', '%', 'prozent', 'percent', 'pour cent');

function unitOf(text: string): Unit | undefined {
    const key = text.toLowerCase().replace(/\s+/g, ' ').replace(/\.$/, '').trim()
        .replace(/\^?2$/, '²').replace(/\^?3$/, '³');
    return UNITS.get(key);
}

/**
 * Number with unit, converted to `target`: quantity("4 km", "m") = 4000, quantity("£14", "£") = 14,
 * quantity("4,25 kilomètres", "km") = 17/4. Undefined without a unit or with an incompatible one.
 */
export function readQuantity(text: string, target: string): Rational | undefined {
    const goal = unitOf(target);
    if (!goal) return undefined;
    const t = text.normalize('NFC').toLowerCase().replace(SPACE, ' ').trim();
    let value: Rational | undefined, rest = '';
    const symbol = /^([$€£])\s*(.*)$/.exec(t);
    const body = symbol ? symbol[2] : t;
    const m = /^([+\-−]?)\s*([1-9]\d{0,2}(?:[ .'](\d{3}))+(?!\d)|\d+)(?:[.,](\d+))?\s*(.*)$/.exec(body);
    if (m) {
        const [, sign, int, , frac = '', after] = m;
        value = new Rational(BigInt(int.replace(/[ .']/g, '') + frac) * (sign ? -1n : 1n), 10n ** BigInt(frac.length));
        rest = after;
    } else {
        const tokens = normalizeWords(body).split(' ');
        const prefix = wordPrefix(tokens);
        if (!prefix) return undefined;
        value = new Rational(BigInt(prefix.value));
        rest = tokens.slice(prefix.length).join(' ');
    }
    // Unit: leading currency symbol or the rest; a unit written twice ("15 kg kg") counts once
    let source = symbol ? unitOf(symbol[1]) : undefined;
    if (rest !== '') {
        const parts = rest.split(' ');
        const half = parts.length % 2 === 0 && parts.slice(0, parts.length / 2).join(' ') === parts.slice(parts.length / 2).join(' ');
        const named = unitOf(half ? parts.slice(0, parts.length / 2).join(' ') : rest);
        if (!named || (source && named.dim !== source.dim)) return undefined;
        source ??= named;
    }
    if (!source || source.dim !== goal.dim) return undefined;
    return value.mul(source.factor).div(goal.factor);
}
