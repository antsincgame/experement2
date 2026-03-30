/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        holo: {
          bg: "#F0F0FF",
          surface: "rgba(255, 255, 255, 0.6)",
          "surface-solid": "#FAFAFF",
          panel: "rgba(255, 255, 255, 0.35)",
          overlay: "rgba(255, 255, 255, 0.15)",
          border: "rgba(255, 255, 255, 0.4)",
          "border-bright": "rgba(0, 229, 255, 0.4)",
        },
        neon: {
          cyan: "#00E5FF",
          "cyan-light": "#80F0FF",
          "cyan-bg": "rgba(0, 229, 255, 0.12)",
          magenta: "#FF2DAA",
          "magenta-light": "#FF80CC",
          "magenta-bg": "rgba(255, 45, 170, 0.12)",
          violet: "#7C4DFF",
          "violet-light": "#B388FF",
          "violet-bg": "rgba(124, 77, 255, 0.12)",
          lime: "#00FF88",
          "lime-bg": "rgba(0, 255, 136, 0.12)",
          gold: "#FFD700",
          pink: "#FF3366",
        },
        ink: {
          dark: "#0B0D17",
          base: "#1A1A2E",
          muted: "#4A4A6A",
          light: "#8888AA",
          faint: "#C0C0D0",
        },
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', '"Fira Code"', "monospace"],
        sans: ['"Inter"', "system-ui", "sans-serif"],
      },
      boxShadow: {
        "glow-cyan": "0 0 20px rgba(0, 229, 255, 0.4), 0 0 60px rgba(0, 229, 255, 0.15)",
        "glow-magenta": "0 0 20px rgba(255, 45, 170, 0.4), 0 0 60px rgba(255, 45, 170, 0.15)",
        "glow-violet": "0 0 20px rgba(124, 77, 255, 0.4), 0 0 60px rgba(124, 77, 255, 0.15)",
        glass: "0 8px 32px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.4)",
        "glass-strong": "0 8px 32px rgba(0, 0, 0, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.6)",
        neon: "0 0 40px rgba(0, 229, 255, 0.3), 0 0 80px rgba(255, 45, 170, 0.15)",
      },
      animation: {
        "aurora": "aurora 12s ease-in-out infinite",
        "float": "float 6s ease-in-out infinite",
        "glow-pulse": "glowPulse 3s ease-in-out infinite alternate",
        "shimmer": "shimmer 2s linear infinite",
        "fade-in": "fadeIn 0.4s ease-out",
        "slide-up": "slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
        "slide-left": "slideLeft 0.5s cubic-bezier(0.16, 1, 0.3, 1)",
        "spin-slow": "spin 20s linear infinite",
        "code-flash": "codeFlash 1.2s ease-out forwards",
      },
      keyframes: {
        aurora: {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "25%": { backgroundPosition: "50% 0%" },
          "50%": { backgroundPosition: "100% 50%" },
          "75%": { backgroundPosition: "50% 100%" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-10px)" },
        },
        glowPulse: {
          "0%": { opacity: "0.5", filter: "brightness(0.9)" },
          "100%": { opacity: "1", filter: "brightness(1.1)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        slideLeft: {
          "0%": { opacity: "0", transform: "translateX(30px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        codeFlash: {
          "0%": { backgroundColor: "rgba(0, 229, 255, 0.15)" },
          "100%": { backgroundColor: "transparent" },
        },
      },
    },
  },
  plugins: [],
};
