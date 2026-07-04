#!/usr/bin/env node
// Genere src/models.registry.generated.ts depuis src/models.registry.yaml.
// Le YAML reste la source de verite ; ce module TS est l'artefact que webpack
// (Next.js/Vercel) et Node (worker Cloud Run, vitest) embarquent de maniere
// fiable via un import statique, contrairement a un readFileSync() au runtime
// que le tracer de fichiers de Next ne detecte pas.

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'

const here = dirname(fileURLToPath(import.meta.url))
const srcDir = join(here, '..', 'src')
const yamlPath = join(srcDir, 'models.registry.yaml')
const outPath = join(srcDir, 'models.registry.generated.ts')

const text = readFileSync(yamlPath, 'utf8')
const data = yaml.load(text)

const header = '/* AUTO-GENERATED depuis models.registry.yaml (scripts/gen-registry.mjs) - ne pas editer a la main. */\n'
const body = `export const registryData: unknown = ${JSON.stringify(data, null, 2)}\n`

writeFileSync(outPath, header + body)
console.log(`[gen-registry] ${outPath} genere depuis ${yamlPath}`)
