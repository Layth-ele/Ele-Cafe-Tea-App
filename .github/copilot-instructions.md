# Copilot Instructions for AI Agents

## Project Overview
- This is a TypeScript/React e-commerce app for a tea & coffee cafe, with Firebase backend and a custom global CSS system.
- Major folders: `src/` (frontend), `functions/` (Firebase Cloud Functions), `scripts/` (admin/dev scripts), `schemas/` (Zod/TypeScript data validation), `styles/` (custom CSS system).

## Architecture & Patterns
- **Schemas**: All data validation and types are in `src/schemas/` using Zod. Import from `@/schemas` for consistency. Each schema file exports both types and validation helpers.
- **Global Styles**: CSS is modularized in `src/styles/` (see `README.md` there for tokens, themes, and responsive utilities). Use `index.css` as the entry point.
- **Contexts**: App-wide state (auth, cart, language, theme, notifications) is managed via React Contexts in `src/contexts/`.
- **Pages/Components**: UI is organized under `src/app/pages/` and `src/app/components/`.
- **Firebase**: Backend logic and triggers live in `functions/`. Use TypeScript for all cloud functions.

## Developer Workflows
- **Install dependencies**: `npm i` or `pnpm i` (pnpm preferred if available)
- **Start dev server**: `npm run dev` (frontend)
- **Deploy functions**: `firebase deploy --only functions`
- **Seed data**: Run scripts in `scripts/` or `src/scripts/` (see `seedEverything.tsx`)
- **Testing**: No formal test suite; rely on manual testing and validation helpers in schemas.

## Project-Specific Conventions
- **Absolute Imports**: Use `@/` as the root alias for `src/` (e.g., `@/schemas`, `@/lib/firebase.ts`).
- **Validation**: Always validate data at boundaries using Zod schemas.
- **Theme/Language**: Use context providers for theme and language switching; see `ThemeContext.tsx` and `LanguageContext.tsx`.
- **CSS**: Prefer custom CSS utilities over Tailwind; see `src/styles/README.md` for system details.
- **No test/ folder**: Tests are inline or manual; check schema helpers for validation logic.

## Integration Points
- **Firebase**: Auth, Firestore, and Functions are integrated via `src/lib/firebase.ts` and `functions/`.
- **Scripts**: Admin/dev scripts are in `scripts/` and `src/scripts/` (Node.js, not browser code).
- **Data Flow**: All data passed between frontend and backend should be validated with schemas.

## Examples
- Importing a schema: `import { Product } from '@/schemas/product.schema'`
- Using a context: `const { user } = useContext(AuthContext)`
- Adding a style: `@apply` custom utility from `src/styles/utilities.css`

## References
- See `src/schemas/README.md` and `src/styles/README.md` for detailed conventions.
- For new features, follow the patterns in `src/app/`, `src/contexts/`, and `src/schemas/`.
