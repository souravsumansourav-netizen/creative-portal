import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";

// Inter is the fallback for non-Apple devices; Apple devices use SF Pro via the system stack.
const sans = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = { title: "Tanishq Creative Portal" };
export const viewport: Viewport = { themeColor: "#F5F5F7" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={sans.variable}>
      <body>
        {children}
        <Toaster
          position="top-center"
          toastOptions={{
            duration: 4500,
            style: {
              borderRadius: 16, border: "1px solid rgba(0,0,0,0.06)", background: "rgba(255,255,255,0.86)",
              backdropFilter: "blur(24px) saturate(180%)", WebkitBackdropFilter: "blur(24px) saturate(180%)",
              boxShadow: "0 14px 44px -14px rgba(0,0,0,0.28)", color: "#1d1d1f", fontSize: 14, fontFamily: "inherit",
            },
          }}
        />
      </body>
    </html>
  );
}
