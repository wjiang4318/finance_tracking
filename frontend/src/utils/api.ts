// Base URL for the FastAPI backend. Falls back to local dev if not set.
export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
