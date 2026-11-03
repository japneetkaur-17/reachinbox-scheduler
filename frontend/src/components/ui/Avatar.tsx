import { useState } from 'react';

const palette = ['bg-brand-500', 'bg-sky-500', 'bg-violet-500', 'bg-amber-500', 'bg-rose-500'];

/** Photo avatar with an initial-letter fallback (the green "A" circle in the design). */
export function Avatar({ src, name, size = 32 }: { src?: string | null; name: string; size?: number }) {
  const [broken, setBroken] = useState(false);
  const initial = (name.trim()[0] ?? '?').toUpperCase();
  const color = palette[initial.charCodeAt(0) % palette.length];

  if (src && !broken) {
    return (
      <img
        src={src}
        alt={name}
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
        className="flex-none rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className={`inline-flex flex-none items-center justify-center rounded-full font-medium text-white ${color}`}
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {initial}
    </span>
  );
}
