import { useId } from "react";

export function LensMark({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
    >
      {[0, 60, 120, 180, 240, 300].map((angle) => (
        <path
          key={angle}
          transform={`rotate(${angle} 20 20)`}
          d="M20 3C29 3 35 10 36 17L24 13L16 18L20 3Z"
          fill="currentColor"
          opacity={0.45 + angle / 600}
        />
      ))}
      <circle cx="20" cy="20" r="5" fill="currentColor" />
    </svg>
  );
}

export default function LensArtwork({
  className = "",
}: {
  className?: string;
}) {
  const id = useId().replaceAll(":", "");
  return (
    <div className={`lens-artwork ${className}`} aria-hidden="true">
      <svg className="voice-field" viewBox="0 0 580 450" fill="none">
        <defs>
          <linearGradient
            id={id + "-voice"}
            x1="82"
            y1="115"
            x2="501"
            y2="334"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="var(--voice-blue, #8793e2)" />
            <stop offset=".52" stopColor="var(--voice-cream, #f6ead7)" />
            <stop offset="1" stopColor="var(--voice-coral, #f0a17d)" />
          </linearGradient>
        </defs>
        <path
          className="voice-wave"
          d="M43 139C113 139 126 80 196 80s84 104 154 104 82-58 187-58"
          stroke={`url(#${id}-voice)`}
          strokeWidth="2"
          opacity=".55"
        />
        <path
          className="voice-wave warm"
          d="M40 184c94 0 102-62 174-62 81 0 80 136 164 136 66 0 83-57 160-57"
          stroke={`url(#${id}-voice)`}
          strokeWidth="3"
          opacity=".76"
        />
        <path
          className="voice-wave"
          d="M40 229c85 0 113-48 173-48 78 0 86 88 157 88 57 0 95-42 168-42"
          stroke={`url(#${id}-voice)`}
          strokeWidth="1.5"
          opacity=".46"
        />
        <path
          className="voice-wave warm"
          d="M47 276c69 0 116-31 168-31 68 0 99 57 157 57 67 0 99-40 166-40"
          stroke={`url(#${id}-voice)`}
          strokeWidth="2"
          opacity=".65"
        />
        <path
          className="voice-wave"
          d="M78 324c56 0 90-20 143-20 63 0 96 32 148 32 51 0 82-23 131-23"
          stroke={`url(#${id}-voice)`}
          strokeWidth="1.3"
          opacity=".38"
        />
        <g className="voice-core">
          <path
            d="M265 176c-21 0-38 17-38 38v22c0 22 17 39 38 39h10l26 19v-19h14c22 0 39-17 39-39v-22c0-21-17-38-39-38h-50Z"
            fill="var(--voice-cream, #f6ead7)"
            opacity=".94"
          />
          <path
            d="M270 222v8m13-18v27m13-37v47m13-38v30m13-21v13"
            stroke="#292e48"
            strokeWidth="3"
            strokeLinecap="round"
            opacity=".82"
          />
        </g>
        <circle className="voice-dot" cx="86" cy="137" r="4" />
        <circle className="voice-dot" cx="489" cy="130" r="4" />
        <circle className="voice-dot" cx="77" cy="324" r="3" />
        <circle className="voice-dot" cx="499" cy="294" r="3" />
        <path
          d="M57 76h17M57 76v17M523 76h-17M523 76v17M57 374h17M57 374v-17M523 374h-17M523 374v-17"
          stroke={`url(#${id}-voice)`}
          strokeWidth="1"
          opacity=".5"
        />
      </svg>
      <span className="lens-art-caption voice-caption">
        A CONVERSATION <span>BUILT AROUND YOUR THINKING</span>
      </span>
    </div>
  );
}
