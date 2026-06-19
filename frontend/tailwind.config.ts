import type { Config } from "tailwindcss";

// Dark "video dashboard" theme. Accent mirrors the existing player red (#ff4d4f).
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: "#0b0b0d",
          subtle: "#15151a",
          raised: "#1c1c22",
        },
        border: {
          DEFAULT: "#2a2a32",
        },
        accent: {
          DEFAULT: "#ff4d4f",
          hover: "#ff6b6d",
        },
      },
      fontFamily: {
        sans: ["system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
