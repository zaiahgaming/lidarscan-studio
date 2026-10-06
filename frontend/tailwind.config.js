/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      colors: {
        studio: {
          900: '#0b0d13',
          800: '#12151f',
          750: '#171b28',
          700: '#1e2333',
          600: '#2a3045',
          border: '#242b3d',
        }
      }
    },
  },
  plugins: [],
}
