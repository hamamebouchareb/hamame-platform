import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  canonicalEpreuve,
  canonicalSpecialty,
  facultyByCode,
  RESIDANAT_FACULTIES,
  sittingLabelFor,
} from "./residanat-taxonomy";

describe("canonicalSpecialty", () => {
  it("merges spelling variants of one specialty", () => {
    for (const raw of [
      "Gynécologie et obstétrique",
      "Gynécologie et Obstétrique",
      "Gynecologie obstétrique",
      "Gynécologie Obstétrique",
      "Gynecologie",
    ]) {
      assert.equal(canonicalSpecialty(raw), "Gynécologie-obstétrique", raw);
    }
    assert.equal(canonicalSpecialty("ORL "), "ORL");
    assert.equal(canonicalSpecialty("Orl"), "ORL");
    assert.equal(canonicalSpecialty("Médecine De Travail"), "Médecine du travail");
  });

  it("maps every faculty's integrated-unit code to the same organ system", () => {
    for (const raw of [
      "UEI 4 (2ème année)",
      "Unité 4 endo (2 ème)",
      "U4_Endocrinologie(2ème)",
      "U4: Le Système Endocrinien Et L'Appareil Reproductrice",
      "Unité 4 (2 ème)",
    ]) {
      assert.equal(canonicalSpecialty(raw), "Système endocrinien et reproduction (2e année)", raw);
    }
    assert.equal(canonicalSpecialty("UEI 04 : Appareil digestif et organes hématopoïtiques 3EME "), "Digestif et hématopoïèse (3e année)");
    assert.equal(canonicalSpecialty("L’appareil Urinaire"), "Appareil urinaire (2e année)");
  });

  it("returns null for an unknown label", () => {
    assert.equal(canonicalSpecialty("Astrophysique"), null);
  });
});

describe("canonicalEpreuve", () => {
  it("maps faculty paper names onto the three official papers", () => {
    assert.equal(canonicalEpreuve("Biologie 2013", "Cardiologie", false), "Sciences fondamentales");
    assert.equal(canonicalEpreuve("Clinique", "Anatomie", false), "Médico-chirurgicale");
    assert.equal(canonicalEpreuve("Chirurgie", "Urologie", false), "Médico-chirurgicale");
    assert.equal(canonicalEpreuve("Décembre Dossiers et cas cliniques", "Pédiatrie", false), "Dossiers cliniques");
  });

  it("infers the paper when the raw period carries none", () => {
    assert.equal(canonicalEpreuve("", "Physiologie", false), "Sciences fondamentales");
    assert.equal(canonicalEpreuve("Février", "Cardiologie", false), "Médico-chirurgicale");
    assert.equal(canonicalEpreuve("", "Cardiologie", true), "Dossiers cliniques");
  });
});

describe("sittingLabelFor", () => {
  it("adds the session qualifier only when the raw period has one", () => {
    assert.equal(sittingLabelFor(2020, "Clinique"), "Résidanat 2020");
    assert.equal(sittingLabelFor(2019, "Décembre Medico-chirurgicale"), "Résidanat 2019 — Décembre");
    assert.equal(sittingLabelFor(2021, "P3"), "Résidanat 2021 — P3");
  });
});

describe("RESIDANAT_FACULTIES", () => {
  it("lists the ten hb-db faculties with unique codes and slugs", () => {
    assert.equal(RESIDANAT_FACULTIES.length, 10);
    assert.equal(new Set(RESIDANAT_FACULTIES.map((f) => f.code)).size, 10);
    assert.equal(new Set(RESIDANAT_FACULTIES.map((f) => f.slug)).size, 10);
    assert.equal(facultyByCode("tiz")?.slug, "fac-tizi-ouzou");
  });
});
