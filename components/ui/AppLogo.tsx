import React from "react";

interface AppLogoProps {
  size?: number;
  className?: string;
}

export function AppLogo({ size = 22, className }: AppLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ flexShrink: 0 }}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="sc-app-arc" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#38bdf8" />
        </linearGradient>
      </defs>
      {/* 270-degree Clock Timer Arc */}
      <path d="M16 5 A 11 11 0 1 0 27 16" stroke="url(#sc-app-arc)" strokeWidth="4.5" strokeLinecap="round" />
      {/* Center Clock hands */}
      <path d="M16 11V16L20 18" stroke="#ffffff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="16" cy="16" r="1.5" fill="#ffffff" />
      {/* Refined vector A */}
      <path d="M19.2 11.0L21.8 4.2L24.4 11.0" stroke="#38bdf8" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20.1 8.8H23.5" stroke="#38bdf8" strokeWidth="1.5" strokeLinecap="round" />
      {/* Refined vector I */}
      <path d="M27.3 4.2V11.0" stroke="#38bdf8" strokeWidth="1.65" strokeLinecap="round" />
    </svg>
  );
}
