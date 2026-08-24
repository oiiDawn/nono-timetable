/** Shared Prettier config: official defaults plus Tailwind class sorting. */

/** @type {import("prettier").Config} */
const config = {
  printWidth: 100,
  endOfLine: "auto",
  plugins: ["prettier-plugin-tailwindcss"],
  tailwindStylesheet: "./src/index.css",
  tailwindFunctions: ["cn"],
};

export default config;
