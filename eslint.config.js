import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules/', 'dist/'] },
  js.configs.recommended,
  {
    files: ['extension/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.serviceworker, chrome: 'readonly' }
    }
  },
  {
    files: ['extension/content/autofill.js'],
    languageOptions: { sourceType: 'script' }
  },
  {
    files: ['test/**/*.js', 'scripts/**/*.mjs', 'eslint.config.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node, chrome: 'readonly' }
    }
  },
  {
    files: ['test/e2e/**/*.js', 'scripts/screenshots.mjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser, chrome: 'readonly' } }
  },
  {
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'prefer-const': 'error',
      eqeqeq: ['error', 'always'],
      'no-var': 'error'
    }
  }
];
