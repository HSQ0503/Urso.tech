import type {
  ArtifactReviewState,
  DemoView,
  MfHarnessSnapshot,
} from "@/lib/mf-demo/types";

export type ViewProps = {
  step: number;
  roleId: string;
  onNavigate: (view: DemoView) => void;
  onAdvance: () => void;
  onOpenArtifact: (artifactId: string) => void;
  artifactReviewStates: Record<string, ArtifactReviewState>;
  sessionId?: string;
  sessionToken?: string;
  snapshot?: MfHarnessSnapshot;
};

