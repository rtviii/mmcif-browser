import "@xyflow/react/dist/style.css";
import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import NavBar from "@/components/NavBar";

export const metadata: Metadata = {
  title: "mmCIF Browser",
  description: "A navigable explorer for the PDBx/mmCIF dictionary",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="h-screen overflow-hidden">
        <div className="flex h-full flex-col">
          <NavBar />
          <main className="min-h-0 flex-1">{children}</main>
        </div>
      </body>
    </html>
  );
}
