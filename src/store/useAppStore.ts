import { create } from 'zustand';
import type { LabelTemplate } from '@/config/template';
import { DEFAULT_TEMPLATE } from '@/config/template';
import type { Sticker } from '@/types';
import type { SizeId, TypeId } from '@/config/variants';
import { SIZES, TYPES } from '@/config/variants';

/**
 * Minimal store for phase 1. Upload, selection and Drive state land here in
 * phases 2 and 3 — see docs/v2-plan.md §9.
 */

export interface Filters {
  size: SizeId;
  type: TypeId;
  barcode: boolean;
  logo: boolean;
}

interface AppState {
  template: LabelTemplate;
  filters: Filters;
  stickers: Sticker[];

  setTemplate: (patch: Partial<LabelTemplate>) => void;
  resetTemplate: () => void;
  setFilters: (patch: Partial<Filters>) => void;
}

export const useAppStore = create<AppState>((set) => ({
  template: { ...DEFAULT_TEMPLATE },
  filters: {
    size: SIZES[0].id,
    type: TYPES[0].id,
    barcode: true,
    logo: false,
  },
  stickers: [],

  setTemplate: (patch) => set((s) => ({ template: { ...s.template, ...patch } })),
  resetTemplate: () => set({ template: { ...DEFAULT_TEMPLATE } }),
  setFilters: (patch) => set((s) => ({ filters: { ...s.filters, ...patch } })),
}));
