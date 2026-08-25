// Base URL for the FastAPI backend. Falls back to local dev if not set.
// (Touched to force a real rebuild — a build-cache issue was serving a stale
// bundle that still embedded an old NEXT_PUBLIC_API_URL value.)
export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
