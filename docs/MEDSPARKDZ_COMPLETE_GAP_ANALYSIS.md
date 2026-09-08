# MedSparkDZ → Hamame Complete Gap Analysis

**Date:** 3 September 2026
**Auditor:** automated browser exploration (Playwright-core + system Chrome, authenticated as test account) vs Hamame repo `C:\dev\hamame1`
**Live product:** `https://www.medspark.online` (MedSparkDZ)
**Credentials:** test account supplied by user at runtime via env vars only — **not stored in this repo** (scripts live in `%TEMP%\opencode`, outside the project).

---

## 1. Executive Summary

MedSparkDZ live was crawled route-by-route with a real authenticated browser session: **42 URL probes, 16 live routes confirmed (HTTP 200)**, every wizard step, modal, tab, empty state and the full QCM answer-verify-comment loop exercised, with screenshots + DOM dumps as evidence.

Headline result: **Hamame's backend is broader than MedSparkDZ live** (admin, moderation, flashcards CRUD, plans/subscriptions, export, push, reviews/SM-2 API all exist in Hamame with no live MedSparkDZ equivalent observed). **MedSparkDZ's lead is concentrated in QCM-domain depth**: a 3-step session builder with per-module/per-course question counts, multi-course selection, source/period filters and a live question counter; a past-exam picker; a "Cours Hypertombables" frequency ranking; per-option **community answer percentages** after verification; a comment toggle; session history grouped by year/unit with per-course progress and one-click resume; a monthly points leaderboard with published scoring rules; a notes library with tags/favorites/search; and a folder-browsing Spark Drive with in-browser viewing.

- **Routes discovered (live, HTTP 200): 16** (11 static + `/qcm/session/:id` + `/` + `/login` + post-login redirects; 26 probes 404 to a shared NotFound page).
- **Meaningful gaps found: 37** (9 MISSING, 19 PARTIAL, 5 DIFFERENT, 4 UNCLEAR; 0 intentional exclusions misreported).
- **CRITICAL: 3 — HIGH: 8 — MEDIUM: 14 — LOW: 8** (UNCLEAR items unranked).
- The 3 biggest gaps: **(1)** session-builder depth (counts, multi-course, source/period, live counter, exam picker); **(2)** community answer percentages + "voir le commentaire" verify loop in the QCM player; **(3)** session-history/resume UX + hypertombables/exam-simulation ecosystem around the QCM bank.

Intentional V1 exclusions (Study With Me, automated payment, AI chatbot/hints/note-maker/podcasts, spaced repetition as a *requirement*) are marked **N/A** throughout and never ranked. "Bientôt disponible" / disabled / 404 functionality (shared sessions, Studio tabs, pricing page, community/collaborations) is likewise N/A.

---

## 2. Methodology

1. **Authenticated Playwright crawl (mandatory browser exploration).** `playwright-core` driving system Chrome (headless, 1366×900 + 390×844 mobile), FR locale. Login performed by filling `#email` / `#password` and clicking `Se connecter`; success verified by `Connexion réussie / Bienvenue !` toast and redirect to `/dashboard`. Session persisted via `storageState` (cookies + localStorage) for all follow-up scripts. No `webfetch`, no raw HTTP-only conclusions, no PDF-only claims — every finding below comes from rendered pages.
2. **Route inventory.** 42 probes: homepage, auth routes, all nav entries, every `/`-level guess from the audit PDFs (`/revision`, `/pricing`, `/resources`, `/lessons`, `/leaderboard`, `/friends`, `/badges`, `/subscription`, `/flashcards`, `/community`, `/collaborations`, `/study-with-me`, …) plus newly discovered links (`/qcm/hypertombables`, `/simulations/history`, `/qcm/session/:id`).
3. **Deep interaction.** QCM wizard all 3 steps; module select; course select; type/source/period/order toggles; exam picker modal; points-rules modal; notes-library modal; unit drill-down → `Continuer` → full player (select → `Vérifier` → percentages → `voir le commentaire` → `Suivant` Q2); recharge-points modal; add-friends modal; suivi-create modal; drive folder drill-down; activate with fake code (error state); theme toggle; mobile viewports.
4. **Hamame inspection.** Full backend route table (`src/routes/` + `index.ts` + `app.ts`), full frontend route table (`web/src/app/`), key components (`SessionBuilder`, session player, results, dashboard, notes, resources, settings, friends), `tokens.css` design system, plus the six context documents listed in the brief. Documentation claims were checked against implementation; where they disagree it is called out in §21.
5. **Classification** per item: MATCH / PARTIAL / MISSING / DIFFERENT / N/A / UNCLEAR, each with MedSparkDZ behavior, Hamame behavior, gap, priority, evidence.

