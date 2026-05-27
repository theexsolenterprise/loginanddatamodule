import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f5f7ff",
          100: "#e6ebff",
          500: "#4f46e5",
          600: "#4338ca",
          900: "#1e1b4b",
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
