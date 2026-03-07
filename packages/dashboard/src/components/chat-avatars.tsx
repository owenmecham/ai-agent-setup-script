export function MurphAvatar({ size = 36 }: { size?: number }) {
  return (
    <div
      className="rounded-full flex items-center justify-center shrink-0"
      style={{
        width: size,
        height: size,
        background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
      }}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        style={{ width: size * 0.6, height: size * 0.6 }}
      >
        {/* Wormhole: concentric ellipses + center point */}
        <ellipse cx="12" cy="12" rx="10" ry="5" stroke="white" strokeWidth="1" opacity="0.3" />
        <ellipse cx="12" cy="12" rx="7" ry="8" stroke="white" strokeWidth="1" opacity="0.5" />
        <ellipse cx="12" cy="12" rx="4" ry="10" stroke="white" strokeWidth="1" opacity="0.7" />
        <circle cx="12" cy="12" r="1.5" fill="white" />
      </svg>
    </div>
  );
}

export function UserAvatar({ size = 36 }: { size?: number }) {
  return (
    <div
      className="rounded-full bg-zinc-700 flex items-center justify-center shrink-0"
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        style={{ width: size * 0.55, height: size * 0.55 }}
      >
        {/* Person silhouette */}
        <circle cx="12" cy="8" r="4" fill="#a1a1aa" />
        <path d="M4 21c0-4.418 3.582-8 8-8s8 3.582 8 8" fill="#a1a1aa" />
      </svg>
    </div>
  );
}
