#!/usr/bin/env node

import { promises as fs } from "node:fs";
import { join, dirname, resolve, parse as parsePath } from "node:path";
import { fileURLToPath } from "node:url";

/*
	Generates SQL files to import crime incident data into a Cloudflare D1 database.
*/

// Determine project root directory based on current file location
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, "..", "..");

// Display usage information
function usage() {
	console.error("Usage: node scripts/generate-d1-import.mjs [--no-transaction] <input-json> [output-dir]");
	console.error("Defaults to writing SQL files under ../../data/d1/.");
	console.error("Pass --no-transaction for remote D1 imports, which disallow manual BEGIN/COMMIT statements.");
}

// Generate a slug from a string for use in filenames and identifiers
function slugify(value) {
	return (
		value
			.toLowerCase()
			.replace(/[^a-z0-9]+/gi, "_")
			.replace(/^_+|_+$/g, "") || "dataset"
	);
}

// Escape a value for safe inclusion in an SQL statement
function escapeValue(value) {
	if (value === null || value === undefined) return "NULL";
	if (typeof value === "number") {
		if (Number.isFinite(value)) return String(value);
		return "NULL";
	}
	if (typeof value === "boolean") {
		return value ? "1" : "0";
	}
	const stringValue = String(value).replace(/'/g, "''");
	return `'${stringValue}'`;
}

// Main function to process input and generate SQL files
async function main() {
	const args = process.argv.slice(2);
	const noTxIndex = args.indexOf("--no-transaction"); // Check for no-transaction flag
	const useTransactions = noTxIndex === -1;
	if (!useTransactions) {
		args.splice(noTxIndex, 1);
	}
	const [inputArg, outputArg] = args;
	if (!inputArg) {
		usage();
		process.exitCode = 1;
		return;
	}

	const inputPath = resolve(process.cwd(), inputArg);
	const outputDir = outputArg
		? resolve(process.cwd(), outputArg)
		: join(projectRoot, "data", "d1");

	const inputInfo = parsePath(inputPath);
	const slug = slugify(inputInfo.name);
	// Read and parse the input JSON file
	let jsonRaw;
	try {
		jsonRaw = await fs.readFile(inputPath, "utf8");
	} catch (error) {
		console.error(`Failed to read input file: ${inputPath}`);
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
		return;
	}
	// Parse JSON content
	let data;
	try {
		data = JSON.parse(jsonRaw);
	} catch (error) {
		console.error("Input file is not valid JSON.");
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
		return;
	}
	// Extract features from the JSON structure
	const features = [];
	if (Array.isArray(data.layers)) {
		for (const layer of data.layers) {
			const layerId = layer?.id ?? null;
			const layerFeatures = Array.isArray(layer?.features) ? layer.features : [];
			for (const feature of layerFeatures) {
				const geometry = feature?.geometry ?? {};
				const attributes = feature?.attributes ?? {};
				features.push({
					layer_id: layerId,
					x: geometry?.x ?? null,
					y: geometry?.y ?? null,
					OBJECTID: attributes?.OBJECTID ?? null,
					GO_Number: attributes?.GO_Number ?? null,
					Offence_Summary: attributes?.Offence_Summary ?? null,
					Offence_Category: attributes?.Offence_Category ?? null,
					Time_of_Day: attributes?.Time_of_Day ?? null,
					Week_Day: attributes?.Week_Day ?? null,
					Intersection: attributes?.Intersection ?? null,
					Neighbourhood: attributes?.Neighbourhood ?? null,
					Sector: attributes?.Sector ?? null,
					Division: attributes?.Division ?? null,
					Ward: attributes?.Ward ?? null,
					Reported_Date_str: attributes?.Reported_Date_str ?? null,
					Reported_Year_str: attributes?.Reported_Year_str ?? null,
					Reported_Hour_str: attributes?.Reported_Hour_str ?? null,
					Occurred_Date_str: attributes?.Occurred_Date_str ?? null,
					Occurred_Year_str: attributes?.Occurred_Year_str ?? null,
					Occurred_Hour_str: attributes?.Occurred_Hour_str ?? null,
				});
			}
		}
	} else {
		console.warn("JSON did not contain a top-level 'layers' array. No features extracted.");
	}
	// Define SQL schema statements
	const schemaStatements = [
		"CREATE TABLE IF NOT EXISTS incidents (",
		"  id INTEGER PRIMARY KEY AUTOINCREMENT,",
		"  layer_id INTEGER,",
		"  object_id INTEGER,",
		"  go_number TEXT,",
		"  offence_summary TEXT,",
		"  offence_category TEXT,",
		"  time_of_day TEXT,",
		"  week_day TEXT,",
		"  intersection TEXT,",
		"  neighbourhood TEXT,",
		"  sector TEXT,",
		"  division TEXT,",
		"  ward TEXT,",
		"  reported_date TEXT,",
		"  reported_year TEXT,",
		"  reported_hour TEXT,",
		"  occurred_date TEXT,",
		"  occurred_year TEXT,",
		"  occurred_hour TEXT,",
		"  x REAL,",
		"  y REAL",
		");",
		"CREATE INDEX IF NOT EXISTS idx_incidents_go ON incidents(go_number);",
		"CREATE INDEX IF NOT EXISTS idx_incidents_category ON incidents(offence_category);",
		"CREATE INDEX IF NOT EXISTS idx_incidents_occurred_date ON incidents(occurred_date);",
		"CREATE INDEX IF NOT EXISTS idx_incidents_neighbourhood ON incidents(neighbourhood);",
	];
	// Construct schema SQL with or without transactions
	const schemaSqlHeader = `-- Schema for Cloudflare D1 / SQLite`;
	const schemaBody = schemaStatements.join("\n");
	const schemaSql = useTransactions
		? `
-- Schema for Cloudflare D1 / SQLite
PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;

${schemaBody}

COMMIT;
`.trim()
		: `
${schemaSqlHeader}
${schemaBody}
`.trim();

	const insertHeader =
		"INSERT INTO incidents (layer_id, object_id, go_number, offence_summary, offence_category, time_of_day, week_day, intersection, neighbourhood, sector, division, ward, reported_date, reported_year, reported_hour, occurred_date, occurred_year, occurred_hour, x, y) VALUES";
	const batchSize = 500;
	let currentBatch = [];
	const batches = [];

	for (const record of features) {
		const row = `(${[
			escapeValue(record.layer_id),
			escapeValue(record.OBJECTID),
			escapeValue(record.GO_Number),
			escapeValue(record.Offence_Summary),
			escapeValue(record.Offence_Category),
			escapeValue(record.Time_of_Day),
			escapeValue(record.Week_Day),
			escapeValue(record.Intersection),
			escapeValue(record.Neighbourhood),
			escapeValue(record.Sector),
			escapeValue(record.Division),
			escapeValue(record.Ward),
			escapeValue(record.Reported_Date_str),
			escapeValue(record.Reported_Year_str),
			escapeValue(record.Reported_Hour_str),
			escapeValue(record.Occurred_Date_str),
			escapeValue(record.Occurred_Year_str),
			escapeValue(record.Occurred_Hour_str),
			escapeValue(record.x),
			escapeValue(record.y),
		].join(",")})`;
		currentBatch.push(row);
		if (currentBatch.length === batchSize) {
			batches.push(`${insertHeader}\n${currentBatch.join(",\n")};`);
			currentBatch = [];
		}
	}

	if (currentBatch.length > 0) {
		if (useTransactions) {
			batches.push(`BEGIN TRANSACTION;\n${insertHeader}\n${currentBatch.join(",\n")};\nCOMMIT;`);
		} else {
			batches.push(`${insertHeader}\n${currentBatch.join(",\n")};`);
		}
	}

	await fs.mkdir(outputDir, { recursive: true });

	const schemaPath = join(outputDir, `${slug}_schema.sql`);
	const insertsPath = join(outputDir, `${slug}_inserts.sql`);
	const summaryPath = join(outputDir, `${slug}_summary.json`);

	await fs.writeFile(schemaPath, `${schemaSql}\n`, "utf8");
	await fs.writeFile(insertsPath, `${batches.join("\n\n")}\n`, "utf8");

	const summary = {
		source: inputInfo.base,
		totalFeatures: features.length,
		schemaPath,
		insertsPath,
		useTransactions,
		generatedAt: new Date().toISOString(),
	};
	await fs.writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

	console.log(
		[
			`Parsed ${features.length} features from ${inputInfo.base}.`,
			`Schema: ${schemaPath}`,
			`Inserts: ${insertsPath}`,
			`Summary: ${summaryPath}`,
		].join("\n"),
	);
}

await main();