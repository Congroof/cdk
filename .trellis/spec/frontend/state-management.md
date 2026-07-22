# State Management

> How state is organized and managed in the CDK Server frontend.

---

## Approach: Local State Only

The project uses **no external state management library** (no Redux, no Zustand, no Jotai). All state is managed with React's built-in `useState` and Context API.

---

## State Categories

### 1. Component-local state (`useState`)

Most state lives in the component that needs it:

```tsx
const [items, setItems] = useState<Cdk[]>([]);
const [loading, setLoading] = useState(false);
const [page, setPage] = useState(1);
const [search, setSearch] = useState('');
```

### 2. Shared state via Context (`createContext`)

Only for cross-cutting concerns. Currently only **Toast** uses Context:

```tsx
// Toast.tsx exports ToastProvider; toastContext.ts exports useToast + context.
<ToastProvider>
  <App />
</ToastProvider>
```

### 3. Auth state (localStorage)

Authentication is managed via `localStorage`:
- **Write**: On login, store JWT token in `localStorage.setItem('token', ...)`
- **Read**: Axios interceptor reads `localStorage.getItem('token')` for every request
- **Clear**: On 401 response, `localStorage.removeItem('token')` + redirect to `/login`

```tsx
// ProtectedRoute in App.tsx
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('token');
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
```

---

## State Lifting

When child components need to trigger parent actions, pass callbacks as props:

```tsx
// Parent (Dashboard)
<CDKTable onPageChange={setPage} onRefresh={refreshAll} />

// Child (CDKTable) calls the callback
onRefresh();
```

---

## Server State Pattern

All server data follows this pattern in the component that fetches it:

```tsx
const [data, setData] = useState<DataType>(initialValue);
const [loading, setLoading] = useState(false);

const fetchData = useCallback(async () => {
  setLoading(true);
  try {
    const res = await api.get('/endpoint');
    if (res.data.success) setData(res.data.data);
  } catch { /* interceptor handles 401 */ }
  finally { setLoading(false); }
}, [deps]);

useEffect(() => { fetchData(); }, [fetchData]);
```

---

## Conventions

- Page-level components own the data state and pass it down to display components
- Form state stays local to the form component (modal)
- Pagination/filter state stays in the page component that fetches data
- No derived state stored in state — compute during render instead

---

## Anti-Patterns

- Do NOT introduce Redux, Zustand, or any external state library
- Do NOT use Context for data that only one component tree needs (use prop drilling)
- Do NOT store derived values in state — compute them on render
- Do NOT store server responses in global state — keep them local to the fetching component
- Do NOT sync localStorage with React state (read it directly where needed)
