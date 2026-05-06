import React from 'react'

type PageBannerProps = {
  eyebrow?: string
  title: string
  right?: React.ReactNode
}

export default function PageBanner({ eyebrow = 'Finance Tracker', title, right }: PageBannerProps) {
  return (
    <div className="relative h-52 w-full overflow-hidden bg-indigo-950">
      <img
        src="/banner.gif"
        alt=""
        className="w-full h-full object-cover object-[center_80%]"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-[#f4f4fb]/80 via-transparent to-transparent" />
      <div className="absolute bottom-5 left-6">
        <p className="text-[10px] font-semibold text-indigo-200 uppercase tracking-widest mb-0.5">
          {eyebrow}
        </p>
        <h1 className="text-2xl font-bold text-white drop-shadow-md">{title}</h1>
      </div>
      {right && (
        <div className="absolute top-3 right-5 flex items-center gap-2">
          {right}
        </div>
      )}
    </div>
  )
}
