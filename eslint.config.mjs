import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import prettier from 'eslint-plugin-prettier';
import prettierConfig from 'eslint-config-prettier';
import importPlugin from 'eslint-plugin-import';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const customRules = {
  'no-mixed-declarations': require('./eslint-rules/no-mixed-declarations.js'),
  'no-db-queries-outside-services': require('./eslint-rules/no-db-queries-outside-services.js'),
  'dto-validation-rules': require('./eslint-rules/dto-validation-rules.js'),
  'consistent-file-naming': require('./eslint-rules/consistent-file-naming.js'),
  'no-empty-catch-blocks': require('./eslint-rules/no-empty-catch-blocks.js'),
};

export default [
  js.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: process.cwd(),
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      prettier,
      custom: { rules: customRules },
      import: importPlugin,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      ...tseslint.configs['recommended-type-checked'].rules,
      ...tseslint.configs.strict.rules,
      ...prettierConfig.rules,
      '@typescript-eslint/interface-name-prefix': 'off',
      '@typescript-eslint/explicit-function-return-type': 'error',
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/no-unused-vars': 'error',
      '@typescript-eslint/prefer-readonly': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/prefer-nullish-coalescing': 'off',
      '@typescript-eslint/prefer-optional-chain': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/consistent-type-definitions': ['error', 'interface'],
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-extraneous-class': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      'max-classes-per-file': ['error', 1],
      '@typescript-eslint/prefer-enum-initializers': 'error',
      '@typescript-eslint/member-ordering': [
        'error',
        {
          default: [
            // Fields first
            'public-static-field',
            'protected-static-field',
            'private-static-field',
            'public-field',
            'protected-field',
            'private-field',

            // Constructor
            'constructor',

            // Public methods
            'public-static-method',
            'public-method',

            // Protected methods
            'protected-static-method',
            'protected-method',

            // Private methods last
            'private-static-method',
            'private-method',
          ],
        },
      ],
      'custom/no-mixed-declarations': 'error',
      'custom/no-db-queries-outside-services': 'error',
      'custom/dto-validation-rules': 'error',
      'custom/consistent-file-naming': 'error',
      'custom/no-empty-catch-blocks': 'error',
      complexity: ['error', 50],
      'max-depth': ['error', 4],
      'max-lines-per-function': ['error', 100],
      'no-magic-numbers': 'off',
      'import/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          'newlines-between': 'always',
          pathGroups: [
            {
              pattern: '~/**',
              group: 'internal',
              position: 'before',
            },
          ],
          pathGroupsExcludedImportTypes: ['builtin'],
        },
      ],
      'prettier/prettier': 'error',
    },
  },
  {
    languageOptions: {
      globals: {
        fetch: 'readonly',
        process: 'readonly',
        console: 'readonly',
        require: 'readonly',
        module: 'readonly',
        __dirname: 'readonly',
      },
    },
  },
  {
    files: ['**/*.constants.ts', '**/*.enum.ts', '**/*.interface.ts', '**/seeds/**/*.ts'],
    rules: {
      'no-magic-numbers': 'off',
    },
  },
  {
    files: ['datasource.config.ts'],
    rules: {
      'custom/no-db-queries-outside-services': 'off',
    },
  },
  {
    ignores: ['dist/', 'node_modules/', '.eslintrc.js'],
  },
];
