# Next Step
**Spending trends page** (`frontend/src/app/trends/page.tsx`)
- Month-over-month spend per category (bar or line chart, Recharts)
- Monthly summary cards (income / expenses / net per month)
- Quarter filter tabs: All / Q1 / Q2 / Q3 / Q4
- Data: query all transactions grouped by month + category (client-side aggregation)

---

# Design Notes

## Layout — current
Dashboard uses a full-width banner image (h-44, `banner.jpg`) with Upload / Transactions / Sign Out buttons overlaid top-right. Content is a single-column max-w-7xl below. Transactions page has a white header bar with a back arrow.

## Layout — tried & reverted
Attempted a **Notion-style left sidebar** (`components/Sidebar.tsx` — kept but unused) with:
- `#f7f6f3` background, 224px sidebar, nav items (Dashboard / Transactions / Trends-soon)
- Full-width banner above the sidebar+content split
- Upload + Sign out in the sidebar
Reverted because the feel wasn't right. `Sidebar.tsx` is preserved if we want to revisit.

---

# Project
finance-tracker — a personal finance app that ingests bank/credit card PDF statements, categorizes transactions with an LLM, and stores everything in Supabase. Goal: a visually engaging UI.

## Architecture

```
pipeline/pdf_parser.py      — parses PDFs into a DataFrame + metadata dict
pipeline/categorizer.py     — Groq-based categorizer with a Supabase merchant cache
database/connector.py       — uploads parsed/categorized data to Supabase
tests/main.py               — manual end-to-end runner (parse → categorize → upload)
tests/test_parsers.py       — parser unit tests
api.py                      — FastAPI wrapper: POST /upload accepts PDF + user_id, runs pipeline
```

## Pipeline flow

1. `parse_pdf(path)` → extracts text with pdfplumber, returns:
   - `transactions` DataFrame (trans_date, description, amount1, amount2)
   - `period_start` / `period_end` (ISO dates)
   - `account_type`: `"credit"` | `"checking"` | `"savings"` (weighted regex scoring)
   - `last_four`: last 4 digits of account number
   - `card_name`: e.g. `"Chase Sapphire Preferred"`, `"Capital One Venture"`

2. `categorize_dataframe(df)` → adds `category` and `cleaned_description` columns
   - Cleans descriptions (strips phone numbers, order codes, domain suffixes)
   - Bulk cache lookup against `merchant_categories` table (1 Supabase query)
   - Uncached descriptions batched to Groq `llama-3.3-70b-versatile` in chunks of 20
   - New results written back to cache
   - 8 categories: Food & Drink, Bills & Utilities, Travel, Groceries, Health and Wellness, Entertainment, Shopping, Personal

3. `upload_transactions(pdf_path, user_id)` → single public entrypoint in connector
   - Builds `account_name` as `"Chase Sapphire ****1333"` from `card_name` + `last_four`
   - Upserts account in `accounts` table (keyed on `last_four`)
   - Deduplicates statements via SHA-256 file hash (`skip_if_exists=True` by default)
   - Inserts rows into `transactions` table; negative amounts = credits

## Supabase tables
- `accounts` — bank_acc_id, user_id, account_name, account_type, last_four
- `statements` — statements_id, account_id, user_id, filename, file_hash, period_start, period_end, storage_path
- `transactions` — date, description, amount, type (debit/credit), category, statement_id, user_id
- `merchant_categories` — description (cleaned), category (LLM cache)

## Supported card brands
Chase (Sapphire, Freedom, College Checking), Capital One, Bank of America,  Marcus (Goldman Sachs)

## Env vars required
`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `GROQ_API_KEY`

---

## Frontend plan

### Stack
- **Next.js 14** (App Router) — framework
- **Tailwind CSS** — styling
- **shadcn/ui** — component library (cards, tables, sidebar, buttons)
- **Recharts** — charts (area chart for spend over time, pie/bar for categories)
- **react-dropzone** — PDF drag-and-drop upload zone
- **Supabase JS client** — direct DB reads from browser + auth (anon key only, never service key)
- **FastAPI** (`api.py`) — only needed for PDF upload endpoint
- **Framer Motion** — page/card animations (staggered fade-in, slide-up)
- **react-countup** — animated spending total that counts up from $0 on dashboard load

### Data flow
```
Browser
  ├── dashboard/transactions/accounts reads → Supabase JS client (direct)
  └── POST /upload PDF                      → FastAPI → pipeline → Supabase
