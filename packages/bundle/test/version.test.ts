import { describe, expect, test } from 'vitest';
import { BUNDLE_FORMAT, BUNDLE_VERSION, bundleProblem, supportsVersion } from '../src/index.js';

const bundle = (version: string) => ({ format: BUNDLE_FORMAT, version, items: [], components: {}, codings: [] });

describe('Version eines Bundles', () => {
    test('die Runtime nimmt Bundles ihrer eigenen Version', () => {
        expect(BUNDLE_VERSION).toBe('0.1');
        expect(bundleProblem(bundle('0.1'))).toBeUndefined();
    });

    test('vor 1.0 zählt jede Nebenversion als unverträglich', () => {
        expect(bundleProblem(bundle('0.2'))).toBe('Bundle-Version 0.2 wird nicht unterstützt (diese Runtime: 0.1).');
        expect(bundleProblem(bundle('0.0'))).toBe('Bundle-Version 0.0 wird nicht unterstützt (diese Runtime: 0.1).');
        expect(supportsVersion('0.2', '0.1')).toBe(false);
        expect(bundleProblem(bundle('1.1'))).toBe('Bundle-Version 1.1 wird nicht unterstützt (diese Runtime: 0.1).');
    });

    test('ab 1.0 nimmt eine Runtime Bundles bis zu ihrer Nebenversion, nicht neuere und keine andere Hauptversion', () => {
        expect(supportsVersion('1.3', '1.2')).toBe(true);
        expect(supportsVersion('1.3', '1.3')).toBe(true);
        expect(supportsVersion('1.3', '1.4')).toBe(false);
        expect(supportsVersion('1.3', '2.0')).toBe(false);
        expect(supportsVersion('1.3', '0.3')).toBe(false);
    });

    test('eine unlesbare Version wird abgelehnt', () => {
        expect(supportsVersion('1.3', '1')).toBe(false);
        expect(supportsVersion('1.3', '1.x')).toBe(false);
        expect(bundleProblem({ format: BUNDLE_FORMAT, items: [] })).toMatch(/^Bundle-Version undefined wird nicht unterstützt/);
    });
});
