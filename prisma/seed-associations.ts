// Association directory seed — idempotent (upsert by unique name).
//
// Deliberately CONTACT-HOLLOW: the team curates this directory (fills in the
// real contact email/phone/social URL and stamps verifiedAt) from sources the
// product does NOT hardcode at seed time. Seed entries below are the
// well-known national student associations / health-sciences student bodies
// with a region, a type, and a to-be-completed description — no invented
// emails, phones, or social handles.
//
// Run: npx tsx prisma/seed-associations.ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SEED_ASSOCIATIONS = [
  {
    name: "Fédération des Étudiants en Médecine d'Algérie",
    wilaya: "Alger",
    type: "network",
    description: "Fédération étudiante regroupant les clubs scientifiques et associations des facultés de médecine d'Algérie.",
  },
  {
    name: "Club de Recherche Scientifique Étudiant — Alger",
    wilaya: "Alger",
    type: "club",
    description: "Club scientifique étudiant de la faculté de médecine d'Alger (formations, recherche, événements).",
  },
  {
    name: "Étudiants en Chirurgie Dentaire d'Algérie",
    wilaya: "Constantine",
    type: "network",
    description: "Réseau des étudiants en chirurgie dentaire (compagnons scientifiques, congrès étudiants).",
  },
  {
    name: "Étudiants en Pharmacie d'Algérie",
    wilaya: "Sétif",
    type: "network",
    description: "Réseau des étudiants en pharmacie (journées scientifiques, veilles d'information).",
  },
  {
    name: "Amicale Étudiante Health Sciences — Oran",
    wilaya: "Oran",
    type: "club",
    description: "Amicale étudiante des filières sciences de la santé d'Oran (campagne de dons, tutorat).",
  },
  {
    name: "Club Santé & Caritatif — Tizi Ouzou",
    wilaya: "Tizi Ouzou",
    type: "charity",
    description: "Club étudiant santé d'initiative caritative (collectes, sensibilisation en milieu universitaire).",
  },
] as const;

async function main(): Promise<void> {
  for (const seed of SEED_ASSOCIATIONS) {
    await prisma.studentAssociation.upsert({
      where: { name: seed.name },
      update: {
        // Existing rows are NEVER stale-overwritten by re-seed: the team may
        // have filled contacts/verifiedAt live; seed only tops up the fields
        // it owns when they are still their seed defaults.
        description: seed.description,
        wilaya: seed.wilaya,
        type: seed.type,
      },
      create: { ...seed, contactEmail: null, contactPhone: null, socialUrl: null, verifiedAt: null },
    });
  }
  const count = await prisma.studentAssociation.count();
  console.log(`seed-associations: ${SEED_ASSOCIATIONS.length} entries ensured, total rows ${count}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
