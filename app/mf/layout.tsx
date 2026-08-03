import type { Metadata } from "next";
import { Montserrat, Roboto } from "next/font/google";
import "./mf.css";

const montserrat = Montserrat({
  variable: "--font-mf-display",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

const roboto = Roboto({
  variable: "--font-mf-body",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "MF Project Intelligence",
  description: "Demonstração do sistema de inteligência e execução de projetos da Minerbo-Fuchs.",
};

export default function MfLayout({ children }: { children: React.ReactNode }) {
  return (
    <div lang="pt-BR" className={`mf-surface ${montserrat.variable} ${roboto.variable}`}>
      {children}
    </div>
  );
}

