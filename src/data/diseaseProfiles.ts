export type DiseaseProfile = {
  id: string;
  name: string;
  icd10: string;
  defaultVitD_IU: number;
  defaultFluid_L: number;
  keyMarkers: string[];
  patientDescription: string;
  doctorNotes: string;
};

export const DISEASE_PROFILES: DiseaseProfile[] = [
  {
    id: 'ms',
    name: 'Multiple Sclerosis',
    icd10: 'G35',
    defaultVitD_IU: 40000,
    defaultFluid_L: 2.5,
    keyMarkers: ['VitD', 'Calcium', 'PTH', 'Creatinine'],
    patientDescription:
      'Multiple Sclerosis is an autoimmune disease affecting the central nervous system. This protocol uses high-dose Vitamin D3 alongside strict dietary calcium restriction and high fluid intake to modulate immune function and slow disease progression.',
    doctorNotes:
      'Start at 40,000 IU and titrate based on PTH suppression. Target PTH < 30 pg/mL.',
  },
  {
    id: 'lupus',
    name: 'Lupus',
    icd10: 'M32',
    defaultVitD_IU: 35000,
    defaultFluid_L: 2.5,
    keyMarkers: ['VitD', 'ANA', 'dsDNA', 'Complement'],
    patientDescription:
      'Systemic Lupus Erythematosus (SLE) is a chronic autoimmune disease that can affect multiple organ systems including skin, joints, kidneys, and the nervous system. High-dose Vitamin D3 aims to rebalance immune dysregulation at the root of lupus activity.',
    doctorNotes:
      'Monitor ANA and anti-dsDNA antibody titers alongside standard protocol labs.',
  },
  {
    id: 'psoriasis',
    name: 'Psoriasis',
    icd10: 'L40',
    defaultVitD_IU: 35000,
    defaultFluid_L: 2.0,
    keyMarkers: ['VitD', 'CRP', 'ESR'],
    patientDescription:
      'Psoriasis is a chronic immune-mediated skin condition causing rapid skin cell turnover, resulting in scaling, inflammation, and plaques.',
    doctorNotes: 'CRP and ESR serve as systemic inflammation markers.',
  },
  {
    id: 'vitiligo',
    name: 'Vitiligo',
    icd10: 'L80',
    defaultVitD_IU: 30000,
    defaultFluid_L: 2.0,
    keyMarkers: ['VitD', 'Calcium', 'Thyroid'],
    patientDescription:
      'Vitiligo is an autoimmune condition in which the immune system destroys melanocytes, causing depigmented patches on the skin.',
    doctorNotes: 'Check thyroid panel (TSH, fT4) as thyroid autoimmunity frequently co-occurs.',
  },
  {
    id: 'ra',
    name: 'Rheumatoid Arthritis',
    icd10: 'M05',
    defaultVitD_IU: 40000,
    defaultFluid_L: 2.5,
    keyMarkers: ['VitD', 'RF', 'CRP', 'ESR'],
    patientDescription:
      'Rheumatoid Arthritis is a systemic autoimmune disease primarily targeting synovial joints, causing inflammation, pain, and progressive joint destruction.',
    doctorNotes: 'Track Rheumatoid Factor (RF) and anti-CCP alongside CRP/ESR for inflammation status.',
  },
  {
    id: 'hashimoto',
    name: "Hashimoto's Thyroiditis",
    icd10: 'E06.3',
    defaultVitD_IU: 30000,
    defaultFluid_L: 2.0,
    keyMarkers: ['VitD', 'TSH', 'TPO-Ab'],
    patientDescription:
      "Hashimoto's Thyroiditis is an autoimmune condition in which antibodies attack thyroid tissue, gradually impairing thyroid function.",
    doctorNotes: 'Monitor TSH and fT4 every 3 months.',
  },
  {
    id: 'crohn',
    name: "Crohn's Disease",
    icd10: 'K50',
    defaultVitD_IU: 35000,
    defaultFluid_L: 3.0,
    keyMarkers: ['VitD', 'CRP', 'Calprotectin'],
    patientDescription:
      "Crohn's Disease is an inflammatory bowel disease causing chronic inflammation anywhere along the digestive tract.",
    doctorNotes: 'Fecal calprotectin is the preferred mucosal inflammation marker.',
  },
  {
    id: 't1d',
    name: 'Type 1 Diabetes',
    icd10: 'E10',
    defaultVitD_IU: 30000,
    defaultFluid_L: 2.0,
    keyMarkers: ['VitD', 'HbA1c', 'C-peptide'],
    patientDescription:
      'Type 1 Diabetes is an autoimmune disease in which the immune system destroys insulin-producing beta cells in the pancreas.',
    doctorNotes: 'C-peptide levels reflect residual beta-cell function.',
  },
];

export function getProfileById(id: string): DiseaseProfile | undefined {
  return DISEASE_PROFILES.find((p) => p.id === id);
}

export function getProfileByDiagnosis(diagnosis: string): DiseaseProfile | undefined {
  const lower = diagnosis.toLowerCase();
  return DISEASE_PROFILES.find(
    (p) =>
      p.name.toLowerCase() === lower ||
      p.id === lower ||
      p.icd10.toLowerCase() === lower
  );
}
