# 03 — Frontend inventory (read from code 2026-10-02)

Next.js 16 App Router + React 19 + Tailwind v4 (CSS-first tokens in
`web/src/styles/tokens.css`), port 3001. Token in localStorage
`hamame_auth` (MVP choice; backend reads only the Authorization header).
`apiFetch` (`web/src/lib/api.ts`) attaches the token and takes raw
`RequestInit` — callers must `JSON.stringify` bodies themselves.

## Routes (33 pages; 32 client, 1 server shell)

Public (no gate): `/` (landing; authed visitors redirect to /dashboard),
`/login`, `/register`, `/forgot-password`, `/reset-password`, `/verify`.
`/qcm/builder` is a server shell rendering client `QcmBuilderClient`.
All other 27 routes are `"use client"` + protected via `useRequireAuth` /
`useAuthedPage` (redirect to `/login` when no user after hydrate):
`/dashboard`, `/qcm`, `/faculties`, `/faculties/[id]/years`,
`/years/[id]/modules`, `/modules/[id]/units`, `/units/[id]`,
`/lessons/[id]`, `/suivi`, `/revision`, `/review`, `/notes`,
`/historique`, `/classement`, `/couverture`, `/resources`,
`/resources/[id]`, `/sessions/[id]`, `/sessions/[id]/results`,
`/simulations`, `/profile`, `/settings`, `/subscription`,
`/notifications`, `/authoring`, `/bienvenue`.

Onboarding gate (`useRequireAuth`): signed-in users missing facultyId/yearId
are replaced to `/bienvenue` unless skipped (`hamame_onboarding_skip`) or on
an exempt route (auth pages + `/bienvenue` itself).

## Shared pieces

- 38 components in `web/src/components/` + `layout/Sidebar.tsx`: AppHeader
  (sticky topbar, desktop nav md-lg, hamburger drawer <md with focus trap,
  bottom 5-tab bar <md, global Sidebar lg+), UserMenu (avatar menu:
  profile/settings/logout only), Sidebar (collapsible rail, PRIMARY +
  SECONDARY nav), PageShell (guard + width scale + header + footer),
  Button/ButtonLink, Card, Field (Input/Select/Textarea), ErrorState,
  EmptyState, LoadingSkeleton, Modal, ConfirmDialog, Toast, MetricCard,
  PremiumCard, PrimaryTabs, FeatureCard/CourseCard, CurriculumToolbar,
  ProgressBar, QuestionCard, AnswerOption, SessionBuilder, ReviewCard,
  RevisionCard, ResumeBar, ProfileHero, FriendsPanel, BadgeShelf,
  ActivationCodeCard, BackLink, Footer, StudyTimer, EnqueueReviewButton,
  VerifyEmailBanner, LanguageToggle, GoogleSignInButton,
  NotificationsBell, Breadcrumb (+curriculumTrail).
- Contexts: AuthContext (localStorage session, roles via /users/me,
  login/register/loginWithToken/logout/refreshProfile),
  LanguageContext (FR default, server-wins, localStorage + PUT persist,
  `<html lang>` sync), ThemeContext (clair/sombre/systeme, OS listener,
  pre-paint script, local-first with server convergence).
- Lib (11 files): api, cx, i18n, nav (PRIMARY 5 + SECONDARY 10 + ACCOUNT 2,
  single source of truth), richtext, types, useApiList, useApiResource
  (GET + loading/error + refetch, null skips), useAuthedPage (user +
  logout handler), usePushSubscription, useRequireAuth.
- Data fetching: `useApiResource` (single) / `useApiList` (parallel batches)
  + direct `apiFetch` for mutations. No React Query, no shadcn/ui, no icon
  lib, no form lib (hand-rolled + Zod-free client checks; server validates).
- i18n: 954 FR keys + 954 EN keys (`web/src/lib/i18n.ts` lines 33/1078);
  `en: Record<I18nKey, string>` makes `tsc` fail on any missing translation.
  `{var}` interpolation only; plurals are caller-selected key pairs.
- Theme: dark default (`:root`), light via `:root[data-theme="light"]`
  (brand fills identical, companions re-checked AA); `theme.*` keys FR+EN;
  server enum `light|dark|system`; settings card + header cycler.
- No scaffold/dead routes found: every page has a real handler and UI (the
  old starter `page.tsx` was replaced by the landing page; no 501 stubs per
  the route audit).

Responsive: drawer + tab bar <md, header pills md-lg, sidebar lg+,
`sm:`/`md:`/`lg:` grids throughout, 44px touch targets, bottom padding
under the fixed tab bar.
