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
      <svg viewBox="0 0 580 450" fill="none">
        <defs>
          <linearGradient
            id={id + "-stroke"}
            x1="80"
            y1="60"
            x2="470"
            y2="400"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#c7cffc" />
            <stop offset=".32" stopColor="#f4f4ff" />
            <stop offset=".62" stopColor="#777dee" />
            <stop offset="1" stopColor="#3039ae" />
          </linearGradient>
          <radialGradient id={id + "-glass"}>
            <stop stopColor="#babdfb" stopOpacity=".13" />
            <stop offset="1" stopColor="#252c73" stopOpacity=".12" />
          </radialGradient>
        </defs>
        <g transform="translate(290 225) rotate(-24)">
          <ellipse
            rx="203"
            ry="163"
            fill={`url(#${id}-glass)`}
            stroke="#ffffff12"
          />
          {Array.from({ length: 28 }, (_, i) => (
            <ellipse
              key={i}
              cx={(i - 14) * 2.6}
              cy={(i - 14) * 0.7}
              rx={145 - i * 1.1}
              ry={159 - i * 3.25}
              transform={`rotate(${i * 3.3})`}
              stroke={`url(#${id}-stroke)`}
              strokeWidth={i % 5 === 0 ? 1.8 : 0.75}
              opacity={0.28 + i * 0.023}
            />
          ))}
          <ellipse
            rx="60"
            ry="82"
            transform="rotate(66)"
            stroke="#eef0ff"
            strokeWidth="1.2"
            opacity=".8"
          />
          <circle r="12" fill="#e4e7ff" />
          <circle r="24" stroke="#c7ceff" strokeDasharray="1 5" />
        </g>
        <path
          d="M69 225H114M466 225H511M290 38V78M290 372V412"
          stroke="#9ca6dd"
          strokeWidth=".6"
        />
        <circle cx="69" cy="225" r="3" stroke="#b1b9ed" />
        <circle cx="511" cy="225" r="3" stroke="#b1b9ed" />
        <path
          d="M50 55H68M50 55V73M530 55H512M530 55V73M50 395H68M50 395V377M530 395H512M530 395V377"
          stroke="#bcc4ef"
          opacity=".45"
        />
      </svg>
      <span className="lens-art-caption">
        FIG. 01 <span>HUMAN POTENTIAL, IN FOCUS</span>
      </span>
    </div>
  );
}
