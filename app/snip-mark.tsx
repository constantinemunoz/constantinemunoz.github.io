// Shared scissors logo for the games homepage and Snip No Evil.
// Closed scissors pointing right: two ring handles and a long blade. The two
// halves snip open and shut when the page loads and when the title is hovered.
export function SnipMark({ className = "" }: { className?: string }) {
  return (
    <svg className={`snip-mark ${className}`} viewBox="0 0 124 72" aria-hidden="true">
      <g className="snip-half snip-half-top">
        <path d="M34 22 L118 35 L46 40 Z" fill="#e8eef4" stroke="currentColor" strokeWidth="4" strokeLinejoin="round" />
        <ellipse cx="20" cy="17" rx="15" ry="11" fill="none" stroke="currentColor" strokeWidth="10" />
        <ellipse className="snip-grip" cx="20" cy="17" rx="15" ry="11" fill="none" strokeWidth="5" />
      </g>
      <g className="snip-half snip-half-bottom">
        <path d="M34 50 L118 35 L46 32 Z" fill="#cfd9e3" stroke="currentColor" strokeWidth="4" strokeLinejoin="round" />
        <ellipse cx="20" cy="55" rx="15" ry="11" fill="none" stroke="currentColor" strokeWidth="10" />
        <ellipse className="snip-grip" cx="20" cy="55" rx="15" ry="11" fill="none" strokeWidth="5" />
      </g>
      <circle cx="46" cy="36" r="4" fill="currentColor" />
    </svg>
  );
}
