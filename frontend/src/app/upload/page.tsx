"use client"
// "use client" → this component runs in the browser, not on the server.
// Required because we use React hooks (useState, useCallback) and browser APIs (fetch, FormData).

import { useState, useCallback } from "react"
// useState   → tracks changing values (selected file, upload state, error message, result)
// useCallback → memoizes the onDrop function so react-dropzone doesn't get a new reference on every render

import { useRouter } from "next/navigation"
// useRouter → lets us redirect the user programmatically (to /dashboard after success)

import { useDropzone } from "react-dropzone"
// useDropzone → the core hook from react-dropzone. Returns props to attach to a div
// so it becomes a drag-and-drop zone + click-to-browse file picker.

import { createClient } from "@/utils/supabase/client"
// Our browser Supabase client — we call supabase.auth.getSession() to get the logged-in user's ID.
// The user_id must be sent to FastAPI so it knows which Supabase account to store transactions under.

// ---------------------------------------------------------------------------
// Type: the six possible states of the upload flow
// ---------------------------------------------------------------------------
// We use a string union instead of a boolean so each state maps to exactly one UI panel.
// This avoids messy if/else chains like "if uploading && !success && !error..."
type UploadState = "idle" | "uploading" | "success" | "duplicate" | "error"

// ---------------------------------------------------------------------------
// Type: the shape of the JSON response from FastAPI POST /upload
// ---------------------------------------------------------------------------
type UploadResult = {
  statement_id: string   // UUID of the statement row created in Supabase
  account_id: string     // UUID of the account row (bank card)
  account_name: string   // e.g. "Chase Sapphire ****1333"
  inserted: number       // how many transaction rows were inserted
  skipped: boolean       // true if this PDF was already uploaded before
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function UploadPage() {
  // --- State ---
  const [file, setFile]               = useState<File | null>(null)
  // file → the PDF the user picked. null means nothing selected yet.

  const [uploadState, setUploadState] = useState<UploadState>("idle")
  // uploadState → drives which UI panel is shown (idle / uploading / success / duplicate / error)

  const [result, setResult]           = useState<UploadResult | null>(null)
  // result → stores the FastAPI response so the success panel can display "47 transactions from Chase..."

  const [errorMsg, setErrorMsg]       = useState("")
  // errorMsg → stores the human-readable error string shown in the error panel

  const router   = useRouter()
  const supabase = createClient()

  // -------------------------------------------------------------------------
  // onDrop: called by react-dropzone when the user drops a file or clicks to browse
  // -------------------------------------------------------------------------
  const onDrop = useCallback((acceptedFiles: File[]) => {
    const pdf = acceptedFiles[0]
    if (!pdf) return

    // Store the selected file and reset any previous upload attempt
    setFile(pdf)
    setUploadState("idle")  // go back to idle so the Upload button appears
    setResult(null)
    setErrorMsg("")
  }, [])
  // useCallback with [] means this function is created once and reused — avoids
  // react-dropzone seeing a "new" callback on every render and re-subscribing.

  // -------------------------------------------------------------------------
  // Set up the dropzone
  // -------------------------------------------------------------------------
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [".pdf"] },
    // accept → only allow PDF files; other file types are silently rejected
    maxFiles: 1,
    // maxFiles: 1 → only process the first dropped file (ignore multi-file drops)
  })

  // -------------------------------------------------------------------------
  // handleUpload: POSTs the PDF to FastAPI when the user clicks "Upload"
  // -------------------------------------------------------------------------
  async function handleUpload() {
    if (!file) return

    setUploadState("uploading")

    // 1. Get the logged-in user's ID from the Supabase session cookie
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      // Session expired or user is not logged in → send them back to login
      router.push("/login")
      return
    }

    // 2. Build multipart/form-data
    //    FastAPI expects: file (the PDF binary) + user_id (text field)
    const formData = new FormData()
    formData.append("file", file)              // the PDF blob
    formData.append("user_id", session.user.id) // Supabase UUID of the logged-in user

    try {
      // 3. Send the request to FastAPI (running on port 8000 in development)
      const res = await fetch("http://localhost:8000/upload", {
        method: "POST",
        body: formData,
        // Don't set Content-Type manually — the browser sets it automatically
        // with the correct multipart boundary when using FormData.
      })

      if (!res.ok) {
        // FastAPI returned a 4xx or 5xx status → parse the detail field if available
        const errBody = await res.json().catch(() => ({}))
        throw new Error(errBody.detail || `Server error ${res.status}`)
      }

      // 4. Parse the JSON response
      const data: UploadResult = await res.json()
      // data = { statement_id, account_id, account_name, inserted, skipped }

      setResult(data)

      if (data.skipped) {
        // This exact PDF was already uploaded before (detected via SHA-256 hash)
        setUploadState("duplicate")
      } else {
        setUploadState("success")
        // Redirect to dashboard after 2s so the user sees the success message briefly
        setTimeout(() => router.push("/dashboard"), 2000)
      }
    } catch (err: unknown) {
      // Network error, JSON parse failure, or a thrown Error from above
      const message = err instanceof Error ? err.message : "Something went wrong"
      setErrorMsg(message)
      setUploadState("error")
    }
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  function resetToIdle() {
    // Called by "Try again" button — clears the file and error so the user can start over
    setFile(null)
    setUploadState("idle")
    setErrorMsg("")
    setResult(null)
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    // Full-page centred layout — matches the login page style
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-sm border border-gray-100 p-8">

        {/* Page title */}
        <h1 className="text-2xl font-semibold text-gray-900 mb-1">Upload statement</h1>
        <p className="text-sm text-gray-500 mb-6">
          Drop a PDF bank or credit card statement to import transactions.
        </p>

        {/* ----------------------------------------------------------------
            UPLOADING STATE
            Shown while the fetch is in progress (typically 5–15 seconds).
        ---------------------------------------------------------------- */}
        {uploadState === "uploading" && (
          <div className="flex flex-col items-center py-12 gap-4">
            {/* Tailwind spinner: a div with a border that spins */}
            <div className="w-10 h-10 rounded-full border-4 border-blue-100 border-t-blue-600 animate-spin" />
            <p className="text-sm text-gray-500">Processing… this usually takes 10–15 seconds</p>
          </div>
        )}

        {/* ----------------------------------------------------------------
            SUCCESS STATE
            Shown after a successful upload. Auto-redirects to /dashboard.
        ---------------------------------------------------------------- */}
        {uploadState === "success" && result && (
          <div className="flex flex-col items-center py-10 gap-3 text-center">
            {/* Green circle with a checkmark */}
            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
              <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-base font-medium text-gray-900">
              {result.inserted} transaction{result.inserted !== 1 ? "s" : ""} imported
            </p>
            {/* Shows the account name e.g. "Chase Sapphire ****1333" */}
            <p className="text-sm text-gray-500">from {result.account_name}</p>
            <p className="text-xs text-gray-400 mt-1">Redirecting to dashboard…</p>
          </div>
        )}

        {/* ----------------------------------------------------------------
            DUPLICATE STATE
            Shown when the PDF was already uploaded (same SHA-256 hash).
        ---------------------------------------------------------------- */}
        {uploadState === "duplicate" && result && (
          <div className="flex flex-col items-center py-10 gap-3 text-center">
            {/* Yellow circle with a warning icon */}
            <div className="w-12 h-12 rounded-full bg-yellow-100 flex items-center justify-center">
              <svg className="w-6 h-6 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
            </div>
            <p className="text-base font-medium text-gray-900">Already uploaded</p>
            <p className="text-sm text-gray-500">
              This statement from {result.account_name} was already imported — no duplicates added.
            </p>
            <button
              onClick={resetToIdle}
              className="mt-2 text-sm text-blue-600 hover:underline"
            >
              Upload a different file
            </button>
          </div>
        )}

        {/* ----------------------------------------------------------------
            ERROR STATE
            Shown when the fetch fails or FastAPI returns an error.
        ---------------------------------------------------------------- */}
        {uploadState === "error" && (
          <div className="flex flex-col items-center py-10 gap-3 text-center">
            {/* Red circle with an X */}
            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
              <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <p className="text-base font-medium text-gray-900">Something went wrong</p>
            {/* errorMsg contains the FastAPI detail string or a network error */}
            <p className="text-sm text-red-500">{errorMsg}</p>
            <button
              onClick={resetToIdle}
              className="mt-2 text-sm text-blue-600 hover:underline"
            >
              Try again
            </button>
          </div>
        )}

        {/* ----------------------------------------------------------------
            IDLE STATE
            The default view: drag-and-drop zone + optional upload button.
            Hidden while any other state is active.
        ---------------------------------------------------------------- */}
        {(uploadState === "idle") && (
          <>
            {/* --- Drop zone ---
                getRootProps() attaches the click handler and drag event listeners.
                getInputProps() wires up the hidden <input type="file"> inside the div.
                isDragActive → true while a file is being dragged over the zone.
            */}
            <div
              {...getRootProps()}
              className={`
                flex flex-col items-center justify-center gap-3
                border-2 border-dashed rounded-xl px-6 py-12 cursor-pointer
                transition-colors
                ${isDragActive
                  ? "border-blue-400 bg-blue-50"   // highlight on drag-over
                  : "border-gray-200 bg-gray-50 hover:border-gray-300 hover:bg-gray-100"
                }
              `}
            >
              {/* Hidden file input — react-dropzone manages it for us */}
              <input {...getInputProps()} />

              {/* Upload icon */}
              <div className="w-10 h-10 rounded-full bg-white border border-gray-200 flex items-center justify-center shadow-sm">
                <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
              </div>

              {/* Instruction text — changes while dragging */}
              {isDragActive ? (
                <p className="text-sm font-medium text-blue-600">Drop it here</p>
              ) : (
                <>
                  <p className="text-sm font-medium text-gray-700">
                    Drag &amp; drop your PDF here
                  </p>
                  <p className="text-xs text-gray-400">or click to browse</p>
                </>
              )}
            </div>

            {/* --- File selected feedback + Upload button ---
                Only shown once the user has picked a file.
                Before that, the Upload button is hidden entirely (not just disabled)
                so the UI doesn't look broken on first load.
            */}
            {file && (
              <div className="mt-4 flex flex-col gap-3">
                {/* Show the selected filename in a subtle pill */}
                <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg border border-gray-200">
                  {/* PDF icon */}
                  <svg className="w-4 h-4 text-red-400 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                  </svg>
                  {/* file.name is the original filename from the user's disk */}
                  <span className="text-sm text-gray-700 truncate">{file.name}</span>
                </div>

                {/* Upload button — triggers the fetch to FastAPI */}
                <button
                  onClick={handleUpload}
                  className="w-full py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                >
                  Upload
                </button>
              </div>
            )}
          </>
        )}

      </div>
    </div>
  )
}
