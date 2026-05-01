import hashlib
import os
import re
from datetime import date, datetime

import pandas as pd
from dotenv import load_dotenv
from supabase import Client, create_client

load_dotenv()

# ---------------------------------------------------------------------------
# Supabase client
# ---------------------------------------------------------------------------

def _get_client() -> Client:
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_KEY"]  # service role key bypasses RLS for local uploads
    return create_client(url, key)

# ---------------------------------------------------------------------------
# Account / statement helpers
# ---------------------------------------------------------------------------

def _get_or_create_account(
    client: Client,
    user_id: str,
    account_name: str,
    account_type: str,
    institution_name: str,
) -> str:
    """Return the UUID of the account, creating it if it doesn't exist."""
    res = (
        client.table("accounts")
        .select("id")
        .eq("user_id", user_id)
        .eq("account_name", account_name)
        .execute()
    )
    if res.data:
        return res.data[0]["id"]
    res = client.table("accounts").insert({
        "user_id": user_id,
        "account_name": account_name,
        "account_type": account_type,
        "institution_name": institution_name,
    }).execute()
    return res.data[0]["id"]



