# Directory Structure

> Frontend code organization for the CDK Server (React + TypeScript + Vite).

---

## Overview

The frontend is a single-page application under `frontend/`. It uses Vite as the build tool with React 19 and TypeScript.

---

## Directory Layout

```
frontend/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── index.html
├── public/
└── src/
    ├── main.tsx            # React entry point (renders <App />)
    ├── App.tsx             # Router setup + ProtectedRoute
    ├── index.css           # Global styles (TailwindCSS imports)
    ├── api/
    │   └── index.ts        # Axios instance + interceptors
    ├── assets/
    │   └── hero.png        # Static images
    ├── components/         # Reusable UI components
    │   ├── Layout.tsx      # Page shell (sidebar/header)
    │   ├── CDKTable.tsx    # CDK data table with pagination
    │   ├── CreateModal.tsx # CDK generation form modal
    │   ├── ExportModal.tsx # Export filter modal
    │   ├── Toast.tsx       # Toast provider and rendered notifications
    │   ├── toastContext.ts # Toast context types + useToast hook
    │   ├── UsageStats.tsx  # Usage statistics dashboard
    │   ├── BannedMachines.tsx  # Ban management component
    │   └── FeedbackList.tsx    # User feedback list / filters / set-done
    ├── pages/              # Route-level page components
    │   ├── Login.tsx       # Login form
    │   ├── MobileCdk.tsx   # Mobile CDK management UI
    │   └── Dashboard.tsx   # Main dashboard (tabs: CDK / Stats / Banned / Feedback)
    └── types/
        └── index.ts        # Shared TypeScript interfaces
```

---

## Organization Rules

| Category | Location | Convention |
|----------|----------|-----------|
| Page components | `src/pages/` | One file per route, PascalCase name |
| UI components | `src/components/` | One file per component, PascalCase name |
| API client | `src/api/index.ts` | Single axios instance, shared interceptors |
| Type definitions | `src/types/index.ts` | All interfaces in one file |
| Static assets | `src/assets/` | Images, fonts |
| Global styles | `src/index.css` | TailwindCSS base imports only |

---

## Naming Conventions

| Item | Convention | Example |
|------|-----------|---------|
| Component files | PascalCase.tsx | `CDKTable.tsx`, `CreateModal.tsx` |
| Page files | PascalCase.tsx | `Dashboard.tsx`, `Login.tsx` |
| Utility files | camelCase.ts | (none yet, but follow this) |
| Type files | camelCase.ts | `index.ts` |
| CSS files | camelCase.css | `index.css` |
| Component exports | `export default function Name` | Named default export |

---

## Where to Put New Code

| Type | Location |
|------|----------|
| New page/route | `src/pages/<Name>.tsx` + add route in `App.tsx` |
| New reusable component | `src/components/<Name>.tsx` |
| New API type/interface | `src/types/index.ts` |
| New API endpoint usage | Call directly via `api.get/post` in the component |
| New utility function | `src/utils/<name>.ts` (create directory if needed) |
