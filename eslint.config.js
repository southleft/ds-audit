import js from '@eslint/js';
import typescript from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

const tsRules = {
  // TypeScript's compiler already reports undefined and unused identifiers,
  // and the base rules false-positive on type-only references (NodeJS.Timeout)
  // and type-signature parameter names. Defer to the TS-aware equivalents.
  'no-undef': 'off',
  'no-unused-vars': 'off',
  '@typescript-eslint/explicit-function-return-type': 'warn',
  '@typescript-eslint/no-explicit-any': 'error',
  '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
  'no-console': ['warn', { allow: ['warn', 'error'] }],
  'react/react-in-jsx-scope': 'off',
  'react/prop-types': 'off',
  'react-hooks/rules-of-hooks': 'error',
  'react-hooks/exhaustive-deps': 'warn',
};

const plugins = {
  '@typescript-eslint': typescript,
  react,
  'react-hooks': reactHooks,
};

export default [
  js.configs.recommended,
  {
    // Node/CLI/engine code
    files: ['src/**/*.ts'],
    ignores: ['src/dashboard/src/**'],
    plugins,
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
      globals: { ...globals.node },
    },
    rules: tsRules,
    settings: { react: { version: 'detect' } },
  },
  {
    // Dashboard React app — browser environment
    files: ['src/dashboard/src/**/*.{ts,tsx}'],
    plugins,
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: 2022, sourceType: 'module', ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser },
    },
    rules: tsRules,
    settings: { react: { version: 'detect' } },
  },
  {
    // Jest test suites
    files: ['src/**/*.test.ts', 'src/**/__tests__/**/*.ts'],
    plugins,
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
      globals: { ...globals.node, ...globals.jest },
    },
    rules: tsRules,
    settings: { react: { version: 'detect' } },
  },
  {
    ignores: ['node_modules/**', 'dist/**', 'coverage/**', '*.config.js', 'eslint.config.js'],
  },
];