Evidence conventions: **LIVE** = observed in the authenticated browser (URL + visible text + screenshot/DOM file in `%TEMP%\opencode\medspark-crawl\`); **HAMAME** = repo file + line; **DOC** = audit PDF/PRD claim.

---

## 3. Complete MedSparkDZ Route Inventory

Conventions — *Public/Auth*: observed with a logged-in session; logged-out probing was limited to `/login` + `/` (which redirects to `/dashboard` when authed). *Navigation entry*: where a real link/button leads to it.

| # | Route | Purpose | Public/Auth | Page title | Main functionality | Available actions | Navigation entry | Important UI | Important UX | States observed | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `/login` | Sign in | Public | MedSpark | Email + password + remember-me + forgot + Google + signup link | Fill, submit, Google, forgot, signup | Direct; logged-out landing | Dark card, `votre@email.com` placeholder, eye toggle, `Se connecter` gradient CTA | Toast `Connexion réussie / Bienvenue !` then `Redirection...` interstitial | Ready, prefill, success toast, redirect interstitial, (error state not triggered) | LIVE screenshots `medspark-login.png`, `medspark-prefill.png`, `medspark-after-login.png` |
| 2 | `/` | Root | Auth → `/dashboard`; logged-out presumably → `/login` (not probed logged-out) | MedSpark | Redirect hub | — | — | — | Instant client redirect when authed | Redirect | UNCLEAR logged-out behavior |
| 3 | `/dashboard` | Home hub with 5 in-page spaces | Auth | MedSpark | Profile header, premium card, friends, QCM/Studio/Ressources/Suivi/Révision panels, IA credits, progression, weekly activity, recent activity | Tab-switch 5 spaces, Ouvrir drive, Recharger points, Ajouter amis, year pickers, theme | Logo, post-login landing | Panels swap **without URL change**; bottom tab bar on mobile | Countdown `07:57:xx` ticking; skeletons on mobile load | Loaded, empty (recent, revisions), warning (low points) | Core page; see §5 |
| 4 | `/qcm` | QCM bank home | Auth | MedSpark | Quick-create cards, notes library, shared sessions placeholder, Mes Sessions history, simulations, leaderboard, Mes Statistiques | Nouvelle Session wizard, exam picker, ECOS/Résidanat cards, Bibliothèque modal, drill-down, Continuer, Calcul des points | Dashboard QCM panel CTA | Dense single scroll: create → library → shared → history → simulations → leaderboard → stats | `Chargement des simulations...` → `Aucune simulation planifiée` | Loaded, loading, empty (simulations) | Richest page; see §7–8 |
| 5 | `/qcm/hypertombables` | High-yield course ranking | Auth | MedSpark | 3080 questions / 64 modules frequency ranking with % | Filter by year, by type, by module; Retour | `Cours Hypertombables` button on `/qcm` | Ranked rows `HGE 7.2 %`, `ACP 5.6 %`… | Counts in header | Loaded | DISCOVERY — not in PDF route lists; no Hamame equivalent |
| 6 | `/qcm/session/:uuid` | QCM player | Auth | (empty — client-rendered) | Answer 5-question session, verify, comment, navigate | Select option, Vérifier → voir le commentaire, Précédent/Suivant, QST jump, EN\|FR, theme, sound, fullscreen, report, AI/OUTILS tools, Quitter, chat bubble | `Continuer` from session drill-down | Left QST rail, progress %, per-option strike-through, community % after verify | Count-up timer `00:25→00:40`; verify morphs CTA | Answering, verified, Q2 | See §7 |
| 7 | `/studio` | Study notebooks (gated) | Auth | MedSpark | `0/30` cahier quota, reservation CTA | Tabs (3 disabled), Réserver ma place, Créer (disabled) | Dashboard Studio panel `Ouvrir le Studio` | `Activez votre accès Studio` gate card; `Aucun Cahier` empty state | Disabled buttons with reason tooltips/titles | Empty, gated | AI/notebook internals N/A (intentional exclusion); gate UX itself is comparable |
| 8 | `/suivi-cours` | Manual course tracking | Auth | MedSpark | Per-matière progress follows + Révisions tab | Nouveau Suivi / Créer un suivi → modal (Matière * select) | Dashboard Suivi panel | `Suivez votre progression… avec révision intelligente` | Modal validation (required matière) | Empty, modal | DIFFERENT model from Hamame auto-progress |
| 9 | `/profile` | Public-ish profile + stats | Auth | MedSpark | Identity, streak/score/précision hero, premium, friends, QCM stats, sessions, weekly activity | Ajouter → Rechercher des amis modal (search input) | Avatar/header | `6 / 15` correct/incorrect split; `0 / 1` longest session; `#250` rank | Counts animate in | Loaded | See §10 |
| 10 | `/settings` | Account settings | Auth | MedSpark | Personal info (email, nom, faculté 15 options, année), password change, danger zone | Enregistrer, Changer le mot de passe, Supprimer définitivement | Retour; avatar menu | `Faculté actuelle / Année actuelle` echo; 6-char rule hint; full data-loss warning list | Inline echo of current values | Loaded | See §10 |
| 11 | `/activate` | Activation-code redeem | Auth | MedSpark | Single code input `MEDSPARK-XXXX-XXXXXXXX` | Fill, Activer, Retour | Year-card `Activer` buttons (per helper text) | `Aucune année spécifiée` hint when opened directly | Error toast/box `Erreur d'activation / Code invalide` (fake code) | Empty, error | Success state not exercised (would consume a code) |
| 12 | `/spark-drive` | Curated Drive browser | Auth | MedSpark | 8 folder cards (Drives officiels 2025-2026, The Freelancer, GMA biologie/clinique, Nobles, Dr Mazo, Notes de Qcm, Abdessalem) | Click folder → subfolders (`1ère–6ère année`); Retour | Dashboard Ressources panel `Ouvrir` | Emoji 📁/📂 cards; `sans téléchargement` viewer promise | Breadcrumb-less drill (Back only) | Loaded, drilled | See §11 |
| 13 | `/notifications` | Notification center | Auth | MedSpark | Retained history list | Retour only | Bell icon | `Aucune notification` empty state | — | Empty | MATCH with Hamame |
| 14 | `/notes` | Personal notes | Auth | MedSpark | Search + tag filters + favorites | Search input, Filtres (6 tags), Favoris toggle | QCM Bibliothèque (`Mes Notes` tab) | Tags: 🔴 Difficile 🟢 Facile ⚡ Important 📚 À réviser ✅ Compris ⚠️ Piège | Filters appear inline (no modal) | Empty | See §11 |
| 15 | `/forgot-password` | Password reset request | Public | MedSpark | Email → reset link | Fill, Envoyer le lien, Retour à la connexion | Login `Mot de passe oublié?` | Single-field card | — | Ready (not submitted — avoids side effects) | Reset-confirm route not discovered (email-gated) → UNCLEAR |
| 16 | `/simulations/history` | Exam-simulation history | Auth | MedSpark | Year picker `1ère–6ème + R (Résidanat)` | Pick year; Retour | `Simulations passées` link on `/qcm` (href `/simulations/history`) | `Choisir une année / Sélectionnez l'année` | Year-gated list (years not clicked) | Picker | Per-year results UNCLEAR (no simulations on account) |

**404 (shared NotFound page, ~7.6 KB screenshots, no app content):** `/register` (!), `/pricing`, `/revision`, `/resources`, `/lessons`, `/leaderboard`, `/friends`, `/badges`, `/suivi`, `/subscription`, `/forgot-password` variants under other paths, `/flashcards`, `/onboarding`, `/welcome`, `/community`, `/collaborations`, `/study-with-me`, `/courses`, `/modules`, `/exams`, `/history`, `/stats`, `/support`, `/help`, `/contact`, `/courses-list`, `/sujets`, `/examens`, `/drive`, `/podcasts`, `/chat`, `/ai`, `/ar/login`, `/newForgotPassword`. Notes: (a) `/register` 404 despite login's `Créer un compte` link — signup entry point is UNCLEAR (possibly Google-only or a modal; not pursued to avoid account creation); (b) `/revision` 404 while dashboard has a Révision *panel* — Révision is in-dashboard state, not a route; (c) no top-level `/leaderboard`, `/friends`, `/badges`, `/resources` — those live as *sections* inside `/qcm`, `/dashboard`, `/profile`, `/spark-drive`.

**Discrepancy vs DOC:** the audit PDFs list `/revision`, `/pricing`, `/resources`, `/lessons`, `/dashboard`, `/profile`, `/settings`, `/suivi-cours`, `/spark-drive` as routes. LIVE confirms only `/dashboard`, `/profile`, `/settings`, `/suivi-cours`, `/spark-drive` (+ new `/qcm/hypertombables`, `/simulations/history`, `/notes`, `/notifications`, `/activate`, `/forgot-password`). `/revision`, `/pricing`, `/resources`, `/lessons` are **404 live** — docs describe intent/panels, not routes (§21).

---

## 4. Complete Feature Comparison

Status key: **MATCH** = Hamame has it at parity; **PARTIAL** = exists but concretely weaker; **MISSING** = absent; **DIFFERENT** = both have it, models diverge; **N/A** = intentional exclusion or Bientôt/404; **UNCLEAR** = could not verify without side effects or data.

### 4.1 Authentication

| Feature | MedSparkDZ (LIVE) | Hamame | Status | Gap / Priority / Evidence |
|---|---|---|---|---|
| Email+password login | `/login`, toast + redirect | `POST /api/auth/login`, `web/src/app/login/page.tsx` → `/dashboard` | MATCH | — |
| Remember-me | `Rester connecté` checkbox | 7-day JWT always; no toggle | DIFFERENT (LOW) | Cosmetic; Hamame could add `remember` → session vs persistent token. LIVE prefill shot; HAMAME `AuthContext.tsx`, `auth.ts` TTL 7d |
| Google OAuth | `Continue avec Google` button | None (backend + UI) | MISSING (MEDIUM) | Full OAuth (backend provider + button + link flow) needed if parity wanted. LIVE login shot |
| Signup entry | `Créer un compte` link; `/register` 404 | `/register` page + `POST /api/auth/register` | UNCLEAR | Do not know where MedSpark signup lives; Hamame already has MORE here. LIVE 404 shot `route--register.png` |
| Forgot password | Email form `/forgot-password` | `POST forgot/reset` backend + request page; no reset-confirm UI | PARTIAL (MEDIUM) | Hamame missing reset-confirm page (`/reset-password?token=`). HAMAME `app/forgot-password/page.tsx` |
| Change password | Settings section, 6-char rule | `POST /api/auth/change-password` backend; no settings UI section | PARTIAL (MEDIUM) | Add settings section calling existing endpoint. HAMAME `settings/page.tsx` |
| Delete account | Danger zone, explicit data-loss list | Soft-delete backend + settings confirm (`ConfirmDialog`) | MATCH (Hamame soft, MedSpark claims hard — policy difference, both valid) | HAMAME `users.routes.ts` DELETE |
| Session/token display | None observed | `hamame_auth` localStorage, role refresh | MATCH | — |

### 4.2 Onboarding
No first-run tour, faculty picker, or placement flow observed live in MedSparkDZ (settings hold faculté/année). Hamame presets faculty/year in builder from profile. **MATCH (neither has onboarding).**

### 4.3 Dashboard
| Feature | MedSparkDZ | Hamame | Status |
|---|---|---|---|
| Profile hero w/ streak/score/précision | Yes (`2 / 60 / 41 %`) | `ProfileHero` | MATCH |
| Premium/access card | `Premium Actif / Résidanat / Accès Illimité` | `PremiumCard` + `ActivationCodeCard` | MATCH (Hamame has MORE: redeem inline) |
| Friends widget + add modal | `Mes Amis` + `Rechercher des amis` modal | `FriendsPanel` (list + requests) | PARTIAL (MEDIUM) — Hamame panel exists on dashboard; MedSpark's *search-to-add* modal has no Hamame UI equivalent (backend `POST /friends` exists). Evidence: LIVE `dash-action-Ajouter.json`; HAMAME `FriendsPanel.tsx` |
| 5-space in-dashboard tabs | QCM/Studio/Ressources/Suivi/Révision swap panels, URL unchanged; bottom tab bar on mobile | Separate routes (`/qcm`, `/suivi`, `/revision`, `/resources`, …) + header nav | DIFFERENT (LOW) — navigation philosophy, not a gap. Hamame's model is arguably more robust (deep-linkable). Not ranked. |
| IA credits + recharge codes + countdown | `Total 10 / Bonus 0`, `Recharger` → code modal, `Renouvellement dans 07:57:xx`, per-tool quotas (Explications 5 / Chat 5), low-balance warning | `GET /ai/credits` display on dashboard; activation-code redeem; no recharge-code flow, no countdown, no per-tool split | PARTIAL (LOW — AI excluded from V1, so the *AI quota* part is N/A; the **recharge-code + countdown pattern** is reusable for any quota and worth copying) |
| Weekly activity + recent | Per-day Lun–Dim counts, totals, `Aucun cours étudié récemment` | `WeeklyActivity`, readiness, recent lists | MATCH |
| Visual progression / years active | `Cours 0/0`, `7 années actives`, `Progression Globale 0 %` | `MetricCard/ProgressBar`, readiness | MATCH |

### 4.4 QCM bank home (`/qcm`)
| Feature | MedSparkDZ | Hamame (`/qcm` + `/qcm/builder`) | Status / Priority |
|---|---|---|---|
| Practice/Exam entry cards | `Nouvelle Session` / `Nouvel examen` / ECOS / Résidanat cards | Decision cards (practice vs exam, `100 % gratuit`) | MATCH |
| 3-step builder wizard | Année → Module (counts) → Cours multi-select + config + live counter + Démarrer | Single-page cascade selects (faculté→année→module→unité), checkboxes types, count select, inline exam/stats switches | PARTIAL (**CRITICAL**, §8) |
| Per-module question counts | `Anatomie 417`, `Physiologie 424`… per unit | None (no counts anywhere in builder) | MISSING (**HIGH**) |
| Per-course multi-select + counts | 13+ courses with counts (`Aorte thoracique 38`…); `0 questions` live counter | Single unit select; no course level at all | MISSING (**CRITICAL**) |
| Type filter QCM/QCS/QROC/Cas Clinique | Toggle buttons step 3 | Checkboxes (QCM/QCS/QROC/CLINICAL_CASE) | MATCH |
| Source filter Externat/Résidanat | Toggle buttons step 3 | Backend `source` filter exists (`question-filters.ts`) but **no UI** | PARTIAL (**HIGH** — wire existing backend param to builder) |
| Period filter | `Période →` control step 3 | None (backend has date? verify) | MISSING (**MEDIUM**; needs backend date field check first) |
| Past-exam picker | `Choisir un Examen` modal: Mode Examen notice + papers 2018–2025 with counts (150/150/141/120/115/114/295) | None | MISSING (**HIGH**) |
| ECOS entry | Card (no navigation observed) | None | UNCLEAR (LOW; could be same wizard with a type preset) |
| Notes library | `Bibliothèque de notes QCM`: 945 total, per-year counts, Notes IA / Mes Notes tabs, PDF export claim | Notes page (paginate + create) | PARTIAL (**HIGH**, §11) |
| Shared sessions | `Bientôt disponible` placeholder | Nothing (correctly so) | N/A |
| Session history grouped by year/unit | RÉSIDANAT + year sections, per-course rows (`Répondues 0/5`, `Précision 0 %`, `Progression 0/5`), `Continuer` → player | Dashboard `ResumeBar` (single localStorage marker) + results pages; no history list UI | MISSING (**HIGH** — backend has all data: sessions, answers, results) |
| Exam simulations + history | `Simulations passées`, empty state, `/simulations/history` year picker | Timed exam mode only; no scheduled-simulation concept | PARTIAL (**MEDIUM** — scheduled simulations are a real feature class Hamame lacks; history picker maps to session history) |
| Leaderboard (monthly, points rules) | Month label + `27 jours restants`, rows (sessions, précision, points), `Calcul des points` → rules modal (+10 first-correct / +4 after-error / anti-farming) | Snapshots backend + no UI page | MISSING UI (**HIGH**; backend exists — `leaderboard.routes.ts`, snapshot jobs) |
| Mes Statistiques | Sessions 3 / Questions 176 / Correctes 6 / Précision 38 % | `/progress/qcm-stats` + `/suivi` page (richer) | MATCH (Hamame has MORE) |

### 4.5 Question answering / player
| Feature | MedSparkDZ player | Hamame player | Status / Priority |
|---|---|---|---|
| QST rail + progress | Numbered 1–5 rail, `Question 1/5`, `20 %` bar | `currentIndex` Prev/Next (buttons) | PARTIAL (**MEDIUM** — add jump-to-question rail + % bar; state already exists) |
| Course + source chips | `Anatomie des fosses nasales et sinus`, `2022 EMD` | `formatSource()` (Examen officiel/Hamame/IA); lesson/course context | PARTIAL (**MEDIUM** — show specific sitting/year + course chip per question) |
| Grouped-QCS (a–e + A–E combos) | Native (Q1 groupé, Q2 standard) | QCM multi / QCS single / free-text types | MATCH (content-level) |
| Verify → percentages | After `Vérifier`: per-option community % (25/25/33/8/8), CTA → `voir le commentaire` | Immediate isCorrect + explanation (practice) | MISSING (**CRITICAL** — community stats need answer-aggregate endpoint + UI) |
| Comment toggle | `voir le commentaire` shows/hides explanation | Explanation shown inline after submit | PARTIAL (**LOW** — collapsible explanation is a small UX win) |
| Strike-through (eye-off per option) | Yes, per option | None observed | MISSING (**LOW** — elimination interaction) |
| EN\|FR toggle | In-player language switch | French-only; `uiLanguage` pref 501 | PARTIAL (**MEDIUM** — needs product decision; pref endpoint is THE stub) |
| Timer | Count-up `00:25` + pause button (this session); exam sessions presumably count down | Count-down for timed sessions + `StudyTimer` | DIFFERENT (LOW — verify MedSpark exam-mode direction; practice count-up vs Hamame no practice timer) |
| Report/flag, sound, fullscreen | Icons in header | `POST /questions/:id/report` backend, no UI; mark-for-review exists | PARTIAL (**MEDIUM** — wire report endpoint to flag icon) |
| AI + OUTILS rails, chat bubble | Right rails + bottom chat (AI-gated) | AI excluded; no tools rail | N/A (AI) + UNCLEAR (OUTILS contents — clicks not pursued; likely highlight/note/bookmark/stats) |
| Quitter | Button (confirm behavior not exercised) | `Quitter` + `ConfirmDialog` + resume marker | MATCH |
| Results screen | Not reached (session left unfinished deliberately) | Full results page (score, gated stats, weak-points, redo) | UNCLEAR (MedSpark side) — Hamame likely ahead here |

### 4.6 Session creation / configuration / management
Covered in §4.4 + §8. Management (rename/delete/retry) — MedSparkDZ shows `Continuer` only; no rename/delete observed → neither product has session management beyond resume; **MATCH (neither)**.

### 4.7 Progress / course tracking / statistics
MedSparkDZ `suivi-cours` = **manual** per-matière follows + Révisions tab; dashboard shows auto aggregates (streak/score/précision, weekly, progression globale). Hamame `/suivi` = **automatic** (`/progress/me`, `/readiness`, `/qcm-stats`, module %) — richer and maintenance-free. Status: **DIFFERENT with Hamame ahead on automation; PARTIAL the other way** — Hamame lacks the *manual follow list* metaphor some students want (LOW; could add "followed courses" as a view on existing data, no new tracking needed).

### 4.8 Profile — MATCH overall. Deltas: MedSpark shows `#250` rank + `6/15` split + `0/1` longest + weekly bars on profile (Hamame spreads these across `/suivi` + profile — fine); Hamame has subscription label + friends + readiness on profile (MORE). No action.

### 4.9 Settings — MATCH overall. Deltas: MedSpark faculté list (15) vs Hamame 58 wilayas + university + push + export (Hamame MORE). Remaining: reset-confirm page + change-password section (§4.1). The `PUT /users/me/preferences` 501 stub stays the one true stub — wire `uiLanguage/theme` to finally close the EN/FR story.

### 4.10 Resources / Studio / Spark Drive
| Feature | MedSparkDZ | Hamame | Status / Priority |
|---|---|---|---|
| Folder browsing | Drive → subfolders (`1ère–6ère année`), Back-only nav | Flat filtered list + detail | PARTIAL (**MEDIUM** — add hierarchy or breadcrumb grouping; backend `type/faculty/year` filters exist) |
| In-browser view | `sans téléchargement` viewer promise | Detail + download link | PARTIAL (**MEDIUM** — embed viewer for PDFs) |
| Curated drives | 8 named drives | `sourceLabel` field exists | MATCH (curation is content ops, not code) |
| Notes library w/ counts, tabs, tags, search, favorites | Yes (§4.4) | Paginated notes, no tags/search/favs UI | PARTIAL (**HIGH** — tags + search + favorites; needs `tags`/`isFavorite` columns) |
| Studio notebooks | Gated, quota `0/30`, reservation | Flashcards + notes (ungated, working) | DIFFERENT + N/A (AI parts). Reservation-gate UX only relevant if Hamame ever gates a feature. |

### 4.11 Search / filtering / sorting
MedSparkDZ: notes search + tag filters; hypertombables year/type/module filters; drive implicit hierarchy; QCM builder source/period/order; leaderboard month. Hamame: curriculum toolbar (search + sort on faculties/years/modules/units), builder cascade, resources faculty/type filters. **PARTIAL (HIGH)** — the reusable gap is *filter controls on data Hamame already returns*: question source, notes search/tags, resource hierarchy, leaderboard period.

### 4.12 Notifications — MATCH (both: center + `Aucune notification` empty state; Hamame adds push prefs + vapid plumbing = MORE).

### 4.13 User preferences / account — §4.1 + §4.9. Only stub in the whole product remains preferences (501).

### 4.14 Responsive — both stack to single column; MedSparkDZ switches dashboard spaces to a **bottom tab bar** on mobile (LIVE 390px shot) while Hamame keeps the header + hamburger drawer. DIFFERENT (LOW); verify Hamame drawer usability on small screens as a hardening task.

### 4.15 Error / loading / empty / success states
| State | MedSparkDZ | Hamame | Status |
|---|---|---|---|
| Loading | `Chargement des simulations...`, mobile skeletons | `LoadingSkeleton` + `.hamame-skeleton` everywhere | MATCH |
| Empty | Aucun suivi / Aucune note / Aucun Cahier / Aucune simulation / Aucune notification / Aucun cours récent (all with CTA except notifications) | Actionable `EmptyState` on all list pages | MATCH |
| Error | `Code invalide` activation box; 404 NotFound page | Inline error + Réessayer (`useApiResource`), `ApiError` toasts, 404 handling | MATCH |
| Success | `Connexion réussie` toast | `ToastProvider` success/error/info | MATCH |
| Disabled/gated | Studio tabs + Nouveau Cahier with reason titles; `Bientôt` pills | Disabled states on builder controls | MATCH |

---

## 5. Page-by-Page Comparison

### 5.1 `/dashboard`
- **MedSparkDZ layout:** header (logo, theme, avatar) → profile hero → premium card → friends → 5 space tabs → active panel → IA credits → visual progression → weekly → recent → years-active footer → footer links. Mobile: same stacked + bottom tab bar; skeletons while loading (LIVE shots).
- **Hamame equivalent:** `web/src/app/dashboard/page.tsx` (ProfileHero, MetricCard, ResumeBar, WeeklyActivity, PremiumCard, ActivationCodeCard, FriendsPanel).
- **Missing in Hamame:** recharge-code modal + renewal countdown + per-tool quotas (LOW, partly N/A); in-panel Révision-due summary (see §5.6); years-active strip (LOW — trivial from existing data).
- **Hamame ahead:** inline activation redeem, readiness score, AI-credit display wired to real backend.

### 5.2 `/qcm`
Layout: header + `Cours Hypertombables` → 4 quick cards → notes library → shared (Bientôt) → Mes Sessions → simulations → leaderboard → Mes Statistiques. Every block present with real counts. Hamame `/qcm` (decision cards) + `/qcm/builder` cover only the first block. **Missing: everything in §4.4.** This page is the single densest gap source — see §8 for the builder and §22 for sequencing.

### 5.3 `/qcm/session/:id` (player)
Layout: slim header (logo, timer pill + pause, EN|FR, icons, theme, Quitter) → left QST rail → question card (type chip, course chip, source chip, statement, a–e, A–E combos) → Précédent / Vérifier / Suivant → right AI + OUTILS rails → chat bubble. Verified state adds community % + `voir le commentaire`. Hamame `app/sessions/[id]/page.tsx` + `QuestionCard` + `StudyTimer` + `ConfirmDialog`. **Missing: community %, comment toggle, strike-through, QST rail, EN|FR, report wiring** (§4.5).

### 5.4 `/suivi-cours` vs Hamame `/suivi`
Different products sharing a name: manual follows vs automatic analytics. Keep Hamame's engine; consider a lightweight "Suivis" (followed modules) view as a LOW add-on (§4.7). Révisions tab inside suivi-cours maps to Hamame `/revision` route (Hamame's separation is cleaner).

