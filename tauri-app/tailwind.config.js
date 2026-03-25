/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./overlay.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#f7f3eb",
        ink: "#1f1b18",
        panel: "#fffaf1",
        line: "#d8c7b0",
        accent: "#c14b1f",
        accentSoft: "#efd1c0",
        success: "#1f7a4d",
      },
      boxShadow: {
        panel: "0 20px 50px rgba(70, 43, 16, 0.08)",
      },
      fontFamily: {
        sans: ["IBM Plex Sans", "Segoe UI", "sans-serif"],
        mono: ["IBM Plex Mono", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
};
