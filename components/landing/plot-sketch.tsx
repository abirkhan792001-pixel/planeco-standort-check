/** The page's signature: a line-art site plan (parcel, neighbours, street, house, pin, north arrow, dimension). */
export function PlotSketch({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 480 400" role="img" aria-label="Skizze eines Grundstücks mit Standort-Markierung" className={className}
      fill="none" strokeLinecap="round" strokeLinejoin="round">
      {/* street */}
      <path d="M0 352 C150 326 320 378 480 336" className="stroke-ink/10" strokeWidth="18" />
      {/* neighbouring parcel lines */}
      <g className="stroke-muted/60" strokeWidth="1.5" strokeDasharray="6 7">
        <path d="M110 130 L70 30" />
        <path d="M110 130 L20 150 L35 330" />
        <path d="M310 95 L330 15" />
        <path d="M310 95 L455 75 L470 215 L380 250" />
        <path d="M150 300 L130 345" />
        <path d="M380 250 L400 330" />
      </g>
      {/* the parcel */}
      <path d="M110 130 L310 95 L380 250 L150 300 Z" pathLength={1} className="plot-draw fill-paper stroke-ink" strokeWidth="2.5" />
      <text x="128" y="152" transform="rotate(-9.9 128 152)" className="fill-muted text-[11px] font-medium tracking-[0.18em]">FLURSTÜCK</text>
      {/* dimension line along the street side */}
      <g className="stroke-ink/60" strokeWidth="1.2">
        <path d="M155 321 L385 271" />
        <path d="M153 315 L157 327 M383 265 L387 277" />
      </g>
      <text x="262" y="312" transform="rotate(-12.3 262 312)" className="fill-ink text-[12px] font-medium">ca. 32 m</text>
      {/* house */}
      <rect x="178" y="210" width="64" height="50" className="fill-salmon stroke-ink" strokeWidth="2" />
      <path d="M170 215 L210 182 L250 215" className="stroke-ink" strokeWidth="2" />
      <rect x="189" y="222" width="14" height="12" className="fill-paper stroke-ink" strokeWidth="1.5" />
      <rect x="216" y="232" width="14" height="28" className="fill-ink" />
      {/* trees */}
      <circle cx="420" cy="160" r="22" className="fill-salmon/50 stroke-ink" strokeWidth="2" />
      <path d="M420 182 V200" className="stroke-ink" strokeWidth="2" />
      <circle cx="62" cy="226" r="15" className="fill-salmon/50 stroke-ink" strokeWidth="2" />
      <path d="M62 241 V254" className="stroke-ink" strokeWidth="2" />
      {/* location pin */}
      <ellipse cx="315" cy="190" rx="14" ry="4" className="fill-ink/15" />
      <path d="M315 187 C315 187 290 162 290 145 A25 25 0 1 1 340 145 C340 162 315 187 315 187 Z" className="fill-terracotta stroke-ink" strokeWidth="2" />
      <circle cx="315" cy="145" r="8" className="fill-cream stroke-ink" strokeWidth="1.5" />
      {/* north arrow */}
      <path d="M440 20 L450 48 L440 42 L430 48 Z" className="fill-ink" />
      <text x="435" y="68" className="fill-ink text-[13px] font-semibold">N</text>
    </svg>
  );
}
