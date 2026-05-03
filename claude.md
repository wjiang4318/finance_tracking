# Project
finance-tracker — a personal finance app that ingests bank/credit card PDF statements, categorizes transactions with an LLM, and stores everything in Supabase. Goal: a visually engaging UI.

## Architecture

```
pipeline/pdf_parser.py      — parses PDFs into a DataFrame + metadata dict
pipeline/categorizer.py     — Groq-based categorizer with a Supabase merchant cache
database/connector.py       — uploads parsed/categorized data to Supabase
tests/main.py               — manual end-to-end runner (parse → categorize → upload)
tests/test_parsers.py       — parser unit tests
api.py                      — (planned) FastAPI wrapper: POST a PDF, trigger pipeline
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
- **Supabase JS client** — direct DB reads from browser (no API layer needed for dashboard)
- **FastAPI** (`api.py`) — only needed for PDF upload endpoint

### Data flow
```
Browser
  ├── dashboard/transactions/accounts reads → Supabase JS client (direct)
  └── POST /upload PDF                      → FastAPI → pipeline → Supabase
```

### Pages & features (in build order)

1. **Upload page** — build first, everything else depends on having data
   - Drag-and-drop zone (react-dropzone) + "Select PDF" button
   - Four UI states: Idle → Uploading (spinner, ~5-15s) → Success ("47 transactions imported from Chase Sapphire ****1333") → Error
   - POSTs multipart/form-data to FastAPI `/upload`

2. **Dashboard** — main "wow" screen
   - Current month total spend + comparison to last month
   - Spending over time area chart (like Rocket Money)
   - Category breakdown (pie/donut)
   - Recent transactions list

3. **Transactions page**
   - Full transaction history table
   - Time filter buttons: 1M / 3M / 6M / 1Y / All (adjusts Supabase query date range)
   - Filter by category, account
   - Search by merchant name

4. **Spending trends** — month-over-month per category charts

5. **Forecasting**
   - Project end-of-month spend based on daily average so far (client-side math for v1)
   - Category-level projections
   - Can upgrade to a FastAPI `/forecast` endpoint later (pandas rolling average)

6. **Budgets** *(requires new Supabase `budgets` table)*

### FastAPI `/upload` endpoint (api.py)
- Accepts: `multipart/form-data` (PDF file + user_id)
- Saves to temp file → calls `upload_transactions(tmp_path, user_id)` → deletes temp file
- Returns: `{ inserted, skipped, account_name, statement_id }`
- Must configure CORS to allow Next.js dev server (localhost:3000 → localhost:8000)
- Processing is synchronous — large statements take 5-15s; acceptable for personal tool

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