```

### Build order
1. ✓ Scaffold Next.js inside `Finance_tracking/frontend/`
2. ✓ Install Supabase JS client + configure anon key in `.env.local`
3. ✓ Login / Signup page (Supabase auth)
4. ✓ Protected route proxy (redirect to /login if not logged in)
5. ✓ Upload page + inline dashboard upload
6. ✓ Dashboard
7. ✓ Transactions page
8. Spending trends
9. Forecasting

### Auth — COMPLETE ✓
- Login/signup via Supabase email + password (`app/login/page.tsx`)
- Single form handles both sign in and sign up with toggle
- On success → session cookie set → proxy detects logged-in user on every request
- Sign out button on dashboard → clears session → redirects to `/login`
- `utils/supabase/client.ts` — browser Supabase client (used in client components)
- `utils/supabase/server.ts` — server Supabase client (used in server components)
- `proxy.ts` — runs on every request; unauthenticated → `/login`; logged-in on `/login` → `/dashboard`
- **Next.js 16 note:** uses `proxy.ts` not `middleware.ts`; exported function must be named `proxy` not `middleware`
- **Dev commands:** `npm run dev` from `frontend/` folder; `.env.local` changes require server restart

### Pages & features

1. **Upload page** — COMPLETE ✓
   - Standalone page at `/upload`: drag-and-drop zone (react-dropzone) + click-to-browse, 6 UI states
   - Inline upload on dashboard: "Upload statement" button opens OS file picker directly, status shown inline — no page navigation
   - Both POST multipart/form-data to FastAPI `/upload`
   - `database/connector.py` now returns `account_name` in both success and skipped responses

2. **Dashboard** — main "wow" screen
   - Current month total spend + comparison to last month
   - Spending over time area chart (like Rocket Money)
   - Category breakdown (pie/donut)
   - Recent transactions list

3. **Transactions page** — COMPLETE ✓
   - Full transaction table with dual-calendar date range picker (`DateRangePicker.tsx`) + search + category + account filters
   - Click any row → edit modal (description + category → Supabase UPDATE)
   - Add manual transaction modal with `SingleDatePicker.tsx` (type or pick date) + amount (no spinners) + type + category + account dropdown → Supabase INSERT
   - Manual transactions require selecting an account (used to resolve a valid `statement_id`) because `statement_id` is NOT NULL in the schema
   - **Future option:** make `statement_id` nullable in Supabase (Table Editor → transactions → statement_id → uncheck "Is Not Null") so users can add transactions without any account. Safe to do — no calculations depend on `statement_id`, only display (would show "Manual" in Account column)
   - Loading: spinner; no data: "Upload a PDF →"; filtered empty: "No results for this filter"
   - Animated rows (Framer Motion slide-in); transaction count footer
   - `components/DateRangePicker.tsx` — range picker with presets (Last 30 Days / 3M / 6M / 1Y / All Time) + dual calendar
   - `components/SingleDatePicker.tsx` — single date picker: type MM/DD/YYYY or click calendar icon
   - Upload overlay: full-screen GIF (`/uploading.gif`) with frosted glass backdrop while FastAPI processes PDF
   - `react-day-picker@9` + `date-fns` installed; `.rdp-root` CSS overrides in `globals.css` for dark-mode text fix

4. **Spending trends** — month-over-month per category charts

5. **Forecasting**
   - Project end-of-month spend based on daily average so far (client-side math for v1)
   - Category-level projections
   - Can upgrade to a FastAPI `/forecast` endpoint later (pandas rolling average)

6. **Budgets** *(requires new Supabase `budgets` table)*

7. **User-level category override cache** *(Option B — future)*
   - New Supabase table: `user_category_overrides(user_id, cleaned_description, category)`
   - At upload time: check user overrides first → shared `merchant_categories` cache → Groq
   - Allows per-user corrections (e.g. "Zelle From John" = Income for one user, Personal for another)
   - Currently (Option A): edits just `UPDATE transactions SET category = ?` on the specific row only

### FastAPI `/upload` endpoint (api.py) — COMPLETE ✓
- Accepts: `multipart/form-data` (`file: UploadFile`, `user_id: Form(...)`)
- Saves to `tempfile.NamedTemporaryFile` → calls `upload_transactions(tmp_path, user_id)` → `os.remove()` in `finally`
- Returns: `{ statement_id, account_id, account_name, inserted, skipped }`
- CORS configured for `http://localhost:3000`
- `GET /` redirects to `/docs` (Swagger UI for manual testing)
- Logging configured via `logging.basicConfig` so pipeline logs appear in terminal
- Run with: `python -m uvicorn api:app --reload` (use `-m` flag on Windows — PATH issue)
- Test at: `http://127.0.0.1:8000/docs`
- Processing is synchronous — large statements take 5-15s; acceptable for personal tool

### Component architecture

**Shared reusable components** (`frontend/components/ui/`)
- `EmptyState` — icon + title + message + optional action button. Used on every page with no data
- `TableSkeleton` — animated shimmer rows, configurable row count. Used while table data loads
- `PageHeader` — title + subtitle, consistent across all pages

