import "@xyflow/react/dist/style.css";
import "./globals.css";
import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import type { ReactNode } from "react";
import GlobalHoverTooltip from "@/components/cif/GlobalHoverTooltip";
import NavBar from "@/components/NavBar";

const ibmSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-ibm-plex-sans",
  display: "swap",
});
const ibmMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-ibm-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "mmCIF Browser",
  description: "A navigable explorer for the PDBx/mmCIF dictionary",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${ibmSans.variable} ${ibmMono.variable}`}>
      <body className="h-screen overflow-hidden">
        <div className="flex h-full flex-col">
          <NavBar />
          <main className="min-h-0 flex-1">{children}</main>
        </div>
        <GlobalHoverTooltip />
      </body>
    </html>
  );
}
