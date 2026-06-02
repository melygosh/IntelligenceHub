import gts from 'gts'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

// Google TypeScript Style (gts 7, flat config) as the shared baseline (spec
// NFR-4), plus the React rule sets gts doesn't ship (react-hooks / react-refresh).
// gts's default `project: ./tsconfig.json` is solution-style (references only)
// here, so point type-aware linting at the app project instead.
export default [
  { ignores: ['dist/**', '*.config.*', 'eslint.config.js'] },
  ...gts,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        project: './tsconfig.app.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  reactHooks.configs.flat.recommended,
  reactRefresh.configs.vite,
]
