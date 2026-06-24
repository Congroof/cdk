# Quality Guidelines

> Code standards, linting, and quality expectations for the CDK Server frontend.

---

## Build & Check Commands

```bash
cd frontend
npm run build     # TypeScript type-check (tsc -b) + Vite build
npm run lint      # ESLint
npm run dev       # Development server (localhost:5173)
```

---

## Linting

- **ESLint 10** with `@eslint/js` + `typescript-eslint`
- Plugins: `react-hooks`, `react-refresh`
- Config file: `eslint.config.js`

Key rules enforced:
- Exhaustive deps for hooks (react-hooks/exhaustive-deps)
- React Refresh compatibility (only export components)

---

## Formatting

- No Prettier configured — rely on editor formatting + TailwindCSS class ordering
- Consistent use of single quotes for strings
- Semicolons at end of statements
- 2-space indentation

---

## Build Requirements

`npm run build` must pass cleanly (zero TypeScript errors, zero build warnings treated as errors).

---

## Code Organization Rules

1. **One component per file** — never define multiple exported components in one file
2. **Imports at top** — React hooks first, then libraries, then local imports
3. **Types imported separately** — use `import type { ... }` for type-only imports
4. **No circular dependencies** — pages import components, never vice versa

---

## UI/UX Standards

- **Chinese UI** — all user-facing text in Chinese
- **Responsive** — use Tailwind breakpoints (`sm:`, `md:`) for mobile support
- **Loading states** — show loading indicator for async operations
- **Error feedback** — show toast notifications for API errors
- **Confirmation dialogs** — destructive actions (disable CDK) require confirmation modal

---

## Dependencies

Current stack (do not replace unless explicitly requested):

| Category | Library | Version |
|----------|---------|---------|
| Framework | React | 19 |
| Build | Vite | 8 |
| Styling | TailwindCSS | 4 |
| HTTP | Axios | ^1.16 |
| Routing | react-router-dom | ^7.15 |
| Icons | lucide-react | ^1.14 |
| Charts | recharts | ^3.8 |
| Excel | xlsx | ^0.18 |

---

## Anti-Patterns

- Do NOT add UI component libraries (no MUI, Ant Design, shadcn, etc.)
- Do NOT add state management libraries (no Redux, Zustand)
- Do NOT add CSS-in-JS libraries (no styled-components, emotion)
- Do NOT use `console.log` in production code (remove before commit)
- Do NOT ignore TypeScript errors with `// @ts-ignore`
- Do NOT leave unused imports or variables
- Do NOT use `var` — always `const` or `let`
