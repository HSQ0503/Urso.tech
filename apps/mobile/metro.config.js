const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

// This app deliberately lives OUTSIDE the repo's npm workspaces (see the root
// package.json and the Phase 6 plan), which has one consequence Metro must be
// told about.

const projectRoot = __dirname;
const repoRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// @urso/types is a file: dependency, so npm symlinks it to <repo>/packages/types
// — outside this project root. Metro only watches the project root by default,
// so without this the shared contract never rebuilds when it changes.
config.watchFolders = [path.resolve(repoRoot, "packages")];

// NOTE — do NOT set resolver.disableHierarchicalLookup here.
//
// The first version of this file pinned nodeModulesPaths to this app's own tree
// and disabled the hierarchical walk, reasoning that <repo>/node_modules is a
// PARENT directory and the two trees genuinely disagree (the web app pins react
// 19.2.4, this app 19.2.3), so an upward walk could mix them.
//
// That broke the bundle outright. npm nests transitive dependencies — this
// install has 26 nested node_modules directories, and expo-asset for instance
// resolves at node_modules/expo/node_modules/expo-asset. Disabling the walk
// makes every nested dependency unreachable, and the failure reads as "module
// not found" for packages that are in fact installed.
//
// The original worry is unfounded anyway: node resolution takes the NEAREST
// match, and this app's own node_modules holds react, react-native and expo at
// its top level. Those always win before the walk ever reaches the repo root.
// Isolation is enforced by apps/* not being a workspace member, which is where
// it belongs — not by crippling module resolution.

module.exports = config;