### 5.5 `/profile` — MATCH (§4.8). Only LOW polish: rank chip + correct/incorrect split placement.

### 5.6 Dashboard Révision panel (no route!)
`Révision / Mémorisation espacée / Révisions dues 0 / 0 Streak / 0 % Efficacité` — a spaced-repetition summary embedded in the dashboard. Hamame HAS the engine (`/api/reviews/*`, `/revision` player) but **no dashboard summary widget**. PARTIAL (**MEDIUM** — surface `GET /reviews/due` count + efficacy on the dashboard; backend ready).

### 5.7 `/settings` — MATCH (§4.9).

### 5.8 `/spark-drive` vs Hamame `/resources`
MedSpark: folder cards → year subfolders → (viewer). Hamame: filter list → detail → download. PARTIAL (MEDIUM): hierarchy/breadcrumbs + embedded viewer (§4.10).

### 5.9 `/notes` vs Hamame `/notes`
MedSpark: search + 6 tag filters + favorites + empty CTA. Hamame: paginated list + create + empty CTA. PARTIAL (HIGH): tags/search/favorites (§4.10).

### 5.10 `/studio` vs Hamame `/authoring` + flashcards/notes
Different purposes (student notebooks vs instructor pipeline). Student-notebook parity already exists via notes/flashcards. Only carry-over: quota/gate UX patterns if ever needed. N/A.

