// Pure-tracker build: disease entries are NAME LABELS ONLY, so a user can tag
// which condition they're tracking. All medical content — recommended doses,
// doctor notes, protocol descriptions, marker recommendations — has been
// removed (the app gives no advice). Originals: src/_sidelined/diseaseProfiles.original.ts.
export type DiseaseProfile = {
  id: string;
  name: string;
  icd10: string;
  defaultVitD_IU: number; // 0 — user sets their own dose
  defaultFluid_L: number; // 0 — user sets their own
  keyMarkers: string[]; // empty — user chooses what to track
  patientDescription: string; // '' — no app-authored medical description
  doctorNotes: string; // '' — no app-authored medical advice
};

export const DISEASE_PROFILES: DiseaseProfile[] = [
  { id: 'ms', name: 'Multiple Sclerosis', icd10: 'G35' },
  { id: 'lupus', name: 'Lupus', icd10: 'M32' },
  { id: 'psoriasis', name: 'Psoriasis', icd10: 'L40' },
  { id: 'vitiligo', name: 'Vitiligo', icd10: 'L80' },
  { id: 'ra', name: 'Rheumatoid Arthritis', icd10: 'M05' },
  { id: 'hashimoto', name: "Hashimoto's Thyroiditis", icd10: 'E06.3' },
  { id: 'crohn', name: "Crohn's Disease", icd10: 'K50' },
  { id: 't1d', name: 'Type 1 Diabetes', icd10: 'E10' },
  { id: 'other', name: 'Other', icd10: '' },
].map((d) => ({
  ...d,
  defaultVitD_IU: 0,
  defaultFluid_L: 0,
  // Not disease-specific advice — just which lab input fields are available to
  // fill in (all of them). The app suggests no targets for any of these.
  keyMarkers: ['VitD', 'PTH', 'Calcium', 'Creatinine', 'NfL'],
  patientDescription: '',
  doctorNotes: '',
}));

export function getProfileById(id: string): DiseaseProfile | undefined {
  return DISEASE_PROFILES.find((p) => p.id === id);
}

export function getProfileByDiagnosis(diagnosis: string): DiseaseProfile | undefined {
  const lower = diagnosis.toLowerCase();
  return DISEASE_PROFILES.find(
    (p) => p.name.toLowerCase() === lower || p.id === lower || p.icd10.toLowerCase() === lower
  );
}
