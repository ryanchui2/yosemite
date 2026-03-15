import type { Metadata } from "next";
import { Geist, Space_Grotesk } from "next/font/google";
import localFont from "next/font/local";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/contexts/AuthContext";
import "./globals.css";

const defaultUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(defaultUrl),
  title: "yosemite",
  description: "Sanctions screening, transaction anomaly detection, and geopolitical risk monitoring for small businesses.",
};

const geistSans = Geist({
  variable: "--font-geist-sans",
  display: "swap",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  display: "swap",
  subsets: ["latin"],
});

const satoshi = localFont({
  src: [
    { path: "../public/satoshi/Satoshi-Regular.otf", weight: "400" },
    { path: "../public/satoshi/Satoshi-Medium.otf", weight: "500" },
    { path: "../public/satoshi/Satoshi-Bold.otf", weight: "700" },
    { path: "../public/satoshi/Satoshi-Black.otf", weight: "900" },
  ],
  variable: "--font-satoshi",
  display: "swap",
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.className} ${spaceGrotesk.variable} ${satoshi.variable} antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          disableTransitionOnChange
        >
          <AuthProvider>
            {children}
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
