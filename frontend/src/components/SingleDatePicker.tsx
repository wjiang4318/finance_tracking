'use client'
import { useState, useRef, useEffect } from 'react'
import { DayPicker } from 'react-day-picker'
import 'react-day-picker/style.css'
import { CalendarDays } from 'lucide-react'
import { format, parse, isValid } from 'date-fns'

interface SingleDatePickerProps {
  value: string        // ISO date string: 'YYYY-MM-DD'
  onChange: (val: string) => void
  className?: string
}

function toDisplay(iso: string): string {
  if (!iso) return ''
  const d = parse(iso, 'yyyy-MM-dd', new Date())
  return isValid(d) ? format(d, 'MM/dd/yyyy') : iso
}

function fromDisplay(display: string): string | null {
  // Accept MM/DD/YYYY or YYYY-MM-DD
  const fmts = ['MM/dd/yyyy', 'M/d/yyyy', 'yyyy-MM-dd']
  for (const f of fmts) {
    const d = parse(display, f, new Date())
    if (isValid(d)) return format(d, 'yyyy-MM-dd')
  }
  return null
}

export default function SingleDatePicker({ value, onChange, className }: SingleDatePickerProps) {
  const [open, setOpen]         = useState(false)
  const [typed, setTyped]       = useState(toDisplay(value))
  const ref = useRef<HTMLDivElement>(null)

  // Keep typed in sync when value changes externally (e.g. calendar select)
  useEffect(() => { setTyped(toDisplay(value)) }, [value])

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function handleTyped(raw: string) {
    setTyped(raw)
    const iso = fromDisplay(raw)
    if (iso) onChange(iso)
  }

  function handleBlur() {
    // On blur, reformat what the user typed if it parsed successfully
    const iso = fromDisplay(typed)
    if (iso) setTyped(toDisplay(iso))
    else setTyped(toDisplay(value)) // revert to last valid
  }

  function handleCalendarSelect(day: Date | undefined) {
    if (day) {
      const iso = format(day, 'yyyy-MM-dd')
      onChange(iso)
      setOpen(false)
    }
  }

  const selected = value ? parse(value, 'yyyy-MM-dd', new Date()) : undefined

  return (
    <div ref={ref} className={`relative ${className ?? ''}`}>
      <div className="flex items-center border border-gray-200 rounded-lg bg-white hover:border-indigo-300 focus-within:ring-2 focus-within:ring-indigo-200 transition-colors">
        <input
          type="text"
          placeholder="MM/DD/YYYY"
          value={typed}
          onChange={e => handleTyped(e.target.value)}
          onBlur={handleBlur}
          className="flex-1 px-3 py-2 text-sm text-gray-700 bg-transparent focus:outline-none"
        />
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          className="px-2.5 text-gray-400 hover:text-indigo-500 transition-colors"
        >
          <CalendarDays size={15} />
        </button>
      </div>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 bg-white rounded-xl shadow-xl border border-gray-200 p-2">
          <DayPicker
            mode="single"
            selected={selected && isValid(selected) ? selected : undefined}
            onSelect={handleCalendarSelect}
            defaultMonth={selected && isValid(selected) ? selected : new Date()}
          />
        </div>
      )}
    </div>
  )
}
