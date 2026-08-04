import type { Metadata } from "next";
import { Archivo, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
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

const plexSans = IBM_Plex_Sans({
  variable: "--font-mf-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
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

