import { describe, expect, it } from 'vitest';
import {
  LIBRARY_CATEGORIES,
  LIBRARY_CATALOG_ITEMS,
  filterLibraryItems,
  listLibraryCategoriesWithBest,
  resolveLibraryPreset,
} from '../src/kernel/libraryCatalog';

describe('libraryCatalog', () => {
  it('groups every category with an explicit best example at top', () => {
    const groups = listLibraryCategoriesWithBest();
    expect(groups.length).toBe(LIBRARY_CATEGORIES.length);
    for (const g of groups) {
      expect(g.bestItem).toBeDefined();
      expect(g.bestItem.isCategoryBest).toBe(true);
      expect(g.items[0].id).toBe(g.bestItem.id);
      expect(g.items.every((it) => it.categoryId === g.category.id)).toBe(true);
      expect(g.category.defaultCatalogQuery.length).toBeGreaterThan(2);
    }
  });

  it('marks RockShox BoXXer Ultimate 27.5 as controlled deterministic GAN reference', () => {
    const boxxer = LIBRARY_CATALOG_ITEMS.find((it) => it.presetId === 'preset-dh-fork');
    expect(boxxer).toBeDefined();
    expect(boxxer?.isDeterministicGanReference).toBe(true);
    expect(boxxer?.ganReferenceCode).toBe('GAN-REF-BOXXER-275');
    expect(boxxer?.catalogSearchTags.length).toBeGreaterThan(3);
  });

  it('filters by category and text query natively', () => {
    const allItems = filterLibraryItems('all', '');
    expect(allItems.length).toBe(LIBRARY_CATALOG_ITEMS.length);

    const aeroItems = filterLibraryItems('aeroespacial', '');
    expect(aeroItems.length).toBe(1);
    expect(aeroItems[0].presetId).toBe('preset-aero-titanium');

    const gearMatch = filterLibraryItems('industrial-cnc', 'evolvente');
    expect(gearMatch.length).toBe(1);
    expect(gearMatch[0].presetId).toBe('preset-gear-m2-z24');

    const emptyMatch = filterLibraryItems('robotica', 'inexistente-xyz');
    expect(emptyMatch).toEqual([]);
  });

  it('resolves full presets by library id, preset id, or returns undefined', () => {
    const byLibId = resolveLibraryPreset('lib-preset-dh-fork');
    expect(byLibId?.id).toBe('preset-dh-fork');

    const byPresetId = resolveLibraryPreset('preset-gear-m2-z24');
    expect(byPresetId?.id).toBe('preset-gear-m2-z24');

    expect(resolveLibraryPreset('preset-does-not-exist')).toBeUndefined();
  });
});
