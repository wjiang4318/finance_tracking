"""
Top-level orchestrator: parse a PDF, categorize its transactions, and upload
everything to Supabase.

This is the one module that knows about both pipeline/ (parsing + categorizing)
and database/ (Supabase I/O) — neither of those layers depends on the other.
"""

import hashlib
import logging
import os
from datetime import date
from typing import Optional

import pandas as pd

from pipeline.pdf_parser import parse_pdf
from pipeline.categorizer import categorize_dataframe
from database.connector import (
    get_client,
    get_or_create_account,
    statement_exists,
    create_statement,
    parse_date,
    to_type,
)

logger = logging.getLogger(__name__)


def upload_transactions(
    pdf_path: str,
    user_id: str,
    df: Optional[pd.DataFrame] = None,
    skip_if_exists: bool = True,
    storage_path: str = "",
) -> dict:
    """
    Parse, categorize, and upload a bank PDF statement to Supabase.

    Parameters
    ----------
    pdf_path        : Path to the PDF file
    user_id         : Supabase auth UUID of the owning user
    df              : Optional pre-categorized transactions DataFrame; if omitted,
                    the PDF is parsed and transactions are auto-categorized
    skip_if_exists  : Skip upload if this file hash was already processed
    storage_path    : Optional Supabase Storage path if you uploaded the PDF

    Returns
    -------
    dict with keys: statement_id, account_id, account_name, inserted, skipped
    """
    parsed = parse_pdf(pdf_path)

    if df is None:
        df = categorize_dataframe(parsed["transactions"], user_id=user_id)

    pdf_hash     = hashlib.sha256(open(pdf_path, "rb").read()).hexdigest()
    pdf_filename = os.path.basename(pdf_path)
    account_name = f"{parsed['card_name']} ****{parsed['last_four']}"
    account_type = parsed["account_type"] or "credit"
    last_four    = parsed["last_four"]
    period_start = date.fromisoformat(parsed["period_start"]) if parsed["period_start"] else None
    period_end   = date.fromisoformat(parsed["period_end"])   if parsed["period_end"]   else None
    reference_end = period_end or period_start or date.today()
    year          = reference_end.year

    logger.info("Account: %s | Period: %s → %s", account_name, period_start, period_end)

    client = get_client()

    account_id = get_or_create_account(
        client, user_id, account_name, account_type, last_four
    )

    if skip_if_exists:
        existing_id = statement_exists(client, pdf_hash)
        if existing_id:
            logger.info("Already uploaded (statement %s), skipping.", existing_id)
            return {
                "statement_id": existing_id,
                "account_id": account_id,
                "account_name": account_name,
                "inserted": 0,
                "skipped": True,
            }

    statement_id = create_statement(
        client, user_id, account_id, pdf_filename, pdf_hash, storage_path, period_start, period_end
    )

    rows = []
    for row in df.to_dict("records"):
        trans_date = parse_date(row.get("trans_date"), year, reference_end)
        if trans_date is None:
            continue

        amount_raw = float(row["amount1"])
        category = row.get("category")

        rows.append({
            "statement_id": statement_id,
            "user_id": user_id,
            "date": trans_date.isoformat(),
            "description": str(row["description"]).strip(),
            "amount": abs(amount_raw),
            "type": to_type(amount_raw),
            "category": category if pd.notna(category) and category != "" else None,
        })

    if rows:
        client.table("transactions").insert(rows).execute()

    logger.info("Inserted %d transactions into statement %s", len(rows), statement_id)
    return {
        "statement_id": statement_id,
        "account_id": account_id,
        "account_name": account_name,
        "inserted": len(rows),
        "skipped": False,
    }
