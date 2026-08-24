#!/usr/bin/env node
/**
 * pull_artefacto.js
 * -----------------
 * Descarga un artefacto de Puente OS por ID y escribe sus archivos
 * en un directorio local (por defecto app/files/), listos para editar.
 *
 * Es el paso inverso de files_to_json.js:
 *   pull_artefacto.js  →  descarga artefacto → archivos locales
 *   files_to_json.js   →  archivos locales   → JSON de la API
 *
 * Uso:
 *   node <skill-directory>/scripts/pull_artefacto.js <artefacto_id> [directorio_salida]
 *
 * Ejemplos:
 *   node <skill-directory>/scripts/pull_artefacto.js 547
 *   node <skill-directory>/scripts/pull_artefacto.js 547 ./app/files
 *   node <skill-directory>/scripts/pull_artefacto.js 547 ./app/mi-backup
 *
 * Requisitos:
 *   - Node.js 14+ (sin dependencias externas)
 *   - STUDIO_KEY exportada o en el archivo .env del proyecto actual
 *
 * Variables de entorno leídas desde .env:
 *   STUDIO_KEY — Platform API Key de Puente Studio (puente_studio_xxx) (obligatorio)
 *   BASE_URL   — URL base de la API (obligatorio)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// Keys que NO son nombres de archivo aunque estén en el root del JSON
const NON_FILE_KEYS = new Set([
    'titulo', 'descripcion', 'id', 'public_id', 'slug',
    'empresa_id', 'equipo_id', 'fecha_creacion', 'app_content',
    'contenido_html', 'artefacto', 'request_id', 'message',
]);

// Extensiones reconocidas como archivos de código
const FILE_EXT_REGEX = /\.(tsx|ts|jsx|js|css|html|json|md|txt|svg|py|scss|vue)$/i;

// ─── Cargar .env ──────────────────────────────────────────────────────────────

/**
 * Lee un archivo .env y retorna un objeto con las variables.
 * Soporta comentarios (#) y líneas vacías.
 * @param {string} envPath - Ruta absoluta al archivo .env
 * @returns {Record<string, string>}
 */
function loadEnv(envPath) {
    const env = {};
    if (!fs.existsSync(envPath)) return env;
    fs.readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
        line = line.trim();
        if (!line || line.startsWith('#')) return;
        const idx = line.indexOf('=');
        if (idx === -1) return;
        env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    });
    return env;
}

// ─── HTTP helper ──────────────────────────────────────────────────────────────

/**
 * Hace un GET HTTP/HTTPS con autenticación X-API-Key y retorna el JSON parseado.
 * @param {string} url
 * @param {string} apiKey - STUDIO_KEY (puente_studio_xxx)
 * @returns {Promise<{ status: number, data: any }>}
 */
function fetchJSON(url, apiKey) {
    return new Promise((resolve, reject) => {
        const parsed = new URL(url);
        const lib = parsed.protocol === 'https:' ? https : http;
        const options = {
            hostname: parsed.hostname,
            port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
            path: parsed.pathname + parsed.search,
            method: 'GET',
            headers: {
                'X-API-Key': apiKey,
                'Content-Type': 'application/json',
            },
        };
        const req = lib.request(options, res => {
            let body = '';
            res.on('data', chunk => (body += chunk));
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: JSON.parse(body) });
                } catch {
                    resolve({ status: res.statusCode, data: body });
                }
            });
        });
        req.on('error', reject);
        req.end();
    });
}

// ─── Extraer app_content ──────────────────────────────────────────────────────

/**
 * Extrae el mapa de archivos desde la respuesta de la API.
 * La API puede devolver los archivos de dos formas:
 *   1. Anidados: { "app_content": { "App.tsx": {...}, ... } }
 *   2. En el root: { "App.tsx": {...}, "data.ts": {...}, ... }
 *
 * @param {object} data - Respuesta JSON de la API
 * @returns {Record<string, { content: string, type: string }> | null}
 */
