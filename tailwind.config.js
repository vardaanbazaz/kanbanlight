/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  // The data layer holds no classes; scanning it could add CSS from words in comments.
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}', '!./src/{domain,storage,commands,platform}/**'],
  theme: {
    extend: {},
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
};
