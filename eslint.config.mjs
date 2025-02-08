import globals from "globals";
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // Start with the basline recommended rules
  eslint.configs.recommended,
  // Lint source files with strict typescript rules
  {
    files: ["src/**/**.ts"],
    extends: tseslint.configs.strictTypeChecked,
  },
  {
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    ignores: ["dist/**", "node_modules"],
  },
);
