import globals from 'globals';
import { baseConfigs, sharedRules } from '../eslint.config.mjs';

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/logs/**',
      '**/uploads/**',
      '**/backups/**',
      '**/*.test.js',
      '**/payroll.db*',
      '**/migrations/**',
      '**/tools/**',
      '**/dist/**',
    ],
  },
  ...baseConfigs,
  {
    files: ['**/*.{js,ts}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      ...sharedRules,
      // Warn on console usage (should use logger)
      'no-console': 'warn',
      // Allow async functions without await
      'require-await': 'off',
      // Allow require() in JS files (migrations, tools)
      '@typescript-eslint/no-require-imports': 'off',
      // Allow namespace for Express type augmentation
      '@typescript-eslint/no-namespace': 'off',
    },
  },
];
