import type { CardData } from "../timeline";
import { IntroCard } from "../ui/intro-card";

export function CardScene({ data }: { data: CardData }) {
  return <IntroCard data={data} />;
}
