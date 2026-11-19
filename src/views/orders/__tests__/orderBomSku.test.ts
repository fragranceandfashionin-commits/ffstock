import { describe, it, expect } from 'vitest';
import { getCategoryForComponent } from '../orderBomUtils';

describe('Orders BOM SKU Creation & Smart Pre-fill', () => {
  describe('getCategoryForComponent', () => {
    it('maps bottle component names to Bottle category', () => {
      expect(getCategoryForComponent('Bottles')).toBe('Bottle');
      expect(getCategoryForComponent('Bottle')).toBe('Bottle');
      expect(getCategoryForComponent('50ml Glass Bottle')).toBe('Bottle');
      expect(getCategoryForComponent('Perfume Vial')).toBe('Bottle');
    });

    it('maps cap and closure component names to Cap category', () => {
      expect(getCategoryForComponent('Cap')).toBe('Cap');
      expect(getCategoryForComponent('Caps')).toBe('Cap');
      expect(getCategoryForComponent('Magnetic Closure')).toBe('Cap');
      expect(getCategoryForComponent('Aluminium Collar')).toBe('Cap');
    });

    it('maps atomizer and pump component names to Atomizer category', () => {
      expect(getCategoryForComponent('Atomizer')).toBe('Atomizer');
      expect(getCategoryForComponent('Spray Pump')).toBe('Atomizer');
      expect(getCategoryForComponent('Mist Nozzle')).toBe('Atomizer');
      expect(getCategoryForComponent('Crimper')).toBe('Atomizer');
    });

    it('maps packaging, box, cellophane and carton components to Packaging category', () => {
      expect(getCategoryForComponent('Box')).toBe('Packaging');
      expect(getCategoryForComponent('Inner Outer')).toBe('Packaging');
      expect(getCategoryForComponent('Cellophane')).toBe('Packaging');
      expect(getCategoryForComponent('Mono Carton')).toBe('Packaging');
      expect(getCategoryForComponent('Packaging Box')).toBe('Packaging');
    });

    it('maps sticker and label components to Label category', () => {
      expect(getCategoryForComponent('Sticker')).toBe('Label');
      expect(getCategoryForComponent('Label')).toBe('Label');
      expect(getCategoryForComponent('Metallic Tag')).toBe('Label');
    });

    it('maps fragrance and oil components to Fragrance category', () => {
      expect(getCategoryForComponent('Fragrance')).toBe('Fragrance');
      expect(getCategoryForComponent('Perfume Oil')).toBe('Fragrance');
      expect(getCategoryForComponent('Scent Base')).toBe('Fragrance');
      expect(getCategoryForComponent('Essence')).toBe('Fragrance');
    });

    it('maps raw materials, solvents and alcohol to Raw Material category', () => {
      expect(getCategoryForComponent('Raw Material')).toBe('Raw Material');
      expect(getCategoryForComponent('Ethanol 99.9%')).toBe('Raw Material');
      expect(getCategoryForComponent('Chemical Solvent')).toBe('Raw Material');
    });

    it('defaults unknown components to Other', () => {
      expect(getCategoryForComponent('Random Accessory')).toBe('Other');
      expect(getCategoryForComponent('')).toBe('Other');
    });
  });
});
