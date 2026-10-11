// Regenerates src/theme.css from tailwindcss/theme.css (see header of that file).
const fs = require('fs');
const css = fs.readFileSync('node_modules/tailwindcss/theme.css', 'utf8');
const pal = ['slate', 'cyan', 'emerald', 'red', 'amber', 'purple', 'blue', 'rose'];
const shades = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
const get = (p, s) => css.match(new RegExp(`--color-${p}-${s}:\\s*([^;]+);`))[1].trim();
const neutralInv = { 50: 950, 100: 900, 200: 800, 300: 700, 400: 600, 500: 500, 600: 400, 700: 300, 800: 200, 900: 100, 950: 50 };
const accentInv = { 50: 950, 100: 900, 200: 900, 300: 800, 400: 700, 500: 600, 600: 600, 700: 500, 800: 300, 900: 200, 950: 100 };
let theme = '@theme inline {\n  --color-white: var(--c-white);\n  --color-black: var(--c-black);\n';
let dark = ':root {\n  --c-white: #ffffff;\n  --c-black: #000000;\n';
let light = '[data-theme="light"] {\n  --c-white: #0f172a;\n  --c-black: #ffffff;\n';
for (const p of pal) for (const s of shades) {
  theme += `  --color-${p}-${s}: var(--c-${p}-${s});\n`;
  dark += `  --c-${p}-${s}: ${get(p, s)};\n`;
  light += `  --c-${p}-${s}: ${get(p, (p === 'slate' ? neutralInv : accentInv)[s])};\n`;
}
fs.writeFileSync('src/theme.css', '/* GENERATED palette: routes Tailwind colours through CSS variables so the light theme can remap them.\n   Regenerate with: node scripts/gen-theme.cjs */\n' + theme + '\n' + dark + '}\n\n' + light + '}\n'.replace('}\n}', '}\n'));
