import { Bricolage_Grotesque, Inter } from "next/font/google";
import "./styles.css";

// Fonts are self-hosted by next/font at build time (no runtime Google request).
// The CSS variables match the ones the design system in styles.css consumes.
const display = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-display",
  fallback: ["Georgia", "serif"],
});

const ui = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-ui",
  fallback: ["system-ui", "-apple-system", "sans-serif"],
});

export const metadata = {
  title: "Stack Board",
  description: "Real-time collaborative task boards with AI assistance.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg", apple: "/favicon.svg" },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${display.variable} ${ui.variable}`}>
      <body>{children}</body>
    </html>
  );
}
