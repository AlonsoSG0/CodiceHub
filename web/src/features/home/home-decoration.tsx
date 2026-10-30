import "@/styles/home-atripp.css"

// Each curve stays outside the clock's x=300–900, y=200–600 safe zone.
const backPaths = [
  "M-40 75 C35 85 80 150 165 155 S270 95 350 72",
  "M-30 260 C35 245 110 230 165 155 S235 30 310 -20",
  "M-25 425 C50 410 92 345 115 305 S205 230 285 215",
  "M35 620 C20 510 55 385 115 305 S215 260 280 275",
  "M-35 725 C30 690 102 665 175 685 S255 750 300 825",
  "M35 830 C70 765 105 715 175 685 S245 615 270 565",
  "M1230 45 C1135 45 1105 100 1025 125 S905 115 820 80",
  "M1240 230 C1160 220 1085 195 1025 125 S960 35 915 -20",
  "M1230 410 C1160 395 1120 340 1080 320 S985 275 935 250",
  "M1170 610 C1190 495 1145 375 1080 320 S985 305 935 335",
  "M1240 730 C1170 670 1105 640 1035 665 S960 745 920 825",
  "M1160 830 C1120 750 1090 690 1035 665 S960 610 930 565",
]

const frontPaths = [
  "M-30 190 C50 200 110 190 165 155 C350 10 780 15 1025 125 C1095 160 1175 175 1230 160",
  "M-25 520 C35 470 75 395 115 305 C150 245 220 205 290 190",
  "M1230 535 C1170 490 1130 400 1080 320 C1045 280 995 240 920 205",
]

const nodes = [
  [165, 155], [115, 305], [175, 685], [270, 565], [280, 275],
  [1025, 125], [1080, 320], [1035, 665], [930, 565], [935, 335],
]

export function HomeDecoration() {
  return (
    <svg
      data-home-decoration
      aria-hidden="true"
      focusable="false"
      className="home-orbit pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 1200 800"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient id="home-backdrop" x2="1" y2="1">
          <stop className="home-backdrop-start" />
          <stop offset=".52" className="home-backdrop-middle" />
          <stop offset="1" className="home-backdrop-end" />
        </linearGradient>
        <radialGradient id="home-violet"><stop className="home-violet-stop" /><stop offset="1" stopOpacity="0" /></radialGradient>
        <radialGradient id="home-magenta"><stop className="home-magenta-stop" /><stop offset="1" stopOpacity="0" /></radialGradient>
        <radialGradient id="home-coral"><stop className="home-coral-stop" /><stop offset="1" stopOpacity="0" /></radialGradient>
        <radialGradient id="home-centre"><stop className="home-centre-stop" /><stop offset="1" stopOpacity="0" /></radialGradient>
        <radialGradient id="home-halo"><stop className="home-halo-stop" /><stop offset="1" stopOpacity="0" /></radialGradient>
      </defs>
      <rect width="1200" height="800" fill="url(#home-backdrop)" />
      <g className="home-atmosphere">
        <ellipse className="home-mist home-mist-violet" cx="100" cy="180" rx="580" ry="500" fill="url(#home-violet)" />
        <ellipse className="home-mist home-mist-magenta" cx="1100" cy="90" rx="570" ry="470" fill="url(#home-magenta)" />
        <ellipse className="home-mist home-mist-coral" cx="1080" cy="770" rx="490" ry="420" fill="url(#home-coral)" />
      </g>
      <ellipse cx="600" cy="400" rx="500" ry="350" fill="url(#home-centre)" />
      <g className="home-paths home-paths-back">{backPaths.map((path) => <path key={path} d={path} />)}</g>
      <g className="home-paths home-paths-front">{frontPaths.map((path) => <path key={path} d={path} />)}</g>
      <g>{nodes.map(([x, y], i) => (
        <g key={`${x}-${y}`} className={`home-node home-node-${i + 1}`}>
          {(i === 0 || i === 2 || i === 5 || i === 7) && <circle cx={x} cy={y} r="19" fill="url(#home-halo)" />}
          <circle className="home-node-core" cx={x} cy={y} r={2 + (i % 3) * 0.5} />
        </g>
      ))}</g>
    </svg>
  )
}
