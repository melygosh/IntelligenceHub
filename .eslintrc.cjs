/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  // Order matters:
  //   - `./node_modules/gts/` brings in Google TypeScript Style Guide rules (spec NFR-4).
  //   - `prettier` last to disable any stylistic rules that would conflict with Prettier.
  extends: ['./node_modules/gts/', 'prettier'],
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/consistent-type-imports': 'error',
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    eqeqeq: ['error', 'always'],
  },
  ignorePatterns: ['dist', 'build', 'node_modules', '*.config.js', '*.config.cjs', '*.config.ts'],
};