function extractAppContent(data) {
    // Forma 1: campo app_content explícito (estructura nueva)
    if (data.app_content && typeof data.app_content === 'object') {
        return data.app_content;
    }
    if (data.artefacto?.app_content) {
        return data.artefacto.app_content;
    }

    // Forma 2: archivos directamente en el root del JSON (estructura legacy)
    const hasFiles = Object.keys(data).some(
        k => !NON_FILE_KEYS.has(k) && (FILE_EXT_REGEX.test(k) || k.includes('/'))
    );
    if (hasFiles) return data;

    return null;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
    const projectRoot = process.cwd();

    // Argumentos CLI
    const artefactoId = process.argv[2];
    if (!artefactoId || isNaN(Number(artefactoId))) {
        console.error('\n❌  Debes proporcionar un ID de artefacto numérico.');
        console.error('    Uso: node <skill-directory>/scripts/pull_artefacto.js <artefacto_id> [directorio_salida]\n');
        process.exit(1);
    }

    // Rutas
    const outputDir = process.argv[3]
        ? path.resolve(process.argv[3])
        : path.join(projectRoot, 'app', 'files');

    // Cargar configuración desde .env
    const env = loadEnv(path.join(projectRoot, '.env'));
    const studioKey = process.env.STUDIO_KEY || env.STUDIO_KEY;
    const baseUrl = process.env.BASE_URL || env.BASE_URL;

    if (
        !studioKey
        || studioKey === 'puente_studio_'
        || studioKey.includes('<')
        || studioKey.includes('{STUDIO_KEY}')
    ) {
        console.error('\n❌  No se encontró una STUDIO_KEY válida.');
        console.error('    Expórtala en el entorno o configúrala en el .env del proyecto actual.\n');
        process.exit(1);
    }
    if (!baseUrl || baseUrl.includes('<') || baseUrl.includes('{BASE_URL}')) {
        console.error('\n❌  No se encontró una BASE_URL válida.');
        console.error('    Expórtala en el entorno o configúrala en el .env del proyecto actual.\n');
        process.exit(1);
    }
    const base = baseUrl.replace(/\/$/, '');

    // Fetch
    const url = `${base}/studio/artefactos/${artefactoId}`;
    console.log(`\n🔍  Obteniendo artefacto ID ${artefactoId}...`);

    const { status, data } = await fetchJSON(url, studioKey);

    // Errores HTTP
    if (status === 401) {
        console.error('\n❌  Error 401 — STUDIO_KEY inválida o revocada.');
        console.error('    Genera una nueva desde app.puente.xyz → Configuración y actualiza .env.\n');
        process.exit(1);
    }
    if (status === 403) {
        console.error('\n❌  Error 403 — Sin permiso para acceder a este artefacto.');
        console.error('    Verifica que el artefacto pertenezca a tu equipo.\n');
        process.exit(1);
    }
    if (status === 404) {
        console.error(`\n❌  Error 404 — Artefacto ${artefactoId} no encontrado.\n`);
        process.exit(1);
    }
    if (status !== 200) {
        console.error(`\n❌  Error ${status}:`, JSON.stringify(data, null, 2), '\n');
        process.exit(1);
    }

    // Metadatos del artefacto
    const appContent = extractAppContent(data);
    const isDirectFmt = !data.app_content && !data.artefacto?.app_content && appContent;
    const titulo = data.titulo || data.artefacto?.titulo
        || (isDirectFmt ? `Artefacto ${artefactoId}` : '(sin título)');
    const descripcion = data.descripcion || data.artefacto?.descripcion || '';
    const groupId = data.artefacto_group_id || data.artefacto?.artefacto_group_id || null;

    console.log(`✅  Artefacto encontrado:`);
    console.log(`    📌  ID         : ${artefactoId}`);
    if (groupId) console.log(`    🔑  group_id   : ${groupId}`);
    console.log(`    📋  Título     : ${titulo}`);
    if (descripcion) console.log(`    📝  Descripción: ${descripcion}`);

    // Sin app_content — intentar contenido_html
    if (!appContent) {
        const html = data.contenido_html || data.artefacto?.contenido_html;
        if (html) {
            console.warn('\n⚠️   El artefacto usa el formato HTML legacy (contenido_html).');
            fs.mkdirSync(outputDir, { recursive: true });
            const outFile = path.join(outputDir, 'index.html');
            fs.writeFileSync(outFile, html, 'utf-8');
            console.log(`\n💾  Guardado como: ${path.relative(projectRoot, outFile)}\n`);
        } else {
            console.warn('\n⚠️   El artefacto no tiene app_content ni contenido_html.');
            console.log('    Respuesta de la API:');
            console.log(JSON.stringify(data, null, 2));
        }
        return;
    }

    // Información sobre los archivos a escribir
    const archivos = Object.keys(appContent);
    console.log(`    📁  Archivos   : ${archivos.length}`);
    console.log(`    📂  Destino    : ${path.relative(projectRoot, outputDir)}/`);

    // Advertencia si el directorio destino ya tiene contenido
    if (fs.existsSync(outputDir)) {
        const existing = fs.readdirSync(outputDir);
        if (existing.length > 0) {
            console.log(`\n⚠️   El directorio ya existe con ${existing.length} elemento(s).`);
            console.log(`    Los archivos existentes con el mismo nombre serán sobreescritos.`);
        }
    }

    console.log('');

    // Escribir archivos
    let escritos = 0;
    for (const [filePath, fileData] of Object.entries(appContent)) {
        // Ignorar keys que no son archivos (en formato directo)
        if (NON_FILE_KEYS.has(filePath)) continue;

        const content = typeof fileData === 'object' ? (fileData.content ?? '') : String(fileData);
        const tipo = typeof fileData === 'object' ? (fileData.type || path.extname(filePath).slice(1)) : '';
        const absPath = path.resolve(outputDir, filePath);
        const relativePath = path.relative(outputDir, absPath);
        if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
            console.warn(`    ⚠️   Ruta insegura omitida: ${filePath}`);
            continue;
        }

        fs.mkdirSync(path.dirname(absPath), { recursive: true });
        fs.writeFileSync(absPath, content, 'utf-8');

        console.log(`    ✅  ${filePath.padEnd(45)} [${tipo}]`);
        escritos++;
    }

    // Resumen final
    console.log(`\n💾  ${escritos} archivo(s) escritos en: ${path.relative(projectRoot, outputDir)}/`);
    console.log(`\n📝  Próximos pasos:`);
    console.log(`    1. Edita los archivos en ${path.relative(projectRoot, outputDir)}/`);
    console.log(`    2. Convierte a JSON con el script files_to_json.js incluido en esta skill.`);
    if (groupId) {
        console.log(`    3. Sube los cambios:   curl -X PUT $BASE_URL/studio/artefactos/group/${groupId} -H "X-API-Key: $STUDIO_KEY" -H "Content-Type: application/json" -d @app/output.json`);
    } else {
        console.log(`    3. Obtén el group_id:  curl $BASE_URL/studio/artefactos/${artefactoId}/meta -H "X-API-Key: $STUDIO_KEY"`);
        console.log(`    4. Sube los cambios:   curl -X PUT $BASE_URL/studio/artefactos/group/<group_id> -H "X-API-Key: $STUDIO_KEY" -H "Content-Type: application/json" -d @app/output.json`);
    }
    console.log(`\n⚠️   Pushea siempre por group_id — el id numérico cambia con cada versión.`);
    console.log('');
}

main().catch(err => {
    console.error('\n❌  Error inesperado:', err.message, '\n');
    process.exit(1);
});
