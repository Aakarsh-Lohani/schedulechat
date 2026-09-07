import coreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...coreWebVitals,
  ...nextTypescript,
  {
    rules: {
      "@next/next/no-page-custom-font": "off",
    },
  },
  {
    ignores: ["log/**", "node_modules/**", ".next/**"],
  },
];

export default eslintConfig;
