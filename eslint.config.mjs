import tseslint from "@typescript-eslint/eslint-plugin";
import nextConfig from "eslint-config-next";

const config = [
  ...nextConfig,
  {
    plugins: {
      "@typescript-eslint": tseslint,
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    ignores: ["python/", "data/", ".next/", ".release/"],
  },
];

export default config;
