/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#f3f2f2',
        surface: '#eae9e9',
        ink: {
          DEFAULT: '#201e1d',
          50: '#f6f6f6',
          100: '#eae9e9',
          200: '#d5d3d2',
          300: '#b4b0ae',
          400: '#8c8784',
          500: '#686360',
          600: '#4d4845',
          700: '#383432',
          800: '#282524',
          900: '#201e1d'
        },
        cyan: {
          DEFAULT: '#0088b0',
          50: '#f0f9fc',
          100: '#e0f4fa',
          200: '#bce7f4',
          300: '#8cd3eb',
          400: '#4bbada',
          500: '#0088b0',
          600: '#007599',
          700: '#00607d',
          800: '#004b62',
          900: '#003648'
        },
        magenta: {
          DEFAULT: '#d6006c',
          50: '#fdf2f7',
          100: '#fce4ef',
          200: '#f8c0db',
          500: '#d6006c',
          700: '#a30052',
          800: '#820042',
          900: '#57002c'
        },
        yellow: {
          process: '#edbb00'
        },
        divider: 'var(--color-divider)'
      },
      fontFamily: {
        serif: ['"Source Serif 4"', 'Georgia', 'serif'],
        heading: ['"Source Serif 4"', 'Georgia', 'serif'],
        body: ['"Source Serif 4"', 'Georgia', 'serif'],
        sans: ['system-ui', '-apple-system', '"Segoe UI"', 'sans-serif'],
        hyper: ['"Atkinson Hyperlegible"', 'Verdana', 'sans-serif']
      },
      borderRadius: {
        sm: '2px',
        md: '3px',
        lg: '5px'
      },
      boxShadow: {
        sm: '0 1px 2px rgba(32, 30, 29, 0.06)',
        md: '0 2px 6px rgba(32, 30, 29, 0.08)',
        lg: '0 8px 24px rgba(32, 30, 29, 0.10)'
      },
      keyframes: {
        rise: {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'none' }
        },
        breathe: {
          '0%, 100%': { opacity: '0.35', transform: 'scale(0.96)' },
          '50%': { opacity: '1', transform: 'scale(1.08)' }
        },
        draw: {
          from: { strokeDashoffset: '300' },
          to: { strokeDashoffset: '0' }
        }
      },
      animation: {
        rise: 'rise 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        breathe: 'breathe 2.4s ease-in-out infinite',
        draw: 'draw 0.8s ease-out forwards'
      }
    }
  },
  plugins: []
};
