// Pure-tracker build: food/supplement pairing advice (what to take with, what
// to avoid, absorption tips) has been removed — the app gives no advice.
// FOOD_PAIRINGS is empty; the name map is kept for display only.
// Original: src/_sidelined/foodPairings.original.ts.
export interface FoodPairing {
  supplement_id: string;
  pairs_with: string;
  avoid: string;
  tip: string;
}

export const FOOD_PAIRINGS: FoodPairing[] = [];

export const supplementIdToName: Record<string, string> = {
  vit_d3: 'Vitamin D3',
  vit_k2: 'Vitamin K2 (MK-7)',
  omega3: 'Omega-3',
  mag_citrate: 'Magnesium Citrate',
  mag_glycinate: 'Magnesium Glycinate',
  vit_b2: 'Vitamin B2 (Riboflavin)',
  nicotinamide: 'Nicotinamide (B3)',
  zinc: 'Zinc',
  selenium: 'Selenium',
  boron: 'Boron',
};
