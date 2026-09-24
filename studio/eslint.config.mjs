import studio from '@sanity/eslint-config-studio'
import prettier from 'eslint-config-prettier/flat'
import { pinTsconfigRootDir, typescriptRecommended } from '../eslint.base.mjs'

// Sanity's preset registers typescript-eslint under the `typescript` namespace itself,
// and ESLint refuses to register the same plugin name twice. Drop that registration —
// keeping the preset's rules, which reference the plugin by name — so
// `typescriptRecommended('typescript')` below owns it for every TS extension.
function withoutTypescriptPlugin(config) {
  if (!config.plugins?.typescript) return config

  const { plugins, ...rest } = config
  return rest
}

export default [
  // Sanity's preset contributes global ignores for `.sanity/` and `dist/`.
  // The CLI backup archives are re-scanned by every `eslint .` and `prettier .` run.
  { ignores: ['backups/'] },

  pinTsconfigRootDir(import.meta.dirname),

  ...studio.map(withoutTypescriptPlugin),
  // Enabling the recommended rules under Sanity's namespace keeps one instance per rule
  // instead of reporting twice for the rules the preset already turns on.
  ...typescriptRecommended('typescript'),

  prettier,
]
