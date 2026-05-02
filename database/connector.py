import os
import re
from datetime import date, datetime
from typing import Optional

import pandas as pd
from dotenv import load_dotenv
from supabase import Client, create_client

load_dotenv()

# ---------------------------------------------------------------------------
# Supabase client
# ---------------------------------------------------------------------------

_client: Client | None = None

def _get_client() -> Client:
    global _client
    if _client is None:
        _client = create_client(
            os.environ["SUPABASE_URL"],
            os.environ["SUPABASE_SERVICE_KEY"],  # service role key bypasses RLS for local uploads
        )
    return _client


# ---------------------------------------------------------------------------
# Date helpers
# ---------------------------------------------------------------------------

_DATE_FORMATS = ["%b %d", "%B %d", "%m/%d", "%m/%d/%Y", "%m/%d/%y"]


def _parse_date(date_str: str, year: int) -> Optional[date]:
    """
    Parse 'Oct 3' or '10/3' style strings into a date with the given year.
    Output would look like date(2024, 10, 3)
    Looks like: 2024-10-03
    """
    if not date_str or str(date_str).lower() in ("nan", "none", ""):
        return None
    date_str = str(date_str).strip()
    for fmt in _DATE_FORMATS:
        try:
            parsed = datetime.strptime(date_str, fmt)
            return parsed.replace(year=year).date()
        except ValueError:
            continue
    return None


# ---------------------------------------------------------------------------
# Amount / type helpers
# ---------------------------------------------------------------------------

def _to_type(amount: float) -> str:
    """Negative amounts are credits (payments/refunds); positive are debits (purchases)."""
    return "credit" if amount < 0 else "debit"


# ---------------------------------------------------------------------------
# Account / statement helpers
# ---------------------------------------------------------------------------

def _get_or_create_account(
    client: Client,
    user_id: str,
    account_name: str,
    account_type: str,
    last_four: Optional[str] = None,
) -> str:
    """Return the UUID of the account, creating it if it doesn't exist."""
    if last_four:
        res = (
            client.table("accounts")
            .select("bank_acc_id")
            .eq("user_id", user_id)
            .eq("last_four", last_four)
            .execute()
        )
    else:
        res = (
            client.table("accounts")
            .select("bank_acc_id")
            .eq("user_id", user_id)
            .eq("account_name", account_name)
            .execute()
        )

    if res.data:
        return res.data[0]["bank_acc_id"]

    res = client.table("accounts").insert({
        "user_id": user_id,
        "account_name": account_name,
        "account_type": account_type,
        "last_four": last_four,
    }).execute()
    return res.data[0]["bank_acc_id"]


def _create_statement(
    client: Client,
    user_id: str,
    account_id: str,
    filename: str,
    file_hash: str,
    storage_path: str,
    period_start: Optional[date],
    period_end: Optional[date],
) -> str:
    """Insert a statement record and return its UUID."""
    res = client.table("statements").insert({
        "user_id": user_id,
        "account_id": account_id,
        "filename": filename,
        "file_hash": file_hash,
        "storage_path": storage_path,
        "period_start": period_start.isoformat() if period_start else None,
        "period_end": period_end.isoformat() if period_end else None,
    }).execute()
    return res.data[0]["statements_id"]


def _statement_exists(client: Client, file_hash: str) -> Optional[str]:
    """Return statement UUID if this file content was already uploaded, else None."""
    res = (
        client.table("statements")
        .select("statements_id")
        .eq("file_hash", file_hash)
        .execute()
    )
    return res.data[0]["statements_id"] if res.data else None


# ---------------------------------------------------------------------------
# Merchant category cache
# ---------------------------------------------------------------------------

def get_cached_categories_bulk(descriptions: list[str]) -> dict[str, str]:
    """Single query to fetch all cached categories for a list of descriptions."""
    if not descriptions:
        return {}
    client = _get_client()
    res = (
        client.table("merchant_categories")
        .select("description, category")
        .in_("description", descriptions)
        .execute()
    )
    return {row["description"]: row["category"] for row in res.data}



def cache_categories_bulk(items: dict[str, str]) -> None:
    """Save multiple description → category mappings in a single upsert."""
    if not items:
        return
    _get_client().table("merchant_categories").upsert([
        {"description": desc, "category": cat}
        for desc, cat in items.items()
    ]).execute()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def upload_transactions(
    df: pd.DataFrame,
    user_id: str,
    account_name: str,
    account_type: str,
    pdf_filename: str,
    pdf_hash: str,
    last_four: Optional[str] = None,
    storage_path: str = "",
    period_start: Optional[str | date] = None,
    period_end: Optional[str | date] = None,
    skip_if_exists: bool = True,
) -> dict:
    """
    Transform a parser DataFrame and upload it to Supabase.

    Parameters
    ----------
    df              : DataFrame from extract_transactions()
    user_id         : Supabase auth UUID of the owning user
    account_name    : Human label, e.g. "Capital One Venture"
    account_type    : One of 'checking', 'savings', 'credit', 'investment'
    pdf_filename    : Original PDF filename (stored for display)
    pdf_hash        : SHA-256 hex digest of the file content (used for dedup)
    storage_path    : Optional Supabase Storage path if you uploaded the PDF
    period_start/end: Statement period — ISO string from parse_pdf() or date object
    skip_if_exists  : If True and this file hash was already uploaded, return
                    early without re-inserting.

    Returns
    -------
    dict with keys: statement_id, account_id, inserted, skipped
    """
    client = _get_client()

    def _to_date(d):
        if isinstance(d, str):
            return date.fromisoformat(d)
        return d

    period_start = _to_date(period_start)
    period_end   = _to_date(period_end)
    year = (period_end or period_start or date.today()).year

    # Account
    account_id = _get_or_create_account(
        client, user_id, account_name, account_type, last_four
    )

    # Dedup check
    if skip_if_exists:
        existing_id = _statement_exists(client, pdf_hash)
        if existing_id:
            return {
                "statement_id": existing_id,
                "account_id": account_id,
                "inserted": 0,
                "skipped": True,
            }

    # Statement
    statement_id = _create_statement(
        client, user_id, account_id, pdf_filename, pdf_hash, storage_path, period_start, period_end
    )

    # Build transaction rows
    rows = []
    for row in df.to_dict("records"):
        trans_date = _parse_date(row.get("trans_date"), year)
        if trans_date is None:
            continue  # skip rows with unparseable dates

        amount_raw = float(row["amount1"])
        category = row.get("category")

        rows.append({
            "statement_id": statement_id,
            "user_id": user_id,
            "date": trans_date.isoformat(),
            "description": str(row["description"]).strip(),
            "amount": abs(amount_raw),
            "type": _to_type(amount_raw),
            "category": category if pd.notna(category) and category != "" else None,
        })

    if rows:
        client.table("transactions").insert(rows).execute()

    return {
        "statement_id": statement_id,
        "account_id": account_id,
        "inserted": len(rows),
        "skipped": False,
    }
