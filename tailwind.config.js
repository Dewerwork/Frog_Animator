/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        panel: "#1a1a1f",
        panel2: "#23232b",
        edge: "#33333d",
        ink: "#e6e6ea",
        accent: "#5cc8a6",
      },
    },
  },
  plugins: [],
};
