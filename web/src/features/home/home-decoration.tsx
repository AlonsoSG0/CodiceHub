export function HomeDecoration() {
  return (
    <svg
      data-home-decoration
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 1200 800"
      preserveAspectRatio="xMidYMid slice"
    >
      <g fill="none" stroke="rgba(219,122,252,.22)" strokeWidth="1">
        <path d="M-80 245 C 100 60, 310 65, 460 160" />
        <path d="M740 115 C 900 40, 1110 110, 1280 300" />
        <path d="M-40 620 C 160 740, 320 715, 410 650" />
        <path d="M800 650 C 950 730, 1110 690, 1260 540" />
      </g>
      <g style={{ filter: "drop-shadow(0 0 5px rgba(251,66,219,.3))" }}>
        <circle cx="180" cy="124" r="3" fill="#b56af8" />
        <circle cx="990" cy="116" r="3" fill="#db7afc" />
        <circle cx="230" cy="696" r="2.5" fill="#fb42db" />
        <circle cx="1020" cy="694" r="2.5" fill="#fc5aa2" />
      </g>
    </svg>
  )
}
