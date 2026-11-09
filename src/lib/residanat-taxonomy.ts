// Résidanat catalog taxonomy — the single source of truth for how hb-db raw
// labels map onto Hamame's catalog (faculty → 'Résidanat' year → specialty
// module → topic unit) and onto the Question facets (category = specialty,
// subcategory = topic, period = épreuve, examYear + sittingLabel = sitting).
//
// Shared by src/scripts/import-hb-db.ts (conversion), prisma/cleanup-catalog.ts
// (re-homing existing rows) and prisma/seed.ts (faculty roster), so a spelling
// fix here lands everywhere at once. Pure: no Prisma, no fs.
//
// Shape follows MBset/MedSpark Résidanat browsing: questions carry a specialty
// and a topic label that are identical across faculties, the épreuve is one of
// the three official papers, and the sitting year is a separate dimension.

export interface ResidanatFaculty {
  code: string; // hb-db section prefix (README_DB.md)
  slug: string;
  name: string;
  wilaya: string;
}

// Only faculties that actually have papers in hb-db. Order = display order.
export const RESIDANAT_FACULTIES: readonly ResidanatFaculty[] = [
  { code: "alg", slug: "fac-alger", name: "Faculté de Médecine d'Alger", wilaya: "Alger" },
  { code: "bli", slug: "fac-blida", name: "Faculté de Médecine de Blida", wilaya: "Blida" },
  { code: "con", slug: "fac-constantine", name: "Faculté de Médecine de Constantine", wilaya: "Constantine" },
  { code: "ora", slug: "fac-oran", name: "Faculté de Médecine d'Oran", wilaya: "Oran" },
  { code: "ann", slug: "fac-annaba", name: "Faculté de Médecine d'Annaba", wilaya: "Annaba" },
  { code: "set", slug: "fac-setif", name: "Faculté de Médecine de Sétif", wilaya: "Sétif" },
  { code: "tle", slug: "fac-tlemcen", name: "Faculté de Médecine de Tlemcen", wilaya: "Tlemcen" },
  { code: "sba", slug: "fac-sidi-bel-abbes", name: "Faculté de Médecine de Sidi Bel Abbès", wilaya: "Sidi Bel Abbès" },
  { code: "tiz", slug: "fac-tizi-ouzou", name: "Faculté de Médecine de Tizi Ouzou", wilaya: "Tizi Ouzou" },
  { code: "bat", slug: "fac-batna", name: "Faculté de Médecine de Batna", wilaya: "Batna" },
];

export const RESIDANAT_YEAR_LABEL = "Résidanat";
export const RESIDANAT_TRACK = "medecine";

export const EPREUVES = ["Sciences fondamentales", "Médico-chirurgicale", "Dossiers cliniques"] as const;
export type Epreuve = (typeof EPREUVES)[number];

export function facultyByCode(code: string): ResidanatFaculty | undefined {
  return RESIDANAT_FACULTIES.find((f) => f.code === code);
}

