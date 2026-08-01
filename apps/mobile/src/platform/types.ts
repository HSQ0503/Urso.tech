import type { Href } from "expo-router";

// A workspace is an authenticated product surface, not a claim made by the
// login form. Every value below is derived from credentials we have verified.
export type Workspace = "admin" | "canes-owner" | "canes-crew" | "woof-gang";

export type WorkspaceSession = {
  workspace: Workspace;
  email: string | null;
  name: string | null;
};

const workspaceRoutes = {
  admin: "/(admin)",
  "canes-owner": "/(owner)",
  "canes-crew": "/(crew)",
  "woof-gang": "/(woof-gang)",
} as const;

// Route groups are intentional here: they select a workspace shell without
// exposing an implementation path in the app's public URLs. `Href` keeps the
// one boundary to Expo Router typed even while a client route is being added
// in another worktree.
export function workspaceHref(workspace: Workspace): Href {
  return workspaceRoutes[workspace] as Href;
}
