import { describe, it, expect } from 'vitest';
import { parseColor, hexToRgb } from '../colors';

describe('colors utils', () => {
    describe('parseColor', () => {
        it('should convert RGB array to hex string', () => {
            expect(parseColor([255, 0, 0])).toBe('#ff0000');
            expect(parseColor([0, 255, 0])).toBe('#00ff00');
            expect(parseColor([0, 0, 255])).toBe('#0000ff');
            expect(parseColor([255, 255, 255])).toBe('#ffffff');
            expect(parseColor([0, 0, 0])).toBe('#000000');
        });

        it('should handle short arrays gracefully', () => {
            expect(parseColor([255, 255])).toBe('#ffffff');
            expect(parseColor([])).toBe('#ffffff');
        });
    });

    describe('hexToRgb', () => {
        it('should convert hex string to RGB tuple', () => {
            expect(hexToRgb('#ff0000')).toEqual([255, 0, 0]);
            expect(hexToRgb('#00ff00')).toEqual([0, 255, 0]);
            expect(hexToRgb('#0000ff')).toEqual([0, 0, 255]);
            expect(hexToRgb('#ffffff')).toEqual([255, 255, 255]);
            expect(hexToRgb('#000000')).toEqual([0, 0, 0]);
        });

        it('should handle hex without hash', () => {
            expect(hexToRgb('ff0000')).toEqual([255, 0, 0]);
        });

        it('should handle invalid hex gracefully', () => {
            expect(hexToRgb('invalid')).toEqual([255, 255, 255]);
        });
    });
});
