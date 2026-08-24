import type { Metadata } from "next";
import { Fraunces, Manrope } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
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
      <body className="flex min-h-full flex-col font-sans">
        <AuthProvider>
          <ToastProvider>{children}</ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
