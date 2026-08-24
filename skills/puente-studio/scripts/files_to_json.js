#!/usr/bin/env node
/**
 * files_to_json.js
 * ----------------
 * Convierte un directorio de archivos de app a un JSON compatible con la API de Puente OS.
 * Es el paso previo a crear o actualizar un artefacto vía POST /insert_artefacto
 * o PUT /update_artefacto/{id}.
 *
 * Es el paso inverso de pull_artefacto.js:
 *   pull_artefacto.js  →  descarga artefacto → archivos locales
 *   files_to_json.js   →  archivos locales   → JSON de la API
 *
 * El JSON generado tiene la estructura:
 * {
 *   "ruta/del/archivo.tsx": {
 *     "content": "<contenido del archivo>",
 *     "type":    "tsx"
 *   },
 *   ...
 * }
 *
 * Uso:
 *   node <skill-directory>/scripts/files_to_json.js [directorio_entrada] [archivo_salida]
 *
 * Ejemplos:
 *   node <skill-directory>/scripts/files_to_json.js
 *   node <skill-directory>/scripts/files_to_json.js ./app/files
 *   node <skill-directory>/scripts/files_to_json.js ./app/files ./app/output.json
 *
 * Requisitos:
 *   - Node.js 14+ (sin dependencias externas)
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ─── Argumentos CLI ───────────────────────────────────────────────────────────

const args = process.argv.slice(2);

// The installed skill may live in a plugin cache. Operate on the consuming
// project (the current working directory), never on the skill installation.
const projectRoot = process.cwd();
const DEFAULT_INPUT = path.join(projectRoot, 'app', 'files');
const DEFAULT_OUTPUT = path.join(projectRoot, 'app', 'output.json');

const inputDir = path.resolve(args[0] || DEFAULT_INPUT);
const outputFile = path.resolve(args[1] || DEFAULT_OUTPUT);

// ─── Recorrer directorio ──────────────────────────────────────────────────────

/**
 * Recorre recursivamente el directorio y genera el mapa de archivos
 * compatible con el campo `app_content` de la API de Puente OS.
 *
 * @param {string} baseDir    - Directorio raíz (para calcular rutas relativas)
 * @param {string} currentDir - Directorio actual en la recursión
 * @returns {Record<string, { content: string, type: string }>}
 */
function buildAppContent(baseDir, currentDir = baseDir) {
    const result = {};
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);

        if (entry.isDirectory()) {
            // Recursión: incluir subdirectorios (e.g. components/)
            Object.assign(result, buildAppContent(baseDir, fullPath));
        } else if (entry.isFile()) {
            // Clave: ruta relativa al directorio base con separador UNIX "/"
            const relPath = path.relative(baseDir, fullPath).split(path.sep).join('/');
            // Extensión sin el punto: "tsx", "ts", "js", "css", etc.
            const ext = path.extname(entry.name).slice(1);
            // Contenido del archivo como string UTF-8
            const content = fs.readFileSync(fullPath, 'utf-8');

            result[relPath] = { content, type: ext };
        }
    }

    return result;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
    // Validar directorio de entrada
    if (!fs.existsSync(inputDir)) {
        console.error(`\n❌  El directorio de entrada no existe: ${inputDir}`);
        console.error(`    Crea tus archivos en app/files/ o pasa la ruta como argumento.\n`);
        process.exit(1);
    }

    console.log(`\n📂  Leyendo archivos desde: ${path.relative(projectRoot, inputDir)}/`);

    const appContent = buildAppContent(inputDir);
    const fileCount = Object.keys(appContent).length;

    if (fileCount === 0) {
        console.error(`\n❌  El directorio está vacío: ${inputDir}\n`);
        process.exit(1);
    }

    console.log(`✅  Se procesaron ${fileCount} archivo(s):`);
    Object.keys(appContent).forEach(k =>
        console.log(`     • ${k.padEnd(45)} [${appContent[k].type}]`)
    );

    // Crear directorio de salida si no existe
    fs.mkdirSync(path.dirname(outputFile), { recursive: true });

    // Guardar JSON con indentación legible
    fs.writeFileSync(outputFile, JSON.stringify(appContent, null, 4), 'utf-8');

    console.log(`\n💾  JSON guardado en: ${path.relative(projectRoot, outputFile)}`);
    console.log(`\n📝  Próximos pasos:`);
    console.log(`    - Sigue el flujo de creación o actualización descrito en SKILL.md.`);
}

main();
