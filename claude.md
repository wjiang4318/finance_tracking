# Next Step
**Forecasting page** (`frontend/src/app/forecasting/page.tsx`)
- Project end-of-month spend based on daily average so far (client-side math)
- Category-level projections
- Can upgrade to a FastAPI `/forecast` endpoint later (pandas rolling average)

## Known limitations / future work
- **Net accumulated accuracy**: Credits (negative amounts) are all counted as income via `|| tx.amount < 0`. This means: (a) Zelle received from friends correctly offsets spending; (b) BUT savings account credits (Marcus deposits) also inflate income if both checking + savings are uploaded. (c) Zelle you SEND is excluded from spending as Internal Transfers, so net accumulated skews high for frequent Zelle senders.
- **Savings vs P2P split**: `Internal Transfers` mixes bank-to-bank savings transfers and Zelle P2P. A future `Savings Transfer` category (LLM rule: ACH to known savings banks) would enable a clean cumulative savings chart. Deferred — LLM can't reliably distinguish without known savings bank list.
- **Merchant cache is shared and description-keyed**: the `merchant_categories` table maps cleaned description → category globally. Editing a transaction row (Option A) only fixes that one row; future uploads of the same merchant name will still use the cached category. Option B (per-user override table) would fix this permanently.

---

# Design Notes

## Layout — current
- **Global background**: `bg-[#f4f4fb]` — very slightly violet-tinted white across all pages and sidebar. Chosen to reduce the stark contrast between the dark banner and a pure-white page.
- **Sidebar** (`components/Sidebar.tsx`) — active on all pages. `bg-[#f4f4fb]`, 224px, `h-screen sticky top-0`. Nav: Dashboard / Transactions / Trends. Upload statement button + Sign out at bottom. Sidebar handles its own upload (with GIF overlay) on non-dashboard pages; dashboard passes `onUpload` prop to trigger its own file input instead.
- **PageBanner** (`components/PageBanner.tsx`) — shared banner component used on all pages. Props: `eyebrow` (small label above title), `title` (page heading), `right` (optional ReactNode overlaid top-right — used for upload status on Dashboard, year selector on Trends, Add Transaction button on Transactions). `h-52`, GIF with `from-[#f4f4fb]/80` gradient fade at bottom.
- **Dashboard** — `PageBanner` with eyebrow="Personal", title="Finance Tracker". Notion-style: banner scrolls away, sidebar sticky. Below banner: stat cards, spending chart, category donut, recent transactions.
- **Transactions** — `PageBanner` with title="Transactions", Add Transaction button in `right` slot (glass style: `bg-white/20 border-white/30`). No separate header bar.
- **Trends** — `PageBanner` with title="Spending Trends", year selector in `right` slot (glass style). No separate header bar.
- **Card styling**: `border border-gray-100` (no `shadow-sm`) on all content cards — softer than `border-gray-200 shadow-sm`, sits more naturally against `#f4f4fb`.

## Layout — tried & reverted
- Full-width banner spanning the entire top (including over the sidebar), sidebar below — reverted because it looked wrong when sidebar text overlapped the GIF.
- `#f7f6f3` beige sidebar — reverted to `bg-gray-50`, later updated to `bg-[#f4f4fb]`.
- `bg-gray-50` page background — replaced with `bg-[#f4f4fb]` to soften contrast with dark banner.
- White header bar on Transactions and Trends — replaced with `PageBanner` for visual consistency.

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
   - **12 categories:** Food & Drink, Bills & Utilities, Travel, Groceries, Health and Wellness, Entertainment, Shopping, Investment, Internal Transfers, Credit Card Payment, Income, Uncategorized
   - Default fallback is `Uncategorized` (previously `Personal`)

3. `upload_transactions(pdf_path, user_id)` → single public entrypoint in connector
   - Builds `account_name` as `"Chase Sapphire ****1333"` from `card_name` + `last_four`
   - Upserts account in `accounts` table (keyed on `last_four`)
   - Deduplicates statements via SHA-256 file hash (`skip_if_exists=True` by default)
   - Inserts rows into `transactions` table; negative amounts = credits

