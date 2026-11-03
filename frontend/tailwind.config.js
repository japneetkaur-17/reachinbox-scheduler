/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        logo: ['Silkscreen', 'ui-monospace', 'monospace'],
      },
      colors: {
        // Values taken from the Figma (green CTAs, mint Google button, light grey fields)
        brand: {
          50: '#ECFDF3',
          100: '#D1FADF',
          200: '#A6F4C5',
          500: '#00A63E',
          600: '#008A34',
          700: '#05603A',
        },
        mint: '#E6F6EC',
        field: '#F5F5F5',
        line: '#EEEEEE',
        ink: {
          DEFAULT: '#222222',
          muted: '#6B6B6B',
          faint: '#9A9A9A',
        },
      },
      boxShadow: {
        popover: '0 4px 24px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.06)',
      },
    },
  },
  plugins: [],
};