### 5.11 `/activate` vs Hamame `ActivationCodeCard` + `POST /activation-codes/redeem`
Same feature; MedSpark's year-context hint (`Aucune année spécifiée`) is a UX nicety worth copying when redeeming from a generic entry point (LOW).

### 5.12 `/notifications`, `/forgot-password`, 404 page — MATCH / noted (§3, §4.12).

### 5.13 `/qcm/hypertombables`, `/simulations/history` — no Hamame equivalent (HIGH / MEDIUM, §4.4).

---

## 6. Navigation Comparison

- **MedSparkDZ model:** 1 persistent header (logo → `/dashboard`, theme, avatar) + bell; dashboard-internal space tabs (URL never changes); footer social links; Back (`Retour`) buttons instead of breadcrumbs on sub-pages; dead-end cards for gated features. Mobile: bottom 5-tab bar. No sitemap page; no global search.
- **Hamame model:** `AppHeader` (sticky, `PRIMARY_NAV` = Tableau de bord/QCM/Bibliothèque/Suivi/Révision, mobile drawer, `UserMenu`) + `SECONDARY_NAV` (Notes/Abonnement/Ressources/Profil/Paramètres) + `Footer`. Every destination is a deep-linkable route.
- **Verdict: DIFFERENT, Hamame structurally ahead** (deep links, drawer, user menu). Two borrowable details: (a) `Retour` affordance on drill pages (LOW); (b) bottom tab bar on mobile as an alternative to the drawer — test both (LOW).

---

## 7. QCM Comparison (answering loop)

MedSparkDZ loop: pick session → `Continuer` → Q1 (course + sitting chips, grouped or standard) → select → `Vérifier` → **community % per option** → `voir le commentaire` (toggle) → `Suivant`/QST jump → … → (results screen unobserved). Timer counts up in practice; exam-mode direction unverified. EN|FR available throughout. Strike-through per option. Report/flag icon present.

Hamame loop: builder → `/sessions/[id]` → per-question `POST answers` (practice: instant isCorrect + explanation; exam: withheld) → Prev/Next + mark-for-review → `ConfirmDialog` submit → `/results` (score, gated stats, weak-points, redo). QROC/clinical ungraded by design (V2 AI).

**Gaps (all §4.5):** community percentages (CRITICAL), QST rail (MEDIUM), sitting/course chips (MEDIUM), report wiring (MEDIUM), comment toggle + strike-through (LOW), EN|FR decision (MEDIUM, product-level). **Hamame ahead:** real results screen with redo, mark-for-review, exam withholding discipline, AI-hint hook (excluded from V1 but plumbed).

---

## 8. Session Builder / Study Flow Comparison

**MedSparkDZ (3 wizard steps, LIVE):**
1. `Créer une Session — 1·2·3 — Choisissez une année` (6 year buttons).
2. `2 — Choisissez un module` + `Retour`: unit groups (`4 modules`) with per-module count buttons (`Anatomie 417`, `Physiologie 424`, `Histologie 286`, `Biophysique 145`…; standalone `Immunologie`, `Génétique`).
3. `3 —` course multi-select with counts (`Aorte thoracique 38`, `Cage thoracique 24`…); `Types de questions` QCM/QCS/QROC/Cas Clinique; `Source` Externat/Résidanat; `Période →`; `Ordre` Par année/Par cours/Aléatoire; `Mode Examen` + `Statistiques` toggles; live `N questions` counter; `Retour` / `Démarrer`.
Plus the parallel `Choisir un Examen` modal (past papers 2018–2025 with counts, exam-mode notice).

**Hamame (`SessionBuilder.tsx`, single form):** mode + stats switches (FR-16 ✓), faculté→année→module→unité cascade, type checkboxes, count select, result-sort select (FR-15 ✓), conditional time limit, auto name, start CTA with validation.

**Precise deltas:**
1. Multi-select courses with counts — MISSING (CRITICAL). Requires: `course`/`lesson` level question counts endpoint (or extend existing aggregates), multi-unit/course selection in `createSessionSchema` (backend currently single `moduleIds/unitIds`? verify — routes accept arrays; UI sends one), checkbox list UI, live counter.
2. Per-module counts in step 2 — MISSING (HIGH). Same endpoint, smaller UI.
3. Source toggle (Externat/Résidanat) — PARTIAL (HIGH). Backend `source` filter exists; add UI toggle + verify `source` values in DB (`official_exam` vs Externat/Résidanat mapping needs a decided taxonomy).
4. Period filter — MISSING (MEDIUM). Check whether questions carry usable dates (`createdAt` vs exam sitting year); sitting-year filter is more useful than creation date.
5. Past-exam picker — MISSING (HIGH). Needs exam-sitting entity or convention (source + year tags) + UI modal; content ops to tag papers 2018–2025.
6. Step-wise wizard vs single form — DIFFERENT (LOW). Hamame's form is fine; only adopt steps if user testing demands it. The *content* (counts, multi-select, counter) matters, not the steps.
7. Live question counter — MISSING (MEDIUM). `GET /questions/count?` with current filters (cheap, high perceived quality).

---

## 9. Tracking / Progress Comparison

| Capability | MedSparkDZ | Hamame | Status |
|---|---|---|---|
| Auto aggregates (streak/score/précision/weekly) | Dashboard + profile | Dashboard + `/suivi` + `/progress/*` | MATCH (Hamame richer: readiness, module %) |
| Session history with per-course progress + resume | Mes Sessions drill-down + `Continuer` | `ResumeBar` (one session) + results pages | MISSING UI (**HIGH**) — data exists |
| Manual course follows | `suivi-cours` + Révisions tab | — | DIFFERENT (LOW add-on candidate) |
| Spaced-repetition summary on dashboard | Dues/streak/efficacy panel | Engine + `/revision`, no widget | PARTIAL (**MEDIUM** — widget only) |
| Leaderboard | Monthly points + rules | Snapshots, no UI | MISSING UI (**HIGH**) |
| Hypertombables | Frequency ranking | — | MISSING (**HIGH**) |
| Simulations schedule/history | Empty-state + year picker | Timed exam mode | PARTIAL (**MEDIUM**) |

---

## 10. Profile & Settings Comparison

**Profile:** substantive MATCH. MedSpark extras: rank chip, correct/incorrect split, longest session, weekly bars colocated. Hamame extras: subscription label, friends, readiness. Net: polish-only (LOW).

**Settings:** substantive MATCH. MedSpark: email/nom/faculté(15)/année/password/danger-zone with explicit consequences. Hamame: profile fields + wilaya(58)/university + push prefs + export + soft-delete + delete confirm. Hamame ahead on breadth. Remaining: change-password UI section + reset-confirm page (MEDIUM, §4.1); close the `preferences` 501 stub to unlock language/theme (MEDIUM).

---

## 11. Studio / Resources / Spark Drive Comparison

- **Spark Drive vs `/resources`:** PARTIAL (MEDIUM) ×2 — folder hierarchy/breadcrumbs; embedded viewer. Curation parity is ops, not code.
- **Notes library vs `/notes`:** PARTIAL (HIGH) — tags (6-tag taxonomy provided free: Difficile/Facile/Important/À réviser/Compris/Piège), favorites, search, per-year counts, IA/Mine tabs (IA tab N/A).
- **Studio vs authoring/flashcards:** N/A + DIFFERENT (§4.10). Note the gate UX (reservation, quota `0/30`, reason-titled disabled buttons) as a reusable pattern if Hamame ever gates.
- **Bibliothèque modal (945 notes, per-year archive counts)** is the strongest "library" psychological asset observed; Hamame's notes count display (`0 notes`) is the seed of the same pattern.

---

## 12. Authentication & Account Flows

| Flow | MedSparkDZ | Hamame | Gap |
|---|---|---|---|
| Signup | Link exists; target UNCLEAR (`/register` 404) | Full page + backend | UNCLEAR — nothing to copy until located |
| Login | Toast + `Redirection...` interstitial | Direct push `/dashboard` | MATCH (interstitial is cosmetic) |
| Password reset | Request form (+ email-gated confirm, unobserved) | Request form + backend confirm, no UI | PARTIAL (MEDIUM): build reset-confirm UI |
| First-time onboarding | None observed | Preselect faculty/year; otherwise none | MATCH (neither) |
| Change password | Settings section | Backend only | PARTIAL (MEDIUM): settings section |
| Delete | Hard-claim danger zone | Soft-delete + confirm | MATCH (policy differs by design — AGENTS.md) |
| Google | Yes | No | MISSING (MEDIUM) |
| Remember-me | Checkbox | Always-persistent 7d | DIFFERENT (LOW) |

---

## 13. UI Comparison

Design tokens could not be read off the live DOM numerically (no devtools style dump in this pass — a follow-up could extract computed values), so this section compares *observable* UI against Hamame's `tokens.css` system. Where the PDFs give exact values they are cited as DOC.

