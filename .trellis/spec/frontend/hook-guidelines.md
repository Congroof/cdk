# Hook Guidelines

> Custom hook patterns and data fetching conventions in the CDK Server frontend.

---

## Current Hook Usage

The project does **not** have a dedicated hooks directory. Hooks are either:
1. Built-in React hooks used directly in components (`useState`, `useCallback`, `useEffect`)
2. A context-based hook exported from a dedicated context module (`useToast` from `toastContext.ts`)

---

## Custom Hook Pattern (Context-based)

The `useToast` hook demonstrates the project's custom hook pattern:

```tsx
// In toastContext.ts
interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void;
}

export const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

// In Toast.tsx: component exports stay separate for React Fast Refresh.
import { ToastContext } from './toastContext';

export function ToastProvider({ children }: { children: React.ReactNode }) {
  // ... provider implementation
}
```

Usage in consuming components:

```tsx
import { useToast } from './toastContext';

export default function MyComponent() {
  const { toast } = useToast();
  // ...
}
```

---

## Data Fetching Pattern

Data fetching is done inline in components using `useCallback` + `useEffect`:

```tsx
const fetchData = useCallback(async () => {
  setLoading(true);
  try {
    const res = await api.get('/endpoint', { params });
    if (res.data.success) {
      setState(res.data.data);
    }
  } catch {
    // 401 handled by interceptor, other errors shown via toast
  } finally {
    setLoading(false);
  }
}, [param1, param2]);

useEffect(() => {
  void Promise.resolve().then(fetchData);
}, [fetchData]);
```

---

## Conventions

- No external data-fetching library (no React Query, no SWR)
- No generic `hooks/` directory. Context-backed hooks live beside their provider
  in a dedicated `*Context.ts` module when Fast Refresh requires component-only
  exports from the `.tsx` provider file.
- If a context hook needs to be shared, export it from the adjacent `*Context.ts`
  module and keep the provider component in its `.tsx` file.
- `useCallback` for any function passed to child components or used in `useEffect` deps
- `useEffect` only for data fetching on mount/dependency change

---

## When to Extract a Hook

Only extract a custom hook when:
1. The same stateful logic is needed in 3+ components
2. It involves context that needs a provider pattern
3. Complex state logic that benefits from encapsulation

For this small project, prefer keeping logic inline in components.

---

## Anti-Patterns

- Do NOT install React Query or SWR — use the existing `useCallback` + `useEffect` pattern
- Do NOT create a `hooks/` directory for single-use hooks
- Do NOT use `useReducer` for simple state — `useState` is preferred
- Do NOT forget to add cleanup in `useEffect` when needed (timers, subscriptions)
- Do NOT omit dependencies from `useCallback`/`useEffect` — follow exhaustive-deps rule
