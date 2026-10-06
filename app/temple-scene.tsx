// The "haunted temple workshop" behind every page: a shoji screen over a dim
// wooden bench, paper lanterns, hazard tape and stray wires, drifting dust and
// a vignette. Purely decorative. During a round the game sets --tension (0 to 1)
// and data-tension on <html>, so the lanterns flicker faster, the light turns
// warmer and redder, and in the last seconds the scene shakes slightly.
const DUST = Array.from({ length: 16 }, (_, index) => ({
  left: `${(index * 61 + 7) % 100}%`,
  top: `${(index * 37 + 13) % 100}%`,
  size: `${2 + (index % 3)}px`,
  duration: `${14 + (index % 5) * 4}s`,
  delay: `-${(index * 3.7) % 18}s`,
}));

function Lantern({ side }: { side: "left" | "right" }) {
  return (
    <div className={`temple-lantern temple-lantern-${side}`}>
      <span className="temple-lantern-cord" />
      <span className="temple-lantern-glow" />
      <svg viewBox="0 0 80 120" aria-hidden="true">
        <rect x="26" y="4" width="28" height="9" rx="2" fill="#1c1a1f" />
        <ellipse cx="40" cy="60" rx="34" ry="46" fill="#d7341f" />
        <ellipse className="temple-lantern-light" cx="40" cy="58" rx="22" ry="34" fill="#f0b442" />
        <path d="M8 44h64M6 60h68M8 76h64M14 30h52M14 90h52" stroke="#8a1f12" strokeWidth="2" opacity=".65" fill="none" />
        <path d="M40 14v92" stroke="#8a1f12" strokeWidth="1.5" opacity=".4" />
        <rect x="26" y="104" width="28" height="9" rx="2" fill="#1c1a1f" />
        <path d="M36 113v6M40 113v7M44 113v6" stroke="#f0b442" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </div>
  );
}

export function TempleScene() {
  return (
    <div className="temple-scene" aria-hidden="true">
      <div className="temple-shoji" />
      <div className="temple-beam" />
      <div className="temple-table" />
      <div className="temple-tape temple-tape-a" />
      <div className="temple-tape temple-tape-b" />
      <svg className="temple-wires" viewBox="0 0 400 160" preserveAspectRatio="none">
        <path d="M-10 140 C 60 60, 120 170, 190 110 S 330 40, 410 120" stroke="#d7341f" strokeWidth="5" fill="none" strokeLinecap="round" />
        <path d="M-10 152 C 80 90, 150 180, 230 130 S 340 90, 410 150" stroke="#2c6fa8" strokeWidth="4" fill="none" strokeLinecap="round" opacity=".8" />
      </svg>
      <div className="temple-warmth" />
      <Lantern side="left" />
      <Lantern side="right" />
      <div className="temple-dust">{DUST.map((mote, index) => <i key={index} style={{ left: mote.left, top: mote.top, width: mote.size, height: mote.size, animationDuration: mote.duration, animationDelay: mote.delay }} />)}</div>
      <div className="temple-vignette" />
    </div>
  );
}
