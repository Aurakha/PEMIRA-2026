/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        campus: {
          50: '#eef6ff',
          100: '#d9eaff',
          500: '#1e40af',
          600: '#1d4ed8',
          700: '#1e3a8a',
          900: '#0f172a',
        },
      },
    },
  },
  plugins: [],
};