## Categorizer rules (priority order)
1. **Credit Card Payment** — card issuer name + PAYMENT/AUTOPAY/PMT keyword
2. **Investment** — Robinhood, Fidelity, Vanguard, Schwab, Coinbase, Webull, etc.
3. **Income** — payroll, direct deposit, ADP, Gusto, tax refund, bank interest
4. **Internal Transfers** — Zelle to/from individuals, Venmo, Cash App personal, bank-to-bank ACH
5. **Food & Drink** — restaurants, cafes, delivery (Uber Eats, DoorDash)
6. **Groceries** — supermarkets, food markets, convenience stores
7. **Travel** — flights, trains, Uber rides, hotels, parking
8. **Entertainment** — streaming, ticketed events, gaming, tours
9. **Health and Wellness** — medical, pharmacy, gym, personal care
10. **Bills & Utilities** — phone, internet, insurance, utilities
11. **Shopping** — retail (Amazon default), general goods
12. **Uncategorized** — true last resort when nothing matches

## Expense calculation logic
**"True spending" excludes transfer-type categories:** Investment, Internal Transfers, Credit Card Payment, Income are excluded from all expense totals on dashboard and trends. This prevents double-counting when both credit card and checking account statements are uploaded (the credit card payment on the checking account is a transfer, not new spending).

## Supabase tables
- `accounts` — bank_acc_id, user_id, account_name, account_type, last_four
- `statements` — statements_id, account_id, user_id, filename, file_hash, period_start, period_end, storage_path
- `transactions` — id (uuid PK), date, description, amount, type (debit/credit), category, statement_id, user_id
- `merchant_categories` — description (cleaned), category (LLM cache)

## Supported card brands
Chase (Sapphire, Freedom, College Checking), Capital One, Bank of America, Marcus (Goldman Sachs)

## Env vars required
`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `GROQ_API_KEY`

---

## Frontend plan

### Stack
- **Next.js 14** (App Router) — framework
- **Tailwind CSS** — styling
- **shadcn/ui** — component library (cards, tables, buttons)
- **Recharts** — charts (area chart, bar chart, donut)
- **Supabase JS client** — direct DB reads from browser + auth (anon key only, never service key)
- **FastAPI** (`api.py`) — only needed for PDF upload endpoint
- **Framer Motion** — page/card animations (staggered fade-in, slide-up)
- **react-countup** — animated spending total that counts up from $0 on dashboard load

### Data flow
```
Browser
  ├── dashboard/transactions/trends reads → Supabase JS client (direct)
  └── POST /upload PDF                    → FastAPI → pipeline → Supabase
