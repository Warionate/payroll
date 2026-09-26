/**
 * Root ESLint config — shared rules for all workspaces
 *
 * Server and client configs extend this base via spread.
 */
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';

/** Shared rules applied to every TypeScript / JavaScript file */
export const sharedRules = {
  'no-unused-vars': 'off',
  '@typescript-eslint/no-unused-vars': [
    'error',
    { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
  ],
  '@typescript-eslint/no-explicit-any': 'warn',
  // Disallow debugger left in code
  'no-debugger': 'error',
  // Require === / !== (no coercion)
  eqeqeq: ['error', 'always', { null: 'ignore' }],
  // Disallow var
  'no-var': 'error',
  // Prefer const over let when not reassigned
  'prefer-const': 'error',
};

/** Base flat-config array: recommended JS + recommended TS + prettier (disables conflicting rules) */
export const baseConfigs = [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettierConfig,
];
