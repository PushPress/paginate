module.exports = {
  extends: ["eslint:recommended"],
  root: true,
  env: {
    node: true,
    es6: true,
  },
  parser: "@typescript-eslint/parser",
  ignorePatterns: ["dist/**/*.*", "docs/**/*.*"],
  overrides: [
    {
      files: ["./**/*.ts"],
      extends: [
        "eslint:recommended",
        "plugin:@typescript-eslint/recommended-type-checked",
        "plugin:@typescript-eslint/stylistic-type-checked",
      ],
      parserOptions: {
        project: "./tsconfig.eslint.json",
      },
      plugins: ["@typescript-eslint"],
    },
  ],
};