```

### Build order
1. ✓ Scaffold Next.js inside `Finance_tracking/frontend/`
2. ✓ Install Supabase JS client + configure anon key in `.env.local`
3. ✓ Login / Signup page (Supabase auth)
4. ✓ Protected route proxy (redirect to /login if not logged in)
5. ✓ Upload — inline on all pages via sidebar button (GIF overlay); standalone `/upload` page removed
6. ✓ Dashboard
7. ✓ Transactions page
8. ✓ Spending trends page
9. Forecasting

### Auth — COMPLETE ✓
- Login/signup via Supabase email + password (`app/login/page.tsx`)
- Single form handles both sign in and sign up with toggle
- On success → session cookie set → proxy detects logged-in user on every request
- Sign out button in sidebar → clears session → redirects to `/login`
- `utils/supabase/client.ts` — browser Supabase client (used in client components)
- `utils/supabase/server.ts` — server Supabase client (used in server components)
- `proxy.ts` — runs on every request; unauthenticated → `/login`; logged-in on `/login` → `/dashboard`
- **Next.js 16 note:** uses `proxy.ts` not `middleware.ts`; exported function must be named `proxy` not `middleware`
- **Dev commands:** `npm run dev` from `frontend/` folder; `.env.local` changes require server restart

### Pages & features

1. **Upload** — COMPLETE ✓
   - Standalone `/upload` page **removed** — upload is now inline everywhere
   - Sidebar "Upload statement" button: on dashboard triggers dashboard's own file input (with banner status pill); on other pages triggers sidebar's own file input + GIF overlay
   - Both paths POST multipart/form-data to FastAPI `/upload`
   - Transactions page empty state also has "Upload a PDF to get started →" button wired to file input

2. **Dashboard** — COMPLETE ✓
   - Stat cards: current month true spend (CountUp), vs last month delta, top category, transaction count
   - Animated GIF banner (`/banner.gif`) — Notion-style, scrolls away as you scroll down
   - Sidebar sticky on left; content scrollable on right
   - **Layout (2-column below stat cards):**
     - Left (3/5): `SpendingChart` (6-month area) stacked above `NetAccumulatedChart` (cumulative income − spending area, emerald green)
     - Right (2/5): `CategoryDonut` (this month) stacked above `RecentTransactions` (compact, 5 rows)
   - `NetAccumulatedChart` — cumulative `(income − true spending)` over 6 months; answers "how much have I not consumed?"
   - Components: `StatCards`, `SpendingChart`, `NetAccumulatedChart`, `CategoryDonut`, `RecentTransactions` in `frontend/src/components/dashboard/`

3. **Transactions page** — COMPLETE ✓
   - `PageBanner` with title="Transactions"; "Add Transaction" button in banner's `right` slot (glass style)
   - Full transaction table with dual-calendar date range picker + search + category + account filters
   - Click any row → edit modal (description + category → Supabase `UPDATE WHERE id = ?`)
   - Edit works correctly — `transactions_id` was renamed to `id` in Supabase; frontend filters by UUID primary key so only the clicked row updates
   - Add manual transaction modal (date, description, amount, type, category, account → Supabase INSERT)
   - Upload inline from empty state or sidebar
   - Animated rows (Framer Motion slide-in); transaction count footer
   - `components/DateRangePicker.tsx` — range picker with presets + dual calendar
   - `components/SingleDatePicker.tsx` — single date picker: type MM/DD/YYYY or click calendar icon
   - `react-day-picker@9` + `date-fns` installed; `.rdp-root` CSS overrides in `globals.css`

4. **Spending Trends** — COMPLETE ✓
   - `PageBanner` with title="Spending Trends"; year selector in banner's `right` slot (glass style)
   - Quarter filter tabs: All / Q1 / Q2 / Q3 / Q4
   - Summary cards: Total Income / Total Expenses / Net for selected period
   - Stacked bar chart by category (Recharts) — only renders bars for categories with actual spend
   - Month-by-month cards grid: income / expenses / net per month
   - Expense totals exclude transfer categories (Investment, Internal Transfers, Credit Card Payment)
   - Future months auto-hidden for current year

5. **Forecasting** — TODO
   - Project end-of-month spend based on daily average so far (client-side math for v1)
   - Category-level projections
   - Can upgrade to a FastAPI `/forecast` endpoint later (pandas rolling average)

6. **Budgets** *(requires new Supabase `budgets` table)*

7. **User-level category override cache** *(Option B — future)*
   - New Supabase table: `user_category_overrides(user_id, cleaned_description, category)`
   - At upload time: check user overrides first → shared `merchant_categories` cache → Groq
   - Currently (Option A): edits just `UPDATE transactions SET category = ? WHERE id = ?` on the specific row only. Works correctly — `id` is the UUID primary key (`transactions_id` was renamed to `id` in Supabase to match frontend expectations).

### FastAPI `/upload` endpoint (api.py) — COMPLETE ✓
- Accepts: `multipart/form-data` (`file: UploadFile`, `user_id: Form(...)`)
- Saves to `tempfile.NamedTemporaryFile` → calls `upload_transactions(tmp_path, user_id)` → `os.remove()` in `finally`
- Returns: `{ statement_id, account_id, account_name, inserted, skipped }`
- CORS configured for `http://localhost:3000`
- `GET /` redirects to `/docs` (Swagger UI for manual testing)
- Run with: `python -m uvicorn api:app --reload` (use `-m` flag on Windows — PATH issue)
- Test at: `http://127.0.0.1:8000/docs`
- Processing is synchronous — large statements take 5-15s; acceptable for personal tool

### Category colors (CategoryDonut.tsx)
```
Food & Drink        #f97316  orange
Groceries           #10b981  emerald
Shopping            #f59e0b  amber
Travel              #06b6d4  cyan
Bills & Utilities   #6366f1  indigo
Entertainment       #8b5cf6  violet
Health and Wellness #ec4899  pink
Investment          #14b8a6  teal
Internal Transfers  #64748b  slate
Credit Card Payment #94a3b8  light slate
Income              #22c55e  green
Uncategorized       #d1d5db  gray
Personal (legacy)   #6b7280  gray (kept for existing data)
```

### Out of scope (no data source)
- Recurring charge detection (would need pattern detection algorithm)
- Net worth (no investment/asset data)
- Credit score (third-party API required)

The full request flow:
```
User clicks Upload statement
  → file picker opens
  → POST /upload (multipart form) to FastAPI
  → FastAPI saves temp file
  → parse_pdf() → categorize_dataframe() → upload_transactions()
  → returns { inserted: 47, skipped: false, account_name: "Chase Sapphire ****1333" }
  → GIF overlay hides, page reloads
```
