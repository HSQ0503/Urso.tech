import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".brain-eval-next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // The Expo app is a separate toolchain with its own tsconfig and its own
    // conventions; this config is eslint-config-next and misjudges them — a
    // Metro config is CommonJS by design, so require() there is correct, not an
    // error. Matches the "apps" exclusion already in tsconfig.json. The mobile
    // app should get eslint-config-expo of its own.
    "apps/**",
  ]),
]);

export default eslintConfig;
