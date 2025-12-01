module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    project: './tsconfig.json'
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended'
  ],
  env: {
    node: true,
    es2022: true
  },
  rules: {
    // 允许 any 类型（MCP SDK 大量使用）
    '@typescript-eslint/no-explicit-any': 'off',

    // 允许未使用的变量（以 _ 开头）
    '@typescript-eslint/no-unused-vars': [
      'warn',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_'
      }
    ],

    // 允许 require
    '@typescript-eslint/no-var-requires': 'off',

    // 允许空函数
    '@typescript-eslint/no-empty-function': 'off',

    // 允许非空断言
    '@typescript-eslint/no-non-null-assertion': 'off',

    // 禁止 console（但允许 warn 和 error）
    'no-console': ['warn', { allow: ['warn', 'error'] }],

    // 优先使用 const
    'prefer-const': 'error'
  },
  ignorePatterns: [
    'dist/',
    'node_modules/',
    '*.js',
    'bin/'
  ]
};