/** Accent/case/punctuation-insensitive key used for every label lookup. */
export function labelKey(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’`]/g, "'")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Trim + collapse inner whitespace; keeps the original casing/accents. */
export function tidyLabel(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

// -- Specialties -------------------------------------------------------------
//
// Integrated organ-system units of the preclinical years appear under each
// faculty's own course code ("UEI 4 (2ème année)", "Unité 4 endo (2 ème)",
// "U4_Endocrinologie(2ème)"...). The 2nd-year numbering (1 cardio-respiratoire,
// 2 digestif, 3 urinaire, 4 endocrinien-reproduction, 5 nerveux-sens) and the
// 3rd-year numbering (1 cardio-sémiologie, 2 neuro-locomoteur-cutané,
// 3 endocrino-uro-reproduction, 4 digestif-hématopoïèse) are shared by every
// faculty whose labels spell the system out, so numbered-only codes follow it.

const Y2_CARDIO = "Appareil cardio-respiratoire (2e année)";
const Y2_DIGESTIF = "Appareil digestif (2e année)";
const Y2_URINAIRE = "Appareil urinaire (2e année)";
const Y2_ENDO = "Système endocrinien et reproduction (2e année)";
const Y2_NEURO = "Système nerveux et organes des sens (2e année)";
const Y3_CARDIO = "Cardio-respiratoire et sémiologie (3e année)";
const Y3_NEURO = "Neurologie, locomoteur et cutané (3e année)";
const Y3_ENDO = "Endocrinologie, uro-néphrologie et reproduction (3e année)";
const Y3_DIGESTIF = "Digestif et hématopoïèse (3e année)";

const SPECIALTY_ALIASES: Record<string, readonly string[]> = {
  // Preclinical integrated units
  [Y2_CARDIO]: [
    "UEI 1 (2ème année)", "Unité 1 (2 ème)", "Unité 1 cardio-respiratoire (2 ème)", "U1_Cardio-Respiratoire(2ème)",
    "Unité 1: L'Appareil Cardio-Respiratoire", "U1: L'Appareil Cardio-Respiratoire", "Appareil Cardio Respiratoire",
  ],
  [Y2_DIGESTIF]: [
    "UEI 2 (2ème année)", "Unité 2 (2 ème)", "Unité 2 digestive (2 ème)", "U2_Digestif(2ème)",
    "Unité 2: L'Appareil Digestif", "U2: L'Appareil Digestif",
  ],
  [Y2_URINAIRE]: [
    "UEI 3 (2ème année)", "Unité 3 (2 ème)", "Unité 3 urinaire (2 ème)", "U3_Urologie(2ème)",
    "Unité 3: L'Appareil Urinaire", "U3: L'Appareil Urinaire", "L'appareil Urinaire",
  ],
  [Y2_ENDO]: [
    "UEI 4 (2ème année)", "Unité 4 (2 ème)", "Unité 4 endo (2 ème)", "U4_Endocrinologie(2ème)",
    "Unité 4: Le Système Endocrinien Et L'Appareil Reproductrice", "U4: Le Système Endocrinien Et L'Appareil Reproductrice",
    "Système Endocrino Genital",
  ],
  [Y2_NEURO]: [
    "UEI 5 (2ème année)", "Unité 5 (2 ème)", "Unité 5 neuro (2 ème)", "U5_Neurologie(2ème)",
    "Unité 5: Le Système Nerveux Et Les Organes Du Sens", "U5: Le Système Nerveux Et Les Organes Du Sens",
    "Systeme_nerveux_et_organes_des_sens",
  ],
  [Y3_CARDIO]: [
    "UE 01 (3ème année)", "Unité 1 (3 ème)", "Unité 1 cardio-respiratoire (3 ème)", "U1_Cardio-Respiratoire(3ème)",
    "UEI 01", "UEI 01 : Semiologie générale , psychologie médicale , appareil cardio-vasculaire 3EME",
    "UI 1 Psycho Semio Cardio Respiratoire",
  ],
  [Y3_NEURO]: [
    "UE 02 (3ème année)", "Unité 2 (3 ème)", "Unité 2 neuro (3 ème)", "UEI 02",
    "UEI 02 : Appareil neurologique, locomoteur et cutané 3EME",
  ],
  [Y3_ENDO]: [
    "UE 03 (3ème année)", "Unité 3 (3 ème)", "Unité 3 endo (3 ème)", "U3_Endocrinologie(3ème)", "UEI 03",
    "UEI 03 : Appareil endocrinien , uro - néphrologique et reproducteur 3EME",
  ],
  [Y3_DIGESTIF]: [
    "UE 04 (3ème année)", "Unité 4 (3 ème)", "Unité 4 digestive (3 ème)", "U4_Digestif(3ème)", "UEI 04",
    "UEI 04 : Appareil digestif et organes hématopoïtiques 3EME",
  ],

  // Preclinical single subjects
  Anatomie: ["Anatomie", "Anatomie (1 ère)", "Anatomie-1ère", "Anatomie (1ère année)"],
  Physiologie: ["Physiologie", "Physiologie (1 ère)", "Physiologie-1ére", "Physiologie (1ère année)"],
  Biochimie: ["Biochimie", "Biochimie (1 ère)", "Biochimie-1ère", "Biochimie (1ère année)"],
  Histologie: ["Histologie", "Histologie (1 ère)", "Histologie (1ère année)", "Histologie-1ére"],
  Embryologie: ["Embryologie"],
  Cytologie: ["Cytologie"],
  Biophysique: ["Biophysique", "Biophysique (1 ère)"],
  Biostatistique: ["Biostatistique"],
  Chimie: ["Chimie"],
  Génétique: ["Génétique", "Genetique", "Génetique"],
  Immunologie: [
    "Immunologie", "Immunologie (2 ème)", "Immunologie (3 éme)", "Immunologie (3 ème)", "Immunologie fondamentale",
    "Immunologie clinique", "Immunologie 2A", "Immunologie 3A", "Immunologie-2éme", "Immunologie-3éme",
    "Immunologie 3Eme", "Immunologie 2Eme", "immunologie pathologique",
  ],
  Microbiologie: ["Microbiologie", "Microbiologie Médicale"],
  "Parasitologie-mycologie": ["Parasitologie", "Parasitologie Mycologie"],
  "Anatomie et cytologie pathologiques": [
    "Anapathologie", "Anatomopathologie", "Anatomie et Cytologie Pathologiques", "Anapath",
  ],
  Hémobiologie: ["Hemobiologie"],
  Pharmacologie: ["Pharmacologie", "Pharmacologie Clinique"],
  Thérapeutique: ["Therapeutique"],

  // Clinical specialties
  "Hépato-gastro-entérologie": [
    "Hépato-Gastro-Entérologie", "Gastrologie", "Gastro-entérologie", "Hépato-Gastro-Entéro(logie)",
    "Hepato gastro enterologie",
  ],
  Pédiatrie: ["Pédiatrie", "Pediatrie"],
  "Chirurgie infantile": ["Chirurgie infantile", "CCI"],
  Neurologie: ["Neurologie"],
  Neurochirurgie: ["Neurochirurgie"],
  Cardiologie: ["Cardiologie"],
  Pneumologie: ["Pneumologie"],
  Endocrinologie: ["Endocrinologie", "Endocrino"],
  "Maladies infectieuses": [
    "Maladies infectieuses", "Les maladies infectieuses", "Maladies-Infectieuses", "Infectiologie",
  ],
  "Gynécologie-obstétrique": [
    "Gynécologie et obstétrique", "Gynecologie obstétrique", "Gynécologie", "Gynecologie", "Gynécologie Obstétrique",
  ],
  Psychiatrie: ["Psychiatrie"],
  "Orthopédie-traumatologie": [
    "Orthopédie", "Orthopédie Traumatologie Rééducation", "OTR", "Orthopedie Traumatologie",
  ],
  "Appareil locomoteur": ["Appareil locomoteur", "MPR Ortho Rhumato"],
  Rhumatologie: ["Rhumatologie"],
  "Médecine physique et réadaptation": ["MPR"],
  Urologie: ["Urologie"],
  Néphrologie: ["Néphrologie"],
  "Uro-néphrologie": ["Uro Néphrologie", "Uro-Néphrologie"],
  ORL: ["ORL", "Oto Rhino Laryngologie"],
  Ophtalmologie: ["Ophtalmologie", "Ophtalmo"],
  Dermatologie: ["Dermatologie"],
  Hématologie: ["Hématologie"],
  "Onco-hématologie": [
    "Hemato-oncologie", "Hémat-Onco(logie)", "Onco-Hématologie", "Oncologie et Hématologie",
  ],
  "Oncologie médicale": ["Oncologie médicale"],
  "Maladies systémiques": ["Maladies de système", "Maladies Systémiques"],
  "Urgences médico-chirurgicales": [
    "Urgences (UMC)", "UMC", "Urgences", "Médecine d'urgence", "Urgences Médico-Chirurgicales",
  ],
  Réanimation: ["Reanimation"],
  "Chirurgie générale": ["Chirurgie generale"],
  Radiologie: ["Radiologie"],
  Gériatrie: ["Gériatrie"],

  // Public health & legal
  Épidémiologie: ["Epidémiologie", "Épidemio", "Épidémiologie Et Économie De La Santé"],
  "Médecine légale": [
    "Médecine légale", "Médecine légale & Droit médical", "Médecine Légale Et Droits", "Médecine-légale",
  ],
  "Médecine du travail": [
    "Médecine de travail", "Sante au travail et environnement", "Santé au Travail et Environment",
    "Médecine-Travail",
  ],
  "Sciences sociales et humaines": ["SSH"],
};

/** Specialties examined in the Sciences fondamentales paper. */
const FUNDAMENTAL_SPECIALTIES = new Set<string>([
  Y2_CARDIO, Y2_DIGESTIF, Y2_URINAIRE, Y2_ENDO, Y2_NEURO,
  Y3_CARDIO, Y3_NEURO, Y3_ENDO, Y3_DIGESTIF,
  "Anatomie", "Physiologie", "Biochimie", "Histologie", "Embryologie", "Cytologie", "Biophysique",
  "Biostatistique", "Chimie", "Génétique", "Immunologie", "Microbiologie", "Parasitologie-mycologie",
  "Anatomie et cytologie pathologiques", "Hémobiologie", "Pharmacologie",
]);

const SPECIALTY_BY_KEY: Map<string, string> = (() => {
  const map = new Map<string, string>();
  for (const [canonical, aliases] of Object.entries(SPECIALTY_ALIASES)) {
    map.set(labelKey(canonical), canonical);
    for (const alias of aliases) map.set(labelKey(alias), canonical);
  }
  return map;
})();

export const CANONICAL_SPECIALTIES: readonly string[] = Object.keys(SPECIALTY_ALIASES);

/** Canonical specialty for a raw hb-db category, or null when unmapped. */
export function canonicalSpecialty(raw: string): string | null {
  return SPECIALTY_BY_KEY.get(labelKey(raw)) ?? null;
}

export function isFundamentalSpecialty(specialty: string): boolean {
  return FUNDAMENTAL_SPECIALTIES.has(specialty);
}

// -- Épreuve + sitting -------------------------------------------------------

/**
 * Canonical épreuve for a raw hb-db `period`. Faculties label the same three
 * papers differently ('Biologie' = Sciences fondamentales, 'Clinique' /
 * 'Médicale' / 'Chirurgie' = Médico-chirurgicale). Session words (Décembre,
 * Février, Rattrapage, Examen blanc, P1-P6, EMD) carry no paper, so the paper
 * is inferred: a grouped clinical case → Dossiers cliniques, a preclinical
 * specialty → Sciences fondamentales, anything else → Médico-chirurgicale.
 */
export function canonicalEpreuve(rawPeriod: string, specialty: string, isClinicalCase: boolean): Epreuve {
  const key = labelKey(rawPeriod);
  if (key.includes("dossier")) return "Dossiers cliniques";
  if (key.includes("fondamental") || key.startsWith("biologie")) return "Sciences fondamentales";
  if (key.includes("medico") || key.startsWith("clinique") || key === "medicale" || key === "chirurgie") {
    return "Médico-chirurgicale";
  }
  if (isClinicalCase) return "Dossiers cliniques";
  return isFundamentalSpecialty(specialty) ? "Sciences fondamentales" : "Médico-chirurgicale";
}

/** Session qualifier carried by some raw periods (null = the main sitting). */
export function sittingQualifier(rawPeriod: string): string | null {
  const key = labelKey(rawPeriod);
  if (key.startsWith("decembre")) return "Décembre";
  if (key.startsWith("fevrier")) return "Février";
  if (key === "rattrapage") return "Rattrapage";
  if (key === "examen blanc") return "Examen blanc";
  const paper = /^(emd|p)\s?(\d)?$/.exec(key);
  if (paper) return `${paper[1].toUpperCase()}${paper[2] ?? ""}`;
  return null;
}

export function sittingLabelFor(examYear: number, rawPeriod: string): string {
  const qualifier = sittingQualifier(rawPeriod);
  return qualifier ? `Résidanat ${examYear} — ${qualifier}` : `Résidanat ${examYear}`;
}
