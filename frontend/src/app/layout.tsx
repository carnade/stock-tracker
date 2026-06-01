import type { Metadata } from "next";
import { IBM_Plex_Mono, Syne } from "next/font/google";
import "./globals.css";
import NavBar from "@/components/NavBar";

const ibmMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-ibm-mono",
});

const syne = Syne({
  subsets: ["latin"],
  weight: ["400", "600", "800"],
  variable: "--font-syne",
});

export const metadata: Metadata = {
  title: "Stock Tracker",
  description: "Personal equity tracker",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${ibmMono.variable} ${syne.variable} h-full`}>
      <body className="min-h-full antialiased font-mono">
        <NavBar />
        {children}
      </body>
    </html>
  );
}
