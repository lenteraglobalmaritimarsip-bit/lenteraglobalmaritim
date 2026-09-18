# MaritimPort Project Guidelines

## Architecture

- This is a React 19 + TypeScript + Vite browser application. The entry points are [src/main.tsx](src/main.tsx) and [src/App.tsx](src/App.tsx).
- `App.tsx` owns authentication, global database subscription, active role, active tab, selected job, and conditional view routing.
- Role-specific workflows live under `src/components/`: sales, manager operations, FDA, finance, vessel monitoring, and admin/master data. Shared navigation and session UI live under `src/components/layout/`.
- Shared domain contracts and role/tab unions belong in [src/types.ts](src/types.ts). Follow existing unions when adding workflow states.

## Data and Workflow Rules

- This is currently a browser-only demo. Persistence is through [src/db/storage.ts](src/db/storage.ts) and `localStorage`; do not assume an active backend API.
- Route database mutations through the `db` service so persistence, subscriptions, audit logging, and centralized workflow guards remain intact. Do not mutate database state or component data props directly.
- Preserve historical records and existing workflow states, including completed and closed jobs. Do not hide or delete jobs as a side effect of adding finance, FDA, invoice, or closing controls unless the request explicitly requires destructive behavior.
- When adding or renaming an `ActiveTab`, update both the conditional routing in [src/App.tsx](src/App.tsx) and navigation in [src/components/layout/Sidebar.tsx](src/components/layout/Sidebar.tsx).
- Authentication and seeded accounts are client-side demo data only. Do not describe browser storage or plaintext demo passwords as production security.
- React effects must tolerate development double-invocation because [src/main.tsx](src/main.tsx) enables `StrictMode`.

## Build and Validation

- Install dependencies with `npm install`.
- Start development with `npm run dev` at `http://localhost:3000`.
- Typecheck with `npm run lint` (`tsc --noEmit`); there is no separate ESLint configuration.
- Build with `npm run build` and preview with `npm run preview`.
- There is no test script or visible test suite. For behavior changes, run the typecheck and build, then manually exercise the affected role workflow in the browser.
- On Windows, do not rely on `npm run clean` because its `rm -rf` command is Unix-specific. `START_PORTAL.bat` references a missing `server` script; use the Vite commands in `package.json` instead.

## Documentation

- Start with [README.md](README.md) for the main workflow overview.
- Check [REVISION_NOTES_V10_1.md](REVISION_NOTES_V10_1.md), [REVISION_NOTES_V10_1_LOGIN.md](REVISION_NOTES_V10_1_LOGIN.md), and [REVISION_NOTES_V10_1_LOGIN_FINAL.md](REVISION_NOTES_V10_1_LOGIN_FINAL.md) before changing branding, login, or recently revised master-data behavior.
- Use [database/schema.sql](database/schema.sql) as the database-shape reference, while remembering that the current runtime persistence is browser `localStorage`.