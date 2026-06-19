import type { Metadata } from "next";
import {
  Archivo, Space_Grotesk,
  Plus_Jakarta_Sans, Cormorant_Garamond, Mulish, Orbitron, Chakra_Petch, Sora, Manrope,
  JetBrains_Mono,
} from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";
import "./themes.css";

// Fuentes Forjo (default). Sus variables alimentan --font-sans/--font-heading en globals.css.
const grotesk = Space_Grotesk({
  variable: "--font-grotesk",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
});

// Fuentes de los themes alternativos (Modern/Spa/Cyber + pairings de tipografía).
// preload:false → no se descargan salvo que un negocio elija ese theme/font.
const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], preload: false });
const cormorant = Cormorant_Garamond({ variable: "--font-cormorant", subsets: ["latin"], weight: ["400", "500", "600", "700"], preload: false });
const mulish = Mulish({ variable: "--font-mulish", subsets: ["latin"], weight: ["300", "400", "500", "600", "700", "800"], preload: false });
const orbitron = Orbitron({ variable: "--font-orbitron", subsets: ["latin"], weight: ["500", "600", "700", "800", "900"], preload: false });
const chakra = Chakra_Petch({ variable: "--font-chakra", subsets: ["latin"], weight: ["400", "500", "600", "700"], preload: false });
const sora = Sora({ variable: "--font-sora", subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], preload: false });
const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], preload: false });

// Fuente mono editorial del landing premium (F8.1): eyebrows/kickers, labels e indicador de scroll
// (mono + letterspaced). Vía next/font → self-host, CERO dependencia npm nueva (D81-07).
// preload:false → solo se descarga cuando el landing (.frj-site) la usa, igual que los themes alternativos.
const jetbrainsMono = JetBrains_Mono({ variable: "--font-jetbrains-mono", subsets: ["latin"], weight: ["400", "500", "600", "700"], preload: false });

const fontVars = [grotesk, archivo, jakarta, cormorant, mulish, orbitron, chakra, sora, manrope, jetbrainsMono]
  .map(f => f.variable).join(" ");

export const metadata: Metadata = {
  title: "Forjo Studio — Turnos para tu negocio",
  description: "Gestioná tus turnos, clientes y finanzas desde un solo lugar.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      // next-themes muta la clase del <html> y la paleta vía data-palette → suppress.
      suppressHydrationWarning
      data-palette="red"
      className={`${fontVars} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          {children}
          <Toaster richColors position="top-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
