export interface FoodPairing {
  supplement_id: string;
  pairs_with: string;
  avoid: string;
  tip: string;
}

export const FOOD_PAIRINGS: FoodPairing[] = [
  {
    supplement_id: 'vit_d3',
    pairs_with: 'fatty meal (avocado, olive oil, eggs)',
    avoid: 'low-fat meal',
    tip: 'Fat-soluble — absorption drops 50% without dietary fat',
  },
  {
    supplement_id: 'vit_k2',
    pairs_with: 'fatty meal (avocado, olive oil, eggs)',
    avoid: 'low-fat meal',
    tip: 'Fat-soluble. Take with D3 for synergistic effect',
  },
  {
    supplement_id: 'omega3',
    pairs_with: 'fatty meal (avocado, olive oil, eggs)',
    avoid: 'low-fat meal',
    tip: 'Fat-soluble. Store in refrigerator after opening',
  },
  {
    supplement_id: 'mag_citrate',
    pairs_with: 'meal or snack',
    avoid: 'coffee within 1h',
    tip: 'Magnesium absorbs better with food',
  },
  {
    supplement_id: 'mag_glycinate',
    pairs_with: 'light snack or dinner',
    avoid: 'coffee within 1h',
    tip: 'Gentler form — ideal for evening',
  },
  {
    supplement_id: 'vit_b2',
    pairs_with: 'meal',
    avoid: 'empty stomach (may cause nausea)',
    tip: 'May turn urine yellow — normal and harmless',
  },
  {
    supplement_id: 'nicotinamide',
    pairs_with: 'light snack',
    avoid: 'large high-fat meals',
    tip: 'Non-flushing form — take consistently at same time',
  },
  {
    supplement_id: 'zinc',
    pairs_with: 'light snack',
    avoid: 'dairy, coffee, calcium within 2h',
    tip: 'Competes with calcium and magnesium for absorption',
  },
  {
    supplement_id: 'selenium',
    pairs_with: 'light snack',
    avoid: 'zinc within 1h',
    tip: 'Antioxidant — separate from zinc for best absorption',
  },
  {
    supplement_id: 'boron',
    pairs_with: 'dinner',
    avoid: 'none',
    tip: 'Take with evening meal for mineral balance',
  },
];

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
