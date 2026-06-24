# Component Guidelines

> Component patterns, props conventions, and composition rules for the CDK Server frontend.

---

## Component Structure

All components follow this pattern:

```tsx
import { useState } from 'react';
import { IconName } from 'lucide-react';
import type { TypeName } from '../types';
import api from '../api';
import { useToast } from './Toast';

interface Props {
  // typed props
}

export default function ComponentName({ prop1, prop2 }: Props) {
  const { toast } = useToast();
  // state, handlers, render
}
```

---

## Key Conventions

### Default exports

Every component uses `export default function Name`. No named exports for components.

### Props interface

Define `Props` interface directly in the component file (not in `types/index.ts`) since they're component-specific:

```tsx
interface Props {
  items: Cdk[];
  total: number;
  page: number;
  onPageChange: (page: number) => void;
  onRefresh: () => void;
}
```

### No prop spreading

Pass props explicitly — don't use `{...props}` spread.

---

## Styling

- **TailwindCSS 4** — utility classes directly in JSX
- **Dark theme** — the entire app uses a dark color scheme
- **Color palette**: slate (neutral), blue/indigo (primary), emerald (success), red (danger)
- **Glass-morphism**: `bg-white/[0.03]`, `border-white/5`, `backdrop-blur-xl`
- **Gradient text**: `bg-gradient-to-r from-X to-Y bg-clip-text text-transparent`
- **Rounded corners**: `rounded-xl` (cards), `rounded-2xl` (modals), `rounded-lg` (buttons)

### Status badge pattern

```tsx
const statusConfig: Record<CdkStatus, { label: string; className: string }> = {
  unused: { label: '未使用', className: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  activated: { label: '已激活', className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  // ...
};
```

---

## Icons

Use `lucide-react` for all icons. Import individual icons:

```tsx
import { Plus, RefreshCw, Search } from 'lucide-react';
// Usage: <Plus className="w-4 h-4" />
```

Standard sizes: `w-3.5 h-3.5` (inline), `w-4 h-4` (buttons), `w-5 h-5` (toast/alerts).

---

## Modals

Modal pattern used in the project:

```tsx
{isOpen && (
  <div className="fixed inset-0 z-50 flex items-center justify-center">
    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
    <div className="relative bg-slate-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
      {/* content */}
    </div>
  </div>
)}
```

---

## Toast Notifications

Use the `useToast` hook from `Toast.tsx`:

```tsx
const { toast } = useToast();
toast('操作成功', 'success');
toast('操作失败', 'error');
toast('提示信息', 'info');
```

---

## Data Fetching in Components

Components fetch data directly using the shared axios instance:

```tsx
const fetchData = useCallback(async () => {
  setLoading(true);
  try {
    const res = await api.get('/cdk/list', { params });
    if (res.data.success) {
      setItems(res.data.data.items);
    }
  } catch {
    // handled by axios interceptor (401 → redirect)
  } finally {
    setLoading(false);
  }
}, [dependencies]);
```

---

## Anti-Patterns

- Do NOT use class components — function components only
- Do NOT install additional UI libraries (no MUI, Ant Design, shadcn) — use Tailwind directly
- Do NOT use inline styles (`style={{}}`) — use Tailwind classes
- Do NOT create wrapper components for simple HTML elements
- Do NOT use `any` type for event handlers — use proper React event types
- Do NOT put business logic in utility functions — keep it in the component that uses it
