import logging
import os
from datetime import date, datetime
from typing import Optional

from dotenv import load_dotenv
from supabase import Client, create_client

logger = logging.getLogger(__name__)

load_dotenv()

# ---------------------------------------------------------------------------
# Supabase client
# ---------------------------------------------------------------------------

_client: Client | None = None

def get_client() -> Client:
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


def parse_date(date_str: str, year: int, reference_end: Optional[date] = None) -> Optional[date]:
    """
    Parse 'Oct 3' or '10/3' style strings into a date with the given year.
    If the result lands after reference_end (statement period end), the transaction
    must be from the prior year — e.g. a Dec 30 txn in a Dec–Jan statement.
    """
    if not date_str or str(date_str).lower() in ("nan", "none", ""):
        return None
    date_str = str(date_str).strip()
    for fmt in _DATE_FORMATS:
        try:
            parsed = datetime.strptime(date_str, fmt)
            result = parsed.replace(year=year).date()
            if reference_end and result > reference_end:
                result = result.replace(year=year - 1)
            return result
        except ValueError:
            continue
    return None


# ---------------------------------------------------------------------------
# Amount / type helpers
# ---------------------------------------------------------------------------

def to_type(amount: float) -> str:
    """Negative amounts are credits (payments/refunds); positive are debits (purchases)."""
    return "credit" if amount < 0 else "debit"


# ---------------------------------------------------------------------------
# Account / statement helpers
# ---------------------------------------------------------------------------

def get_or_create_account(
    client: Client,
    user_id: str,
    account_name: str,
    account_type: str,
    last_four: Optional[str] = None,
) -> str:
    """Return the UUID of the account, creating it if it doesn't exist."""
    query = client.table("accounts").select("bank_acc_id").eq("user_id", user_id)
    query = query.eq("last_four", last_four) if last_four else query.eq("account_name", account_name)
    res = query.execute()

    if res.data:
        acc_id = res.data[0]["bank_acc_id"]
        logger.info("Account exists: %s (%s)", account_name, acc_id)
        return acc_id

    res = client.table("accounts").insert({
        "user_id": user_id,
        "account_name": account_name,
        "account_type": account_type,
        "last_four": last_four,
    }).execute()
    acc_id = res.data[0]["bank_acc_id"]
    logger.info("Created account: %s (%s)", account_name, acc_id)
    return acc_id


def create_statement(
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


def statement_exists(client: Client, file_hash: str) -> Optional[str]:
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
    client = get_client()
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
    get_client().table("merchant_categories").upsert([
        {"description": desc, "category": cat}
        for desc, cat in items.items()
    ]).execute()


def get_user_category_overrides_bulk(user_id: str, descriptions: list[str]) -> dict[str, str]:
    """Fetch user-specific category overrides for a list of cleaned descriptions."""
    if not descriptions or not user_id:
        return {}
    res = (
        get_client().table("user_category_overrides")
        .select("cleaned_description, category")
        .eq("user_id", user_id)
        .in_("cleaned_description", descriptions)
        .execute()
    )
    return {row["cleaned_description"]: row["category"] for row in res.data}


def upsert_user_category_override(user_id: str, cleaned_description: str, category: str) -> None:
    """Save or update a user's permanent category preference for a merchant."""
    get_client().table("user_category_overrides").upsert({
        "user_id": user_id,
        "cleaned_description": cleaned_description,
        "category": category,
    }).execute()
