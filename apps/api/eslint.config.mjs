// @ts-check
import gts from 'gts';
import globals from 'globals';

// Google TypeScript Style (gts 7, flat config) is the single lint baseline
// across the monorepo (spec NFR-4). gts brings eslint + @typescript-eslint +
// prettier + node rules; we layer the API's runtime globals on top and scope
// linting to type-checked source (test/ and scripts/ live outside tsconfig).
export default [
  {
    ignores: ['dist/**', 'test/**', 'scripts/**', '*.config.*', 'eslint.config.mjs'],
  },
  ...gts,
  {
    files: ['**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      parserOptions: {
        // gts sets project: './tsconfig.json'; anchor the root so it resolves
        // regardless of the cwd eslint is invoked from.
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
];
