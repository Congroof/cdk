# Frontend Development Guidelines

> Coding conventions for the CDK Server frontend (React 19 + TypeScript + Vite + TailwindCSS).

---

## Tech Stack

- **Framework**: React 19 (function components only)
- **Language**: TypeScript ~6.0 (strict)
- **Build**: Vite 8
- **Styling**: TailwindCSS 4 (dark theme, utility-first)
- **Routing**: react-router-dom v7
- **HTTP**: Axios with request/response interceptors
- **Icons**: lucide-react
- **Charts**: recharts
- **Excel**: xlsx

---

## Pre-Development Checklist

Before writing frontend code, read these guideline files:

1. [Directory Structure](./directory-structure.md) — file layout, where to add new code
2. [Component Guidelines](./component-guidelines.md) — component patterns, styling, modals, toasts
3. [Hook Guidelines](./hook-guidelines.md) — data fetching, custom hook patterns
4. [State Management](./state-management.md) — local state, context, auth state
5. [Type Safety](./type-safety.md) — TypeScript conventions, type organization
6. [Quality Guidelines](./quality-guidelines.md) — linting, build, dependency rules

---

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Directory Structure](./directory-structure.md) | Component/page/hook organization | Filled |
| [Component Guidelines](./component-guidelines.md) | Component patterns, props, styling | Filled |
| [Hook Guidelines](./hook-guidelines.md) | Custom hooks, data fetching patterns | Filled |
| [State Management](./state-management.md) | useState, context, no external lib | Filled |
| [Type Safety](./type-safety.md) | TypeScript conventions, type organization | Filled |
| [Quality Guidelines](./quality-guidelines.md) | Linting, build commands, anti-patterns | Filled |

---

## Quick Reference

- All UI text is in **Chinese**
- Dark theme: slate background, glass-morphism cards, gradient accents
- API calls: `api.get/post` from `src/api/index.ts`
- Types: import from `src/types/index.ts`
- Notifications: `useToast()` hook → `toast('message', 'success'|'error'|'info')`
- Auth: localStorage token, axios interceptor auto-adds Bearer header
