/** The Pulse mark: a square frame with a heartbeat through it. */
export function PulseMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect
        x="7"
        y="7"
        width="50"
        height="50"
        fill="none"
        stroke="currentColor"
        strokeWidth="6"
      />
      <path
        d="M15 34h8l5-13 8 24 5-11h8"
        fill="none"
        stroke="currentColor"
        strokeWidth="5"
      />
    </svg>
  );
}
