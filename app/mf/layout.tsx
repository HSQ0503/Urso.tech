import localFont from "next/font/local";
import type { Metadata } from "next";
import { Archivo, IBM_Plex_Mono } from "next/font/google";
import { MfDemoShell } from "@/components/mf/mf-demo";
import { MfDemoSessionProvider } from "@/components/mf/mf-demo-session";
import { MfLanguageProvider } from "@/components/mf/mf-language";
import "./mf.css";
import "./styles/mf-story.css";
import "./styles/mf-fieldbook.css";
import "./styles/mf-clarity.css";
import "./styles/mf-presentation.css";
import "./styles/mf-brain-console.css";
import "./styles/mf-changes.css";
import "./styles/mf-workflows.css";
import "./styles/mf-shell.css";
import "./styles/mf-brain.css";
import "./styles/mf-industrial.css";
import "./styles/mf-overview.css";

const archivo = Archivo({
  variable: "--font-mf-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

// Keep font assets local: some Google CSS URLs cannot be parsed by Turbopack.
const plexSans = localFont({
  variable: "--font-mf-body",
  display: "swap",
  src: [
    { path: "../fonts/ibm-plex-sans/400.woff2", weight: "400", style: "normal" },
    { path: "../fonts/ibm-plex-sans/500.woff2", weight: "500", style: "normal" },
    { path: "../fonts/ibm-plex-sans/600.woff2", weight: "600", style: "normal" },
    { path: "../fonts/ibm-plex-sans/700.woff2", weight: "700", style: "normal" },
  ],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-mf-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "MF Project Intelligence",
  description: "Demonstração do sistema de inteligência e execução de projetos da Minerbo-Fuchs.",
};

export default function MfLayout({ children }: { children: React.ReactNode }) {
  return (
    <div lang="pt-BR" className={`mf-surface ${archivo.variable} ${plexSans.variable} ${plexMono.variable}`}>
      <MfLanguageProvider>
        <MfDemoSessionProvider>
          <MfDemoShell>{children}</MfDemoShell>
        </MfDemoSessionProvider>
      </MfLanguageProvider>
    </div>
  );
}

