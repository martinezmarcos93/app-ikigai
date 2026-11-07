import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const htmlPath = new URL('../iron-pixel-v2.html', import.meta.url);
const html = await readFile(htmlPath, 'utf8');
const ids = [...html.matchAll(/\bid\s*=\s*(["'])(.*?)\1/gs)].map((match) => match[2]);
const declared = new Set(ids);
const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
const inlineScripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)]
  .filter((match) => !/\bsrc\s*=/i.test(match[1]));
const errors = [];

for (const [index, script] of inlineScripts.entries()) {
  try {
    new vm.Script(script[2], { filename: `inline-script-${index + 1}.js` });
  } catch (error) {
    errors.push(`Sintaxis en script inline #${index + 1}: ${error.message}`);
  }
}

// Solo contar argumentos literales de accesos DOM por id; los colores '#09090b'
// y otros strings que contienen # no son referencias a nodos.
const idReferences = new Set();
const referencePatterns = [
  /\$\(\s*(["'])([^"']+)\1\s*\)/g,
  /\bgetElementById\(\s*(["'])([^"']+)\1\s*\)/g,
  /\bquerySelector\(\s*(["'])#([^"']+)\1\s*\)/g,
];
for (const pattern of referencePatterns) {
  for (const match of html.matchAll(pattern)) idReferences.add(match[2]);
}
const missing = [...idReferences].filter((id) => !declared.has(id));
if (duplicates.length) errors.push(`IDs duplicados: ${duplicates.join(', ')}`);
if (missing.length) errors.push(`IDs usados pero inexistentes: ${missing.join(', ')}`);

console.log(`Scripts inline verificados: ${inlineScripts.length}`);
console.log(`IDs declarados: ${declared.size}; referencias DOM comprobadas: ${idReferences.size}`);
console.log(`IDs duplicados: ${duplicates.length}; referencias inexistentes: ${missing.length}`);
if (errors.length) {
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exitCode = 1;
} else {
  console.log('Auditoría estática OK.');
}
