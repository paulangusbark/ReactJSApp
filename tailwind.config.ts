import type { Config } from "tailwindcss";
import typography from "@tailwindcss/typography";

export default {
  darkMode: ["class", ".dark"],

  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],

  theme: {
    extend: {
      colors: {
        /* semantic tokens (theme aware) */
        background: "hsl(var(--bg))",
        foreground: "hsl(var(--fg))",
        card: "hsl(var(--card))",
        muted: "hsl(var(--muted))",
        border: "hsl(var(--border))",

        primary: "hsl(var(--primary))",
        "primary-foreground": "hsl(var(--primary-fg))",

        accent: "hsl(var(--accent))",
        "accent-foreground": "hsl(var(--accent-fg))",

        ring: "hsl(var(--ring))",

        /* your emerald scale preserved */
        brand: {
          50: "#effcf6",
          100: "#d9f7e9",
          200: "#b4efcf",
          300: "#86e4b2",
          400: "#4fd690",
          500: "#10b981",
          600: "#0ea371",
          700: "#0c865e",
          800: "#0a6a4c",
          900: "#064036",
        },
      },
    },
  },

  plugins: [typography()],
} satisfies Config;

