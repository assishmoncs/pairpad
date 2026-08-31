import React from 'react';

/**
 * Reusable Logo component for PairPad.
 * Supports inline vector SVG by default or custom image file via the `src` prop.
 *
 * @param {object} props
 * @param {string} [props.src] - Custom image path (e.g. "/logo.svg", "/logo.png")
 * @param {number|string} [props.size=32] - Icon width/height in pixels
 * @param {boolean} [props.showText=true] - Whether to render "PairPad" text next to icon
 * @param {string} [props.className] - Extra container CSS classes
 */
const Logo = ({ src, size = 32, showText = true, className = '' }) => {
  return (
    <div
      className={`pairpad-logo ${className}`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.6rem' }}
    >
      {src ? (
        <img
          src={src}
          alt="PairPad Logo"
          width={size}
          height={size}
          style={{ objectFit: 'contain', borderRadius: '8px' }}
        />
      ) : (
        <svg
          width={size}
          height={size}
          viewBox="0 0 100 100"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{ flexShrink: 0 }}
        >
          <rect width="100" height="100" rx="24" fill="url(#logo-grad)" />
          <path
            d="M30 38L16 50L30 62"
            stroke="white"
            strokeWidth="8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M70 38L84 50L70 62"
            stroke="white"
            strokeWidth="8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="44" cy="50" r="6" fill="#10B981" />
          <circle cx="56" cy="50" r="6" fill="#3B82F6" />
          <defs>
            <linearGradient
              id="logo-grad"
              x1="0"
              y1="0"
              x2="100"
              y2="100"
              gradientUnits="userSpaceOnUse"
            >
              <stop stopColor="#6366F1" />
              <stop offset="1" stopColor="#4F46E5" />
            </linearGradient>
          </defs>
        </svg>
      )}
      {showText && (
        <span
          className="logo-text"
          style={{
            fontWeight: 700,
            fontSize: typeof size === 'number' ? `${size * 0.7}px` : '1.25rem',
            letterSpacing: '-0.02em',
            background: 'linear-gradient(135deg, #ffffff 0%, #cbd5e1 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          PairPad
        </span>
      )}
    </div>
  );
};

export default Logo;
