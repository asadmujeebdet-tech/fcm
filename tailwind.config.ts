import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#0A0D13",
        surface: "#12161F",
        surface2: "#1A202C",
        border: "#242B3A",
        signal: {
          DEFAULT: "rgb(var(--theme-signal) / <alpha-value>)",
          dim: "#B8631F",
        },
        wave: {
          DEFAULT: "rgb(var(--theme-wave) / <alpha-value>)",
          dim: "#1F8E82",
        },
        danger: "rgb(var(--theme-danger) / <alpha-value>)",
        ax: {
          navy: "#0f1b3d", ink: "#1f2a44", muted: "#64748b", soft: "#8a97b1", line: "#e6ecf7", canvas: "#f5f8ff",
          blue: "#2f6df6", blueSoft: "#e8f0ff", green: "#16b364", greenSoft: "#e3f8ec", purple: "#7c5cf5", purpleSoft: "#efebff",
          orange: "#f59e0b", orangeSoft: "#fff1dc", red: "#ef4466", redSoft: "#ffe8ed",
        },
        ink2: "rgb(var(--theme-muted) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["var(--font-manrope)", "system-ui", "sans-serif"],
        mono: ["var(--font-plex-mono)", "ui-monospace", "monospace"],
      },
      keyframes: {
        ping2: {
          "0%": { transform: "scale(0.9)", opacity: "0.8" },
          "80%, 100%": { transform: "scale(2.2)", opacity: "0" },
        },
      },
      animation: {
        ping2: "ping2 2.4s cubic-bezier(0,0,0.2,1) infinite",
      },
    },
  },
  plugins: [],
};

export default config;
