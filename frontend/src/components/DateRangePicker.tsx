'use client'
import { useState, useRef, useEffect } from 'react'
import { DayPicker } from 'react-day-picker'
import type { DateRange } from 'react-day-picker'
import 'react-day-picker/style.css'
import { CalendarDays, ChevronDown } from 'lucide-react'
import { format, subDays, subMonths, subYears } from 'date-fns'

export type DateRangeValue = { from: Date | null; to: Date | null }

const PRESETS = [
  { label: 'Last 30 Days',  getRange: () => ({ from: subDays(new Date(), 30),   to: new Date() }) },
  { label: 'Last 3 Months', getRange: () => ({ from: subMonths(new Date(), 3),   to: new Date() }) },
  { label: 'Last 6 Months', getRange: () => ({ from: subMonths(new Date(), 6),   to: new Date() }) },
  { label: 'Last Year',     getRange: () => ({ from: subYears(new Date(), 1),    to: new Date() }) },
  { label: 'All Time',      getRange: () => ({ from: null, to: null }) },
]

interface DateRangePickerProps {
  value: DateRangeValue
  onChange: (v: DateRangeValue) => void
}

function fmt(d: Date | null) {
  return d ? format(d, 'M/d/yyyy') : ''
}

export default function DateRangePicker({ value, onChange }: DateRangePickerProps) {
  const [open, setOpen]           = useState(false)
  const [draft, setDraft]         = useState<DateRangeValue>(value)
  const [activePreset, setActive] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function openPicker() {
    setDraft(value)
    setActive(null)
    setOpen(true)
  }

  function applyPreset(preset: (typeof PRESETS)[number]) {
    const r = preset.getRange()
    setDraft(r)
    setActive(preset.label)
  }

  function apply() {
    onChange(draft)
    setOpen(false)
  }

  function cancel() {
    setDraft(value)
    setOpen(false)
  }

  const rdpSelected: DateRange = {
    from: draft.from ?? undefined,
    to:   draft.to   ?? undefined,
  }

  function handleRdpSelect(range: DateRange | undefined) {
    setDraft({ from: range?.from ?? null, to: range?.to ?? null })
    setActive(null)
  }

  // Label shown on trigger button
  const label = (() => {
    if (!value.from && !value.to) return 'All time'
    if (value.from && value.to)   return `${fmt(value.from)} – ${fmt(value.to)}`
    if (value.from)               return `From ${fmt(value.from)}`
    return 'Select date range'
  })()

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        onClick={openPicker}
        className="flex items-center gap-2 text-sm text-gray-700 bg-white border border-gray-200 rounded-lg px-3 py-1.5 hover:border-indigo-300 transition-colors"
      >
        <CalendarDays size={14} className="text-gray-400" />
        <span>{label}</span>
        <ChevronDown size={13} className="text-gray-400" />
      </button>

      {/* Popover */}
      {open && (
        <div className="absolute left-0 top-full mt-2 z-50 bg-white rounded-2xl shadow-xl border border-gray-200 flex overflow-hidden"
          style={{ minWidth: 620 }}
        >
          {/* Calendar */}
          <div className="p-4 border-r border-gray-100">
            {/* From / To display */}
            <div className="flex items-center gap-3 mb-3">
              <div className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 bg-gray-50">
                <span className="text-xs text-gray-400 mr-2">From</span>
                {fmt(draft.from) || <span className="text-gray-300">—</span>}
              </div>
              <div className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 bg-gray-50">
                <span className="text-xs text-gray-400 mr-2">To</span>
                {fmt(draft.to) || <span className="text-gray-300">—</span>}
              </div>
            </div>

            <DayPicker
              mode="range"
              numberOfMonths={2}
              selected={rdpSelected}
              onSelect={handleRdpSelect}
            />
          </div>

          {/* Presets + actions */}
          <div className="flex flex-col justify-between p-4 w-40 shrink-0">
            <div className="space-y-1">
              {PRESETS.map(p => (
                <button
                  key={p.label}
                  onClick={() => applyPreset(p)}
                  className={`w-full text-left text-sm px-3 py-1.5 rounded-lg transition-colors ${
                    activePreset === p.label
                      ? 'bg-indigo-600 text-white'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-2 mt-4">
              <button
                onClick={apply}
                className="w-full text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg py-1.5 transition-colors"
              >
                Apply
              </button>
              <button
                onClick={cancel}
                className="w-full text-sm text-gray-500 hover:text-gray-700 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