- **Theme:** both dark-navy-first with light-mode toggle. MedSparkDZ toggle observed in header + player; headless click produced no class change (`dark` → `dark`) — UNCLEAR whether toggle is broken, account-persisted, or headless-quirk. Hamame tokens define full light/dark surfaces. (LOW follow-up: retest headed.)
- **Cards:** MedSparkDZ — gradient borders, emoji media (🗂️📁📂), stat hero numbers; Hamame — `surface-1` cards, 3px accent top border, glow shadows. Different aesthetics, equal polish. No action.
- **Buttons:** both gradient/volt primary CTAs, ghost/outline secondaries, disabled-with-reason (MedSpark `title=` on disabled Studio buttons — copy that micro-pattern, LOW).
- **Inputs:** both rounded dark inputs; MedSpark placeholders in French (`votre@email.com`, `MEDSPARK-XXXX-XXXXXXXX`, `m@exemple.com`, `Rechercher dans les notes...`); Hamame equivalent. MATCH.
- **Selects:** MedSpark native selects + custom toggle buttons (types/source/order as pill groups); Hamame native selects + `role="switch"` rows. MATCH.
- **Chips/badges:** MedSpark course + sitting + type chips per question; Hamame `BadgeShelf` + stat chips. Player chips → copy (MEDIUM, §7).
- **QST rail / progress bar:** MedSpark numbered rail + % bar; Hamame Prev/Next only → add (MEDIUM).
- **Modals:** MedSpark exam picker, points rules, notes library, recharge, friends-search, suivi-create, (wizard as modal). All have title + close + backdrop. Hamame `Modal` + `ConfirmDialog` (a11y: focus trap, Esc, restore). parity on infrastructure; gap is *inventory* (the modals themselves), covered per-feature.
- **Toasts:** both (success/error/info). MATCH.
- **Tables/rankings:** MedSpark leaderboard + hypertombables ranked rows; Hamame no ranking UI → leaderboard UI (HIGH).
- **Empty states:** both strong with CTAs. MATCH.
- **Skeletons:** both (MedSpark mobile skeletons LIVE; Hamame `.hamame-skeleton`). MATCH.
- **Icons:** MedSpark emoji + outline icons + per-option eye toggles; Hamame icon-light. Eye/strike + tool rails → LOW/MEDIUM adds.
- **Typography:** MedSpark compact uppercase section labels (`RÉSIDANAT`, `DEUXIÈME ANNÉE`, tracking-widest); Hamame Manrope + Fraunces scale. Stylistic; no action.

---

## 14. UX Comparison

