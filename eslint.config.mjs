import eslint from "@eslint/js";
import prettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/.next/**",
      "**/dist/**",
      "**/node_modules/**",
      "playwright-report/**",
      "test-results/**"
    ]
  },
  eslint.configs.recommended,
  tseslint.configs.recommended,
  prettier
);