**Pattern every data-fetching component follows:**
```jsx
if (loading) return <TableSkeleton rows={8} />
if (!data.length) return <EmptyState title="..." message="..." />
return <ActualUI data={data} />
```

**Two flavors of empty state (important distinction):**
- No data at all → "Upload a PDF to get started →" (with action button)
- Has data but filter returns nothing → "No results for this period" (no action button)

**Animations (Framer Motion)**
- Dashboard cards: staggered fade + slide-up on load (each card slightly delayed)
- Transaction rows: slide in from left as they appear
- Spending total: counts up from $0 to real number (react-countup)
- Charts: draw-in animation on load (Recharts built-in)
- Upload success: checkmark animation

**Skeleton shimmer:** shadcn/ui `Skeleton` component has shimmer pulse built in — no extra setup needed

### Loading & empty states per page

**Dashboard**
| Component | Loading | Empty | Has Data |
|---|---|---|---|
| Spend total | Skeleton number | `$0.00` | Countup animation to real total |
| Spending chart | Skeleton rectangle | Flat line + "No data yet" | Area chart draws in |
| Category pie | Skeleton circle | "Upload a statement to see categories" | Donut chart |
| Recent transactions | 5 skeleton rows | "No transactions yet. Upload a PDF →" | Transaction rows |

**Transactions page**
| Component | Loading | Empty (no data) | Empty (filtered) | Has Data |
|---|---|---|---|---|
| Table | 10 skeleton rows | "Upload a PDF to get started" | "No results for this period" | Full table |

**Upload page**
| State | UI |
|---|---|
| Idle | Dashed drop zone, "Drag & drop your PDF here" |
| File selected | Show filename, Upload button activates |
| Uploading | Spinner + "Processing... this takes 10-15 seconds" |
| Success | Green check, "47 transactions imported from Chase Sapphire ****1333" |
| Already uploaded | Yellow warning, "Already uploaded — no duplicates added" |
| Error | Red, "Something went wrong" + error detail |

**Login page**
| State | UI |
|---|---|
| Idle | Email + password fields, Sign in button |
| Submitting | Button shows spinner, fields disabled |
| Wrong credentials | Red text "Invalid email or password" |
| Success | Redirect to dashboard |

---

## Pages — Implementation Plan

### 1. Dashboard — COMPLETE ✓
- Stat cards: current month spend (CountUp), vs last month delta, top category, transaction count
- Area chart (6-month spend) + category donut (this month) — Recharts
- Recent transactions list (last 8 rows) with category color badges
- Full-width banner image (`frontend/public/banner.jpg`) using `object-cover` at `h-44`
- Upload button + sign out in banner nav
- Light/white theme (gray-50 bg, white cards, gray borders)
- Installed: `recharts`, `react-countup`, `framer-motion`, `next-themes`, `lucide-react`
- Components: `StatCards`, `SpendingChart`, `CategoryDonut`, `RecentTransactions` in `frontend/src/components/dashboard/`
- "Income" is the 9th Groq category — payroll/direct deposits auto-categorized; Zelle/Venmo defaults to Personal
- Category edits: Option A — UPDATE on specific transaction row only (Option B user-override cache documented as future feature)

### 2. Transactions page — TODO
- View all transactions → Supabase query with filters
- Edit transaction details inline or via modal → `UPDATE transactions SET ... WHERE id = ?` → dashboard auto-refreshes on next visit (no recalculate logic needed)
- Add manual transactions → `INSERT` directly into `transactions` table via Supabase JS client (no FastAPI needed)
- Category edit currently uses Option A: updates the specific transaction row only
- Filters: time range (1M / 3M / 6M / 1Y / All), category, account, search by merchant

### 3. Savings & Expenses tab — TODO
- Shows Income vs Expenses vs Net per month (like the Notion reference: monthly cards + grouped transaction view)
- Income source: "Income" category from Groq categorizer (payroll, direct deposits)
- Expenses source: all non-Income transactions with amount > 0
- Monthly card grid (Jan–Dec) showing income / expenses / net per month
- Quarter filter tabs: All / Q1 / Q2 / Q3 / Q4
- Grouped-by-month transaction list below

### Out of scope (no data source)
- Recurring charge detection (would need pattern detection algorithm)
- Net worth (no investment/asset data)
- Credit score (third-party API required)


The full request flow
User drops PDF
  → browser reads file
  → POST /upload (multipart form) to FastAPI
  → FastAPI saves temp file
  → parse_pdf() → categorize_dataframe() → upload_transactions()
  → returns { inserted: 47, skipped: false, account_name: "Chase Sapphire ****1333" }
  → frontend shows success card
- async + job quene is also another option to do in the future