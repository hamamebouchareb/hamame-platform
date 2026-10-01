import type { Metadata } from "next";
import { Fraunces, Manrope } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { LanguageProvider } from "@/context/LanguageContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { ToastProvider } from "@/components";

const manrope = Manrope({
  variable: "--font-hamame-sans",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-hamame-display",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Hamame",
  description: "Hamame — Algerian educational platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className={`${manrope.variable} ${fraunces.variable} h-full antialiased`}>
      {/* Pre-paint theme: mirrors ThemeContext resolution (stored pick, else
          dark) so returners never flash the wrong theme. No secrets here. */}
      <script
        dangerouslySetInnerHTML={{
          __html: `(function(){try{var t=localStorage.getItem("hamame_theme");var r=t==="light"?"light":t==="system"&&matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";document.documentElement.dataset.theme=r;}catch(e){}})();`,
        }}
      />
      <body className="flex min-h-full flex-col font-sans">
        <AuthProvider>
          <LanguageProvider>
            <ThemeProvider>
              <ToastProvider>{children}</ToastProvider>
            </ThemeProvider>
          </LanguageProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
