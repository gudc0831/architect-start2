import nextVitals from "eslint-config-next/core-web-vitals";

const config = [
  {
    ignores: [".next/**", ".next-build/**", ".next-verify/**", "node_modules/**"],
  },
  ...nextVitals,
];

export default config;