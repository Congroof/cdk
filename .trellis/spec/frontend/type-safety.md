# Type Safety

> TypeScript conventions and type organization in the CDK Server frontend.

---

## TypeScript Version

- **TypeScript ~6.0** (strict mode)
- **Target**: ESNext (handled by Vite)
- **Module**: ESNext

---

## Type Organization

All shared types live in `src/types/index.ts`. This single file contains:

- API response types (`ApiResponse<T>`)
- Domain model interfaces (`Cdk`, `BannedMachine`, etc.)
- Enum-like union types (`CdkStatus`, `ValidUnit`)

```typescript
export type CdkStatus = 'unused' | 'activated' | 'expired' | 'disabled';
export type ValidUnit = 'days' | 'hours';

export interface Cdk {
  id: number;
  code: string;
  valid_duration: number;
  valid_unit: ValidUnit;
  status: CdkStatus;
  machine_code: string | null;
  // ...
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
```

---

## Import Style

Use `import type` for type-only imports:

```tsx
import type { Cdk, CdkStatus } from '../types';
```

---

## Type Patterns

### Union types for enums

Use string literal unions, not TypeScript enums:

```typescript
export type CdkStatus = 'unused' | 'activated' | 'expired' | 'disabled';
```

### Nullable fields

Use `T | null` (matching the backend's JSON null):

```typescript
machine_code: string | null;
expires_at: string | null;
```

### Generic API response

```typescript
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
```

### Props interfaces

Defined locally in each component file (not exported to types/):

```tsx
interface Props {
  items: Cdk[];
  onRefresh: () => void;
}
```

---

## Conventions

- Types matching backend API responses use `snake_case` field names (matches JSON directly)
- Component props use `camelCase` field names
- Use `Record<K, V>` for object maps (e.g., `Record<CdkStatus, { label: string }>`)
- Prefer interfaces over type aliases for object shapes
- Use union types over enums for string constants

---

## Error Handling Types

For API error responses in catch blocks:

```tsx
catch (err: any) {
  toast(err.response?.data?.error || '操作失败', 'error');
}
```

Note: The project uses `any` for caught errors (acceptable given axios error structure).

---

## Anti-Patterns

- Do NOT use TypeScript `enum` — use string literal union types instead
- Do NOT use `as` type assertions unless absolutely necessary
- Do NOT use `@ts-ignore` or `@ts-expect-error`
- Do NOT duplicate backend types — define them once in `types/index.ts`
- Do NOT use `interface` for function types — use arrow function type syntax
- Do NOT make all fields optional "just in case" — match the actual API response shape
