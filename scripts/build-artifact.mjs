// public/ を 1 ファイルの HTML にまとめる（Artifact など単一ファイル配布向け）
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const r = (p) => readFileSync(new URL(`../public/${p}`, import.meta.url), 'utf8');
const js = ['js/calc.js', 'js/presets.js', 'js/app.js']
  .map(r)
  .join('\n')
  .replace(/^import[^;]*;\n/gm, '')
  .replace(/^export (async )?(function|const|let)/gm, '$1$2 ');
const html = r('index.html');
const body = html.match(/<main>[\s\S]*<\/main>/)[0];
const out = `<title>教育費貯蓄プランナー</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>
${r('style.css')}
</style>
${body}
<script type="module">
${js}
</script>
`;
mkdirSync(new URL('../dist/', import.meta.url), { recursive: true });
writeFileSync(new URL('../dist/artifact.html', import.meta.url), out);
console.log('dist/artifact.html', out.length, 'bytes');