1. **Navigation philosophy** — dashboard tabs (no URL change) vs routes. Hamame's routable model wins for sharing/deep-linking; no change. Borrow `Retour` buttons (LOW).
2. **Creation flows** — MedSpark wizard modal (3 steps, counts, counter, Démarrer) vs Hamame inline form. Content gap, not shape gap (§8).
3. **Feedback immediacy** — MedSpark verify adds community % + comment toggle (social proof + control); Hamame shows correctness + explanation immediately (practice). Add % + collapsible comment (CRITICAL + LOW).
4. **Motivation loops** — monthly leaderboard with published rules + countdown + per-tool quotas + hypertombables ranking. Hamame has streaks/badges/friends engine with no leaderboard UI and no scarcity/urgency surfaces. Leaderboard UI = HIGH.
5. **Trust copy** — activation year-context hint, delete consequence list, exam-mode notice (`Résultats et explications cachés jusqu'à la fin`), anti-farming rules text. Cheap, high-trust; copy the pattern per surface (LOW, bundled).
6. **Error prevention** — required-field modal validation (suivi Matière *), code format placeholders, 6-char hint, fake-code error box. Hamame validation (Zod + inline errors) is at parity. MATCH.
7. **Forgiveness** — resume (`Continuer` per course vs Hamame's single `ResumeBar`): extend Hamame to full history (HIGH).
8. **Empty-state guidance** — both exemplary. MATCH.

---

## 15. Responsive / Mobile Comparison

- **MedSparkDZ @390px (LIVE shots):** single column; dashboard spaces become a **bottom tab bar** (QCM/Studio/Ressources/Suivi/Révision, QCM active highlighted); cards full-width (`Créez Session` / `Exam Mode` side-by-side); skeleton placeholders during load; header condenses to logo + brain/book/bell/menu icons.
- **Hamame:** header collapses to hamburger drawer (Esc + focus-wrap); grids 1→2/3 col; `max-w` readers; 44px touch targets (`tokens.css`).
- **Verdict:** DIFFERENT (LOW). Both valid. Hardening task: verify Hamame drawer + builder + player at 390×844 (mirrors exist in `docs/verification/` harness style) and consider a bottom tab bar A/B — no rebuild justified on current evidence.
- Touch target issues: none observed live on MedSparkDZ; Hamame enforces 44px by token. MATCH.

---

## 16. Interaction & State Comparison

| Interaction | MedSparkDZ | Hamame | Status |
|---|---|---|---|
| Wizard steps with Back | 1→2→3 + Retour at each | Single form (no steps needed) | DIFFERENT (content > shape) |
| Toggle pills (type/source/order) | Yes | Checkboxes + selects + switches | MATCH (control сет parity) |
| Live counter (`N questions`) | Yes (`0 questions`) | No | MISSING (MEDIUM) |
| Modal open/close (Esc/backdrop/Close) | Observed Close + Retour; Esc untested | `Modal` handles Esc/backdrop/focus | MATCH |
| Dropdowns (year/type/module filters) | Native buttons/selects | Native selects | MATCH |
| Tooltips/titles on disabled | `title="Accès réservé…"` | `aria-label` on switches | MATCH (copy `title` microcopy, LOW) |
| Tabs (Studio, notes IA/Mine, suivi, spaces) | All inspected; gated tabs disabled | `PrimaryTabs` + page-level tabs | MATCH infrastructure; missing *instances* per feature |
| Search-as-you-type | Notes search input (behavioral latency untested) | Curriculum search inputs | MATCH |
| Countdown timers | IA renewal `07:57:xx`; player count-up | Exam countdown; streak day-granularity | PARTIAL (LOW): renewal countdown only matters with quotas |
| Toasts | Login success; activation error | Full provider | MATCH |
| Loading/empty/error/success | All observed (§4.15) | All implemented | MATCH |

---

## 17. Missing Features (Hamame has neither UI nor backend, or neither usable)

| # | Feature (MedSparkDZ behavior) | Required implementation | Priority | Evidence |
|---|---|---|---|---|
| M1 | Per-module & per-course question counts in builder (`Anatomie 417`…) | Counts aggregate endpoint (by module/course, viewer-scoped) + UI | HIGH | LIVE `w-full-step2`, `w-mod-sel` dumps |
| M2 | Multi-course selection for a session | Backend: accept course/lesson ID arrays in `POST /sessions`; UI: checkbox course list | CRITICAL | LIVE step-3 dump |
| M3 | Past-exam picker (papers 2018–2025 + counts) | Sitting taxonomy (source+year) + content tagging + modal | HIGH | LIVE `qcm-click-residanat` dump |
| M4 | Community answer % after verify | `GET /questions/:id/answer-stats` (privacy-safe aggregates) + player UI | CRITICAL | LIVE `p2-verified` shot/dump |
| M5 | Hypertombables frequency ranking (3080 q, 64 modules, %) | Aggregate endpoint + `/hypertombables`-style page + filters | HIGH | LIVE `hyper-main` dump |
| M6 | Leaderboard UI + published rules + monthly cycle | Page on `GET /leaderboard` snapshots + rules copy + month cycle | HIGH | LIVE `qcm-main` + `qcm-points-modal` |
| M7 | Session history (grouped, per-course progress, Continuer) | Page on existing sessions/answers data | HIGH | LIVE `sess-cardio` dump |
| M8 | Strike-through elimination per option | Player-local state (no backend) | LOW | LIVE `player-long.png` (eye icons) |
| M9 | Google OAuth login | Provider + link flow | MEDIUM | LIVE login shot |

---

## 18. Partial Features (exist in Hamame, concretely weaker)

| # | Feature | MedSparkDZ | Hamame now | What's missing | Priority |
|---|---|---|---|---|---|
| P1 | Source filter | Externat/Résidanat toggles | Backend param only | Builder UI toggle + taxonomy decision | HIGH |
| P2 | Period filter | `Période →` | Nothing usable | Date/sitting filter (check schema first) | MEDIUM |
| P3 | Live question counter | `0 questions` | Nothing | `GET /questions/count` + builder display | MEDIUM |
| P4 | QST rail + progress % | Numbered rail + % | Prev/Next only | Rail component + jump | MEDIUM |
| P5 | Question chips (course + sitting) | `Anatomie…` + `2022 EMD` | Generic source labels | Per-question course + sitting display | MEDIUM |
| P6 | Comment toggle | `voir le commentaire` | Always-visible explanation | Collapsible explanation | LOW |
| P7 | Report/flag | Flag icon in player | `POST report` backend, no UI | Wire icon → endpoint + toast | MEDIUM |
| P8 | Notes taxonomy | 6 tags + favorites + search + counts | List + create | `tags`/`isFavorite` columns + UI | HIGH |
| P9 | Drive hierarchy + viewer | Folders + `sans téléchargement` | Flat list + download | Grouping/breadcrumbs + embed viewer | MEDIUM |
| P10 | Friends search-to-add | `Rechercher` modal | Panel + backend, no search UI | Search users UI → `POST /friends` | MEDIUM |
| P11 | Dashboard Révision summary | Dues/streak/efficacy panel | Engine, no widget | Widget on `GET /reviews/due` | MEDIUM |
| P12 | Simulations | Schedule + history picker | Timed mode only | History page (cheap) → scheduled sims (big) | MEDIUM |
| P13 | Forgot/reset/change password UI | Request form + settings section | Request form + backends | Reset-confirm page + settings section | MEDIUM |
| P14 | EN/FR | In-player toggle | 501 stub | Product decision + close stub | MEDIUM |
| P15 | Activation year-context | `Aucune année spécifiée` hint | Generic card | Context-aware hint | LOW |
| P16 | Rank/stats on profile | `#250`, splits, weekly bars | Spread across pages | Colocation polish | LOW |
| P17 | Exam capacities | Time options, sitting papers | `timeLimitSeconds` options | Sitting presets (with M3) | MEDIUM |
| P18 | Manual follows | suivi-cours | Auto analytics | Followed-view (optional) | LOW |
| P19 | Mobile bottom tabs | Bottom 5-tab bar | Drawer | A/B consideration | LOW |

---

## 19. Different Implementations (neither is "missing" — decide deliberately)

1. **Navigation:** in-dashboard tabs vs routable pages. Keep Hamame's; borrow `Retour` affordances.
2. **Tracking:** manual follows vs automatic analytics. Keep Hamame's engine; follows as optional view.
3. **Practice timer:** count-up (+pause) vs none (Hamame counts down only timed exams). Consider practice elapsed display (LOW, trivial — `startedAt` already returned).
4. **Remember-me:** checkbox vs always-7d. Cosmetic.
5. **Delete semantics:** claimed-hard vs soft-delete-by-design (AGENTS.md). No change.
6. **Studio purpose:** gated student notebooks vs instructor pipeline + open notes/flashcards. No convergence needed for V1.

---

## 20. Intentional N/A Features (explicitly NOT gaps)

- Study With Me / shared timer / live chat / break games — Bientôt in MedSparkDZ too (`Sessions Partagées`, Study With Me `Bientôt`). N/A.
- AI chatbot / AI hints / AI note maker / AI podcasts / contextual hint credits-as-AI — V1-excluded; MedSparkDZ's Explications/Messages quotas are the same class. N/A (only the *recharge-code mechanism* is borrowed as quota UX, §4.3).
- Spaced repetition *as a requirement* — N/A; note Hamame already ships the engine + player (ahead, not behind).
- Automated CIB/Edahabia payment — both products run manual codes (Hamame activation + promo; MedSparkDZ activation + recharge). MATCH on model; N/A on automation.
- Studio Communauté/Collaborations (admin-gated), shared sessions, pricing page, `/lessons` route — disabled/404 live. N/A.
- OUTILS rail contents + AI rail + chat bubble internals — AI-gated; not pursued. N/A (non-AI tools like highlight/note would be LOW follow-ups once identified).

---

## 21. Documentation vs Live Discrepancies

| # | DOCUMENTATION | LIVE | DISCREPANCY |
|---|---|---|---|
| D1 | PDFs route lists include `/revision` | `/revision` → 404; Révision is a dashboard panel | Docs describe panels as routes. Hamame's separate `/revision` route is a *structural improvement*, not a gap. |
| D2 | PDFs list `/pricing` | `/pricing` → 404; no pricing page; monetization via codes | DOC pricing discussion (500 DA tier) is market context; live has no purchasable plans page. Hamame's `/subscription` + plans pages are AHEAD of live. |
| D3 | PDFs list `/resources`, `/lessons` | Both 404; resources live at `/spark-drive` + `/notes` | Naming drift. Hamame's `/resources` naming matches DOC, not LIVE — consider alias/rename only if user-testing shows confusion (LOW). |
| D4 | `MEDSPARK_CROSS_REFERENCE_AND_ROADMAP.md` says Studio notebooks / Drive browser "unavailable/404" | `/spark-drive` fully browsable (8 drives + subfolders); Studio shell exists but gated; `/notes` library live with 945 notes | Docs are stale on Drive (now live) — strengthens §M5-adjacent Drive findings. |
| D5 | PRD `[MedSparkDZ-confirmed]` session-builder "refinements" (ordering + toggles) | LIVE builder has ordering + exam/stats toggles AND the deeper system (counts, multi-course, source, period, counter, exam picker) | DOC understates the builder gap — this report supersedes with step-level evidence. Ordering/toggles themselves are MATCH (FR-15/16 shipped in Hamame). |
| D6 | `HAMAME_MASTER_HANDOFF` "deliberately not a MedSpark-orange clone" + token system | LIVE MedSparkDZ is dark-navy/purple-gradient (no orange); points/credits are quota, not a token economy | No conflict — aesthetic differentiation stands. |
| D7 | Login page `/ar/login` references (old med-spark.com world) | Live product is `medspark.online` FR-first with in-player EN\|FR toggle | Old-domain docs (med-spark.com) describe a different/legacy product; live reference is `medspark.online` exclusively. |

---

## 22. Prioritized Implementation Roadmap

**Phase 1 — QCM builder depth (the core loop).** Counts endpoint (M1) → multi-course select + live counter (M2, P3) → source toggle wiring (P1) → past-exam picker (M3; needs sitting taxonomy — decide taxonomy with P2 period together). Touches: `questions` aggregates, `POST /sessions` scope arrays, `SessionBuilder` rebuild (keep single-form shell; add count badges, course checkboxes, counter). **Covers CRITICAL ×1 + HIGH ×3.**

**Phase 2 — Player trust + social proof.** Answer-stats endpoint + community % (M4) → QST rail + progress % (P4) → course/sitting chips (P5) → report wiring (P7) → comment toggle + strike-through (P6, M8). Player-only; no schema risk except aggregates table/index. **Covers CRITICAL ×1.**

**Phase 3 — History, ranking, library.** Session history page (M7 — read-only on existing data) → leaderboard UI + rules + monthly cycle (M6) → hypertombables (M5 — needs tag/frequency pipeline; start with source×module counts) → notes tags/search/favorites (P8 — needs columns) → simulations history page (P12 cheap half). **Covers HIGH ×4.**

**Phase 4 — Account + access polish.** Reset-confirm + change-password section (P13) → Google OAuth decision (M9) → preferences stub closure + EN/FR decision (P14) → friends search UI (P10) → dashboard Révision widget (P11) → drive hierarchy/viewer (P9) → trust-copy pass (P15 + §14.5). **All MEDIUM/LOW.**

**Explicitly not scheduled (N/A):** AI surfaces, Study With Me/shared, automated payment, Studio-clone gating, OUTILS-until-identified.

---

## 23. Top 10 Most Important Gaps

### #1 — Session builder: multi-course select with counts + live counter (CRITICAL)
- **MedSparkDZ:** step 2 module buttons carry counts (`Anatomie 417`); step 3 lists every course with counts (`Aorte thoracique 38`) as multi-select checkboxes; header shows live `0 questions`; `Démarrer` launches.
- **Hamame:** one module select + one unit select, no counts, no course level, no counter.
- **Why it matters:** this is the primary creation loop; students choose *what* to study by coverage density. Without counts/multi-select, Hamame's builder feels empty beside the reference.
- **Implement:** counts aggregate (viewer-scoped) → course checkbox step → counter → accept arrays in `POST /sessions`. (Phase 1.)
- **Evidence:** LIVE `w-full-step2.json`, `w-mod-sel.json`, `w-after-2.json`; HAMAME `SessionBuilder.tsx:178-258`.

### #2 — Community answer percentages after verify (CRITICAL)
- **MedSparkDZ:** post-`Vérifier`, every option shows % of learners who chose it (25/25/33/8/8); CTA becomes `voir le commentaire`.
- **Hamame:** correctness + explanation only.
- **Why it matters:** social proof is the strongest trust/learning signal in the loop (also powers trap detection: high-% wrong answers).
- **Implement:** `GET /questions/:id/answer-stats` aggregate (normalize QCM/QCS/grouped-QCS option keys; privacy-safe, no per-user leak) + player UI. (Phase 2.)
- **Evidence:** LIVE `p2-verified.png`/dump; HAMAME `sessions/[id]/page.tsx:12-23`, `QuestionCard`.

### #3 — Session history with per-course progress + resume (HIGH)
- **MedSparkDZ:** Mes Sessions grouped by year → unit drill-down (`0 % global`) → course rows (`Répondues 0/5`, `Précision 0 %`, `Progression 0/5`) → `Continuer` → `/qcm/session/:uuid`.
- **Hamame:** single-session `ResumeBar` + results pages; no browsable history.
- **Why it matters:** continuity is the retention loop; all data already exists.
- **Implement:** read-only history page on sessions/answers/results. (Phase 3.)
- **Evidence:** LIVE `sess-cardio` dump; HAMAME `dashboard/page.tsx` ResumeBar, `sessions/[id]/results/page.tsx`.

### #4 — Past-exam picker (HIGH)
- **MedSparkDZ:** `Choisir un Examen` modal — exam-mode notice + papers 2018–2025 with counts (150/150/141/120/115/114/295).
- **Hamame:** none; exam is a mode, not a corpus.
- **Why it matters:** "train on the real 2023 paper" is the highest-intent study action in this market.
- **Implement:** sitting taxonomy + tagging + modal (with P2). (Phase 1 tail.)
- **Evidence:** LIVE `qcm-click-residanat.json`.

### #5 — Hypertombables ranking (HIGH)
- **MedSparkDZ:** `/qcm/hypertombables` — 3080 questions, 64 modules, ranked % (HGE 7.2 %, ACP 5.6 %…), year/type/module filters.
- **Hamame:** nothing comparable.
- **Why it matters:** highest-leverage study-guidance surface; cheap once tagging exists.
- **Implement:** frequency pipeline + page + filters. (Phase 3.)
- **Evidence:** LIVE `hyper-main.json`, route `route--qcm-hypertombables.png`.

### #6 — Leaderboard UI + published scoring rules (HIGH)
- **MedSparkDZ:** monthly board (`septembre 2026`, `27 jours restants`; sessions/précision/points rows) + `COMMENT ÇA MARCHE` modal (+10 first-correct, +4 after-error, anti-farming).
- **Hamame:** snapshot engine + jobs, zero UI.
- **Why it matters:** the engine already runs; only the motivational surface is missing.
- **Implement:** page on `GET /leaderboard` + rules copy + monthly cycle display. (Phase 3.)
- **Evidence:** LIVE `qcm-main`, `qcm-points-modal`; HAMAME `leaderboard.routes.ts`, `generateLeaderboardSnapshots.ts`.

### #7 — Notes tags + favorites + search (HIGH)
- **MedSparkDZ:** search input + 6-tag taxonomy (🔴 Difficile 🟢 Facile ⚡ Important 📚 À réviser ✅ Compris ⚠️ Piège) + Favoris + per-year counts + 945-note library.
- **Hamame:** paginated list + create.
- **Why it matters:** notes become unusable at scale without retrieval; taxonomy is handed over free.
- **Implement:** `tags`/`isFavorite` columns + filter UI + counts. (Phase 3.)
- **Evidence:** LIVE `notes-filtres`; HAMAME `notes.routes.ts`, `app/notes/page.tsx`.

### #8 — Source filter in builder (HIGH)
- **MedSparkDZ:** Externat/Résidanat toggles in step 3.
- **Hamame:** backend `source` param exists, no UI.
- **Why it matters:** cheapest HIGH in the report — one toggle wired to a shipped backend.
- **Implement:** toggle + taxonomy mapping decision (`official_exam` ↔ Externat/Résidanat). (Phase 1.)
- **Evidence:** LIVE step-3 dump; HAMAME `question-filters.ts:22-50`, `SessionBuilder.tsx:41-46`.

### #9 — QST navigator + question chips in player (MEDIUM)
- **MedSparkDZ:** numbered jump rail + `Question 1/5` + `20 %` bar + course/sitting chips per question.
- **Hamame:** Prev/Next only, generic source labels.
- **Why it matters:** orientation during 150-question papers; sitting chips carry exam legitimacy.
- **Implement:** rail component (state exists) + chip display from question payload. (Phase 2.)
- **Evidence:** LIVE `player-long.png`; HAMAME `sessions/[id]/page.tsx:68-76`.

### #10 — Spark Drive hierarchy + in-browser view (MEDIUM)
- **MedSparkDZ:** folders → year subfolders → `sans téléchargement` viewing.
- **Hamame:** flat filtered list + download link.
- **Why it matters:** resource discovery at Algerian-faculty scale; viewer keeps study in-app.
- **Implement:** grouping/breadcrumbs on existing filters + PDF embed on detail. (Phase 4.)
- **Evidence:** LIVE `drive-folder.json`, `drive-main.json`; HAMAME `resources.routes.ts`, `app/resources/`.

---

## 24. Complete Gap Checklist

Status as of Phase 6 kickoff (all Phases 1–5 verified; see handoff §9.0).
`[x]` = built + raw-log verified. Items without a box are open/gated.

- [x] M1 counts endpoint + builder badges (HIGH) — Phase 1
- [x] M2 multi-course select + arrays in `POST /sessions` (CRITICAL) — Phase 1
- [x] M3 exam-sitting taxonomy + picker modal (HIGH) — Phase 1 R2
- [x] M4 answer-stats endpoint + community % UI (CRITICAL) — Phase 2
- [x] M5 hypertombables pipeline + page (HIGH) — Phase 3 (as honest bank coverage)
- [x] M6 leaderboard page + rules + cycle (HIGH) — Phase 3
- [x] M7 session-history page + per-course resume (HIGH) — Phase 3
- [x] M8 strike-through elimination (LOW) — Phase 5
- [ ] M9 Google OAuth decision + implementation (MEDIUM) — DECISION GATE, Phase 6 Task 6
- [x] P1 source toggle UI (HIGH) — Phase 1
- [x] P2 period/sitting filter (MEDIUM) — Phase 1 R2
- [x] P3 live question counter (MEDIUM) — Phase 1
- [x] P4 QST rail + % bar (MEDIUM) — Phase 5
- [x] P5 course/sitting chips (MEDIUM) — Phase 5
- [x] P6 collapsible explanation (LOW) — Phase 2
- [x] P7 report-icon wiring (MEDIUM) — Phase 5
- [x] P8 notes tags/favorites/search + columns (HIGH) — Phase 3
- [x] P9 drive hierarchy + viewer (MEDIUM) — Phase 4 (breadcrumbs + PDF viewer)
- [x] P10 friends search UI (MEDIUM) — Phase 4 (incl. minimal user-search endpoint)
- [x] P11 dashboard Révision widget (MEDIUM) — Phase 4 (due count; no efficacy stat exists)
- [x] P12 simulations history, cheap half (MEDIUM) — Phase 5 (?mode= + history tabs; scheduling NOT built)
- [x] P13 reset-confirm page + change-password section (MEDIUM) — Phase 4 (reset page new; change-password was pre-existing, verified only)
- [x] P14 preferences stub closure (MEDIUM) — Phase 4 (endpoint persisted; language toggle UI itself gated, see below)
- [x] P15 activation year-context hint (LOW) — Phase 5 (guidance copy; pre-redemption lookup refused as validity oracle)
- [x] P16 profile stat colocation polish (LOW) — Phase 5 (rank chip + graceful omit)
- [ ] P17 sitting time presets with M3 (MEDIUM) — Phase 6 Task 2
- [ ] P18 followed-courses view (LOW) — SKIP, not scheduled
- [ ] P19 mobile tab-bar A/B (LOW) — CLOSED as N/A (Phase 5 live check: reference no longer ships one)
- [ ] Practice elapsed timer display (LOW, §19.3) — Phase 6 Task 3
- [ ] `Retour` affordance on drill pages (LOW, §6) — Phase 6 Task 3
- [ ] Disabled-button `title` microcopy (LOW, §13) — Phase 6 Task 3
- [ ] Trust-copy pass: exam notice (LOW, §14.5) — Phase 6 Task 3 (delete list + rules text already shipped)
- [ ] 390px verification pass for drawer/builder/player (LOW, §15) — Phase 6 Task 4
- [x] Re-test MedSparkDZ theme toggle headed (UNCLEAR resolution) — Phase 5 (confirmed broken live, diagnostic only)
- [ ] Locate signup entry (`/register` 404) (UNCLEAR resolution) — Phase 6 Task 5
- [ ] Open OUTILS rail items (UNCLEAR resolution) — Phase 6 Task 5
- [ ] Capture MedSparkDZ results screen after finishing a session (UNCLEAR resolution) — Phase 6 Task 5
- [ ] Capture `/simulations/history` per-year content with data (UNCLEAR resolution) — Phase 6 Task 5
- [ ] P14 language toggle UI (MEDIUM) — DECISION GATE, Phase 6 Task 6 (endpoint persisted in Phase 4)
- [ ] Scheduled simulations system (MEDIUM) — DECISION GATE, Phase 6 Task 6 (live example exists; only cheap history built)
- [ ] Cross-module unit multi-select — DECISION GATE, Phase 6 Task 6 (only if live reference proves it)

*Counts: 37 ranked gaps — 24 closed across Phases 1–5 (CRITICAL 3/3, HIGH 8/8, MEDIUM 9/14, LOW 4/8); 6 open build/verify items in Phase 6 Tasks 2–4; 4 decision-gated; 1 skipped (P18); 1 closed-as-N/A (P19); 4 UNCLEAR follow-ups (1 resolved, 3 in Task 5). N/A items (§20) intentionally unlisted as work.*

---

## 25. Phase 6 live-resolution appendix (UNCLEAR items + drift notes)

Observed live on https://www.medspark.online across 2026-09-04 → 2026-09-07
(headed + headless Playwright, test account). Evidence: `%TEMP%\opencode\
phase6-live*` console outputs, DOM dumps, and PNGs (wizard, rails, results,
mobile full-page). Nothing below was built from; it resolves open questions
or records drift.

### 25.1 Signup entry — RESOLVED
`Créer un compte` leads to `/signup` (dedicated page, NOT the old 404
`/register`): full form — Nom complet, Faculté de médecine select (15
faculties: Alger, Annaba, Batna, Bechar, Bejaia, Blida, Constantine,
Laghouat, Mostaganem, Oran, Ouargla, +4 more), Adresse email, Mot de passe,
Confirmer, `Créer mon compte` CTA, `OU CONTINUER AVEC` header with NO
provider buttons rendered, `Se connecter` link. Logged-in visits redirect to
/dashboard. No account was created during observation.

### 25.2 OUTILS rail — RESOLVED (classified, not built)
Player right rails, top to bottom. AI rail: wand → **"Indice IA" modal**
(AI-generated hint + `Compris !` / `Regenerate`) = AI, out of scope; book +
bulb icons: clicks produce no observable change (UNCONFIRMED — not guessed).
OUTILS rail: pencil = highlighter (arms, icon goes active; no persistent
mark observed on text selection); green book = per-course notes panel
("Antomie des fosses nasales et sinus / 0 question avec notes / Aucune note
disponible pour ce cours / Générez des notes IA pour les questions pour les
voir ici") = AI-fed, out of scope; bottom doc = per-question **"Mes
notes"** panel (question text quoted) = non-AI; orange bookmark, blue chart:
no observable change (UNCONFIRMED). Bottom-right chat bubble: no observable
change headless (UNCONFIRMED). Candidate non-AI future items, if ever
pursued: per-question notes panel, highlighter — both need deeper probing
first; nothing here is specified enough to build.

### 25.3 MedSparkDZ results screen — CAPTURED (deltas only, nothing built)
"Session Terminée" modal over the player (URL stays `/qcm/session/:id`):
`Examen Terminé!`, `Votre performance`, Correctes / Incorrectes counts, `0%
Score`, `Note sur 20` (`0/20`), scoring-mode explainer (`🎯 Tout ou rien:
Points complets uniquement si toutes les bonnes réponses sont
sélectionnées, sans aucune mauvaise`), per-mode tallies (`0 Tout/rien |
2 Partiel | 2 Amélioré`), `Temps total 01:13`, `Moyenne par question 15s`,
`Détails par cours`, `Progression 0/5`, actions `Recommencer` /
`Quitter la session`. Deltas vs Hamame `/sessions/[id]/results` (score-%
card, correct/incorrect/unanswered chips gated by showStats, `Revoir mes
erreurs`, `Refaire une session ciblée`, `Points à revoir`, per-question
detail): Hamame lacks per-mode scoring breakdown (Tout ou rien / Partiel /
Amélioré), /20 note, and time stats (total + per-question average). Whether
any of that is worth copying is a product decision, not taken here.

### 25.4 `/simulations/history` per-year content — OBSERVED EMPTY
Year picker (1ère–6ème + R Résidanat) renders; clicking R shows no content
change and no history rows on the test account (no past simulations to show).
The scheduled "Simulation Résidanat" seen during Phase 3 is gone again —
third observed drift of live state. Nothing further to capture until an
account with simulation history is available.

### 25.5 Cross-module multi-select — CLOSED PERMANENTLY
Wizard courses are single-module `role="checkbox"` lists
(`aria-checked`/`data-state` toggles). Checking a course, going Retour,
picking another module, and checking there leaves exactly ONE checked box
(the new one; counter shows only the new course: 5 → 21, not 5+21).
Switching modules resets selection — courses from two modules can never be
combined in one session. Hamame's single-module scope matches the reference;
no `moduleIds[]` work is queued.

### 25.6 Exam-mode config — basis for P17 (presets by count)
The past-paper wizard (`Créer une Session`, steps 1·2·3) shows NO per-paper
time anywhere: course radios with counts, Types/Source pills, Période De/À,
Ordre, Mode Examen switch, live counter, Statistiques toggle, Retour /
Démarrer (disabled until a course is picked). P17 therefore derives presets
from the live counter (Hamame convention, `EXAM_SECONDS_PER_QUESTION`),
not from any reference value.

---

## 26. Phase 7 fresh-discovery appendix (all-new pass, observe-only, nothing built)

**Date:** 7–8 September 2026. **Method:** slow authenticated Playwright walkthrough
(headless system Chrome, 1366×900 + 390×844) of every reachable screen as
`hamamebouchareb@gmail.com`: every header icon, all 5 dashboard tabs, all
dashboard modals/menus, full `/qcm` inventory (wizard steps 1–3, exam picker,
points modal, notes modal, ECOS/Résidanat cards, history drill-down with REAL
rows, hypertombables, sim-history drill-down), a complete 43-question
**exam-mode session start→finish** (the E2E prior phases never did), correction
review, suivi/profile/settings/activate/notifications/drive/notes/studio, and a
13-route mobile pass. Evidence: `%TEMP%\opencode\phase7-live\` (JSON dumps +
PNGs, incl. `mobile/` subfolder). **Nothing was built. No codes consumed, no
accounts created, no settings saved, no follows/notes created.**

**Disclosed side effect:** this pass created exactly ONE real exam session on
the test account (Génétique, 43 QCS, answered A throughout: 7 correct /
36 incorrect, 16%, 3.26/20) plus one answer-free entry into a pre-existing
resumed session (`a977e199…`, nothing answered). Account-level churn cited
below (score 60→80, rank #143→#142, stats 5→6 sessions) is caused by that
session and is expected, not a product change.

**Headline: no CRITICAL and no HIGH items.** The reference product is
structurally unchanged since Phase 6; everything below is one MEDIUM,
ten LOWs, and four informational drift-corrections. A near-clean result —
recorded as such, not padded.

### 26.1 New findings (N-series — none force-fit into M/P items)

| # | Finding (MedSparkDZ LIVE) | Hamame position | Priority | Evidence |
|---|---|---|---|---|
| N1 | Header brain icon → **"Notifications de révision"** dropdown (`Aucune révision requise aujourd'hui / Excellent ! Profitez de votre journée`); header book icon → **"Nouveaux cours"** dropdown (`Aucun nouveau cours`). Two header notification surfaces never previously documented. | P11 widget exists; no header dropdowns, no new-course feed | LOW | `03-hclick-1.png`, `03-hclick-2.png` |
| N2 | Bell opens a **notification dropdown with category tabs Tout / Social / Prix / Système** (`Aucune notification`) — distinct from the `/notifications` page. The `Prix` tab hints at price/promo notifications. | Center page only, no dropdown, no categories | LOW | `03-hclick-3.png` |
| N3 | **Exam-mode is client-side and resumable-as-practice.** Session starts at `/qcm/session/:id?examMode=1&examDuration=65`; reloading the bare URL (exactly what history `Continuer` links to) renders PRACTICE UI (`Vérifier`, count-up). An exam resumed from history silently becomes practice. | Hamame exam withholding is server-side per session mode — structurally stronger; no change needed, but do not copy the URL-param pattern | MEDIUM (product-awareness, not a build order) | `08-exam-state.json`, `05-continuer-player.json` |
| N4 | **Exam countdown = 90 s/question, live-confirmed** (43 questions → `examDuration=65` min → `1:04:57` ticking). Hamame's `EXAM_SECONDS_PER_QUESTION = 90` convention is now proven exact, not an estimate. In-exam loop: select → **Répondre** (locks; morphs to **Modifier**) → Suivant; no Vérifier except on the last question (Vérifier + Terminer side by side, Terminer disabled until answered). | Convention confirmed; Hamame player lacks a `Modifier`-after-lock affordance (answers submit immediately) | LOW | `08-exam-player-q1.json`, `08-exam-q1-answered.json` |
| N5 | **Exam results modal + correction flow** (first full capture): `Examen Terminé!`, Correctes/Incorrectes/Score, `Note sur 20` with Tout-ou-rien/Partiel/Amélioré tabs AND per-mode notes (identical 3.26 here — expected for single-choice QCS), `Temps total 02:28`, `Moyenne 3s`, `Détails par cours`, `Progression 7/43` (= correct count), actions **Voir la correction** / Recommencer / Quitter. Correction = in-place review: frozen timer, color-coded QST rail (green correct / red wrong), community % + `voir le commentaire` per question. | Hamame results page has no per-mode notes, no time stats, no in-place correction review (Phase 6 decision-gated candidates — this pass supplies the missing live spec) | LOW (spec now complete; build still gated on product decision) | `08-exam-results4.json`, `08-exam-results4.png`, `08-correction.png` |
| N6 | **Leaderboard rules expanded** since §23 #6: +4 after indice use, session bonus (60%+ precision; unique question = 1 unit, repeat = 0.25; +10 per 10 units), daily bonus (+10 after 50 raw points, once/day). | Engines differ (Hamame: 30-day average) — informational; §23 #6 rules text now stale if ever quoted | LOW | `04-points-modal.json` |
| N7 | **Exam-picker corpus now 2005–2025** (was 2018–2025): 21 papers, counts 150→180–300. Content growth, not a UI change. | Sitting taxonomy covers any year range already | LOW (informational) | `05-residanat-click.json` |
| N8 | **ECOS = year → unit → `Aucun ECOS disponible / Le contenu sera disponible très bientôt`.** Real flow shell, zero content. Resolves the §25 ECOS UNCLEAR as N/A. | Nothing to copy (no content to be parity with) | LOW (informational) | `07-ecos-unit.json` |
| N9 | **History drill-down completed-state** (only empty rows seen before): `TERMINÉE` chip + 100% ring, **Revoir** (vs Continuer), per-row dates, header `N session(s) · Continuez votre entraînement` + `53% global`. | `/historique` has Continuer/Revoir equivalents; date display + global-% header are uncopied polish | LOW | `05-history-drill.json` |
| N10 | **Profile additions** vs §4.8: `Performance par module` block (per-module % + n/m questions), `Examens blancs` count, `Sessions terminées` split, Dim–Sam weekly bars. Live values: 72 questions, #75, 6/66 split, 6 sessions / 2 terminées. | Profile shows rank chip + qcm-stats grid; no per-module block, no mock-exam count | LOW | `09-profile.json`, `09-profile-full.png` |
| N11 | **Spark Drive browser details**: TRI sort header (Nom/Date/Taille/Type), `DOSSIERS · N` / `N éléments` counts, year dossiers 2023/2024/`2025 🌟🌟` → named author sub-dossiers (6 verified), `auto-refresh 1h` microcopy, `2ère/3ère…` numbering typos live. Hierarchy proven 4 levels deep (root → folder → year dossier → author dossier). | Flat list + breadcrumbs + PDF viewer; no folder hierarchy, no sort header | LOW | `10-drive-NotesdeQcm.json`, `12-drive-files.json` |

### 26.2 Drift corrections to earlier report text (informational, no Hamame action)

- **D8 — Theme toggle now WORKS (Phase 5 "genuinely broken" verdict stale).**
  Header theme control is a Clair/Sombre/Système menu; selecting Clair flips
  `<html class>` dark→light with body bg `rgb(247,247,248)`, revert restores
  dark `rgb(9,9,11)`. Either fixed live since 2026-09-05 or the earlier headed
  test hit a transient state. Evidence: `06-theme-test.json`,
  `06-theme-clair.png`. No Hamame implication.
- **D9 — Hypertombables rows restored** (64 ranked rows, 3080 q / 64 modules,
  filters Toutes-les-années / Tous-les-types / Par-module) after rendering
  header-only in Phase 3/6. Fourth observed live-state flip on this route
  family (sim-scheduling, theme, rows). Evidence: `10-hyper.json`.
- **D10 — Studio has a 4th locked tab, `Enregistrés`** (lock icons on
  Communauté / Collaborations / Enregistrés; only Mes Cahiers usable).
  Still gated content → still N/A, but the inventory grows by one label.
  Evidence: `11-studio-tabs.png`.
- **D11 — Auth session expired mid-pass** (≈40 min wall-clock across scripts;
  `/settings` + `/notifications` briefly redirected to `/login`, recovered
  after re-login with fresh `state.json`). Login page re-confirms `Rester
  connecté` checkbox + an EMPTY `OU CONTINUER AVEC` block (OAuth drift
  stands). No Hamame action; noted for future pass planning (re-login
  between long script batches).

### 26.3 Mobile 390×844 (all 13 routes)

Zero horizontal overflow on every route (0px everywhere); no bottom tab bar
anywhere (P19 N/A re-confirmed — header + hamburger model stands);
hamburger opens a full-screen **Menu (Profil / Paramètres / Déconnexion)**;
dashboard stacks hero → friends → tabs → QCM/Drive/Study-With-Me → IA credits
→ progression → weekly → recent → years-active → stat tiles cleanly. Only
observation: the session player initially renders loading skeletons (content
not settled within a 5 s wait) — timing, not breakage. Evidence:
`mobile/m-*.png` (13 full-page), `mobile/m-menu.png`, `mobile/m-summary.json`.

### 26.4 Prioritized list (Phase 7 — same format as §23)

1. **Exam resume-as-practice (N3) — MEDIUM.** Only finding with product
   weight, and its lesson is *validating* (server-side mode beats URL params).
   No build; keep as a design constraint if Hamame ever adds shareable
   session links.
2. **Exam correction-review spec (N5) — LOW.** The live spec Hamame lacked
   (per-mode notes, time stats, in-place review) is now fully captured with
   screenshots. Still gated on the Phase 6 product decision — this pass only
   completes the reference material.
3. **Header notification dropdowns (N1+N2) — LOW.** Cheap, high-visibility
   surfaces; the Révision dropdown pairs naturally with the shipped P11
   widget. `Nouveaux cours` needs a content feed first — widget before feed.
4. **History + profile polish (N9+N10) — LOW.** Dates + global header on
   `/historique`; per-module performance + mock-exam count on profile. All
   read-only on shipped backends.
5. **Drive hierarchy/sort (N11) — LOW.** Sort header + counts are the cheap
   half; folder grouping remains the real cost. Unchanged from P9.
6. **Leaderboard rules text (N6) — LOW/informational.** Only matters if
   Hamame ever adopts per-answer points; until then, note §23 #6 as stale.
7. **Corpus + drift notes (N7, N8, D8–D11) — informational.** No action;
   recorded so the next pass doesn't re-discover them.
