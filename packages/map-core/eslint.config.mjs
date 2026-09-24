import js from '@eslint/js'
import prettier from 'eslint-config-prettier/flat'
import { pinTsconfigRootDir, typescriptRecommended } from '../../eslint.base.mjs'

export default [
  pinTsconfigRootDir(import.meta.dirname),

  js.configs.recommended,
  ...typescriptRecommended(),
  prettier,
]
