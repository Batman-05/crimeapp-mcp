#!/usr/bin/env node

/*
This script fetches raw crime data from the ArcGIS FeatureServer as used by the web app.
Saves to ./data/raw/ by default, or a custom path if provided via --out <path>.
*/


import { createWriteStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { pipeline } from "node:stream";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const streamPipeline = promisify(pipeline);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, "..", "..");

// used to test manually and ensure we are retrieving the same data as the web app
const BASE =
	env.ARCGIS_BASEURL;
const LAYER_ID = 8; // CrimeMap layer (case-sensitive path!)
const DATA_FORMAT = "json"; // "json" | "geojson"
const RETURN_GEOMETRY = true; // false = attributes only (smaller file)
const OUT_SR = 4326; // 4326 = WGS84 lat/lon, 102100 = Web Mercator
const WHERE = "1=1"; // change to filter (e.g., "Occurred_Year >= 2024")

const DEFAULT_OUTPUT_DIR = join(projectRoot, "data", "raw");

// Numeric timestamp fields duplicate the *_str values; drop them for to be consistent with manual exports.
const ATTRIBUTES_TO_DROP = [
	"Reported_Date",
	"Reported_Year",
	"Reported_Hour",
	"Occurred_Date",
	"Occurred_Year",
	"Occurred_Hour",
	"Day_of_Week",
	"Councillor",
];

// Optional: limit fields (comma-separated). Use "*" for all.
const OUT_FIELDS = "*";

// Optional: replica name seen in server logs
const REPLICA_NAME = `CrimeMap_YTD_${Date.now()}`;

function parseCliOptions() {
	const args = process.argv.slice(2);
	const outFlagIndex = args.indexOf("--out");
	if (outFlagIndex === -1) {
		return undefined;
	}

	const value = args[outFlagIndex + 1];
	if (!value) {
		throw new Error("Missing value after --out flag.");
	}

	return resolve(process.cwd(), value);
}

function parseFilenameFromDisposition(headerValue) {
	if (!headerValue) return undefined;

	const filenameStarMatch = headerValue.match(/filename\*\s*=\s*(?:UTF-8''|)([^;]+)/i);
	if (filenameStarMatch?.[1]) {
		try {
			return decodeURIComponent(filenameStarMatch[1].trim().replace(/^"(.*)"$/, "$1"));
		} catch {
			// fall through to plain filename parsing
		}
	}

	const filenameMatch = headerValue.match(/filename\s*=\s*"([^"]+)"|filename\s*=\s*([^;]+)/i);
	if (!filenameMatch) return undefined;

	return (filenameMatch[1] || filenameMatch[2])?.trim().replace(/^"(.*)"$/, "$1");
}

function cleanReplicaPayload(payload) {
	if (!payload || typeof payload !== "object") {
		return payload;
	}

	if (!Array.isArray(payload.layers)) {
		return payload;
	}

	for (const layer of payload.layers) {
		if (!Array.isArray(layer?.features)) continue;
		for (const feature of layer.features) {
			if (!feature || typeof feature !== "object") continue;
			const attrs = feature.attributes;
			if (!attrs || typeof attrs !== "object") continue;
			for (const key of ATTRIBUTES_TO_DROP) {
				if (key in attrs) {
					delete attrs[key];
				}
			}
		}
	}

	return payload;
}

// ---- Helpers to read slightly different server responses ----
function pick(obj, keys) {
	for (const key of keys) {
		if (obj[key] !== undefined) {
			return obj[key];
		}
	}
	return undefined;
}

async function startExport() {
	const url = `${BASE}/createReplica`;
	const layerQueries = JSON.stringify({
		[LAYER_ID.toString()]: {
			where: WHERE,
			outFields: OUT_FIELDS,
			returnGeometry: RETURN_GEOMETRY,
			outSR: OUT_SR,
		},
	});

	const form = new URLSearchParams({
		f: "json",
		replicaName: REPLICA_NAME,
		layers: String(LAYER_ID),
		layerQueries,
		dataFormat: DATA_FORMAT,
		transportType: "esriTransportTypeUrl",
		async: "true",
		syncModel: "none",
		returnAttachments: "false",
		returnAttachmentsDataByUrl: "true",
	});

	const res = await fetch(url, { method: "POST", body: form });
	if (!res.ok) throw new Error(`createReplica failed: ${res.status} ${res.statusText}`);
	const body = await res.json();

	const statusUrl = pick(body, ["statusUrl", "statusurl"]);
	if (!statusUrl) {
		throw new Error(`No statusUrl in createReplica response: ${JSON.stringify(body)}`);
	}
	return statusUrl;
}

async function waitForResult(statusUrl) {
	while (true) {
		const res = await fetch(`${statusUrl}?f=json`);
		if (!res.ok) throw new Error(`status poll failed: ${res.status} ${res.statusText}`);
		const body = await res.json();
		const status = (body.status || "").toLowerCase();

		if (status === "completed" || status === "success" || status === "succeeded") {
			const resultUrl = body.resultUrl || body.result?.replicaUrl;
			if (!resultUrl) {
				throw new Error(`Job completed but no resultUrl: ${JSON.stringify(body)}`);
			}
			return resultUrl;
		}
		if (status === "failed" || status === "failure" || status === "error") {
			throw new Error(`Export failed: ${JSON.stringify(body)}`);
		}
		await new Promise((resolveDelay) => setTimeout(resolveDelay, 1000));
	}
}

async function downloadFile(fileUrl, outPathOverride) {
	const res = await fetch(fileUrl);
	if (!res.ok) throw new Error(`download failed: ${res.status} ${res.statusText}`);

	const contentDisposition = res.headers.get("content-disposition") || "";
	const suggestedFilename =
		parseFilenameFromDisposition(contentDisposition) ||
		`CrimeMap_YTD_${Date.now()}.${DATA_FORMAT === "json" ? "json" : "bin"}`;

	let finalPath;
	if (outPathOverride) {
		finalPath = extname(outPathOverride) ? outPathOverride : join(outPathOverride, suggestedFilename);
	} else {
		finalPath = join(DEFAULT_OUTPUT_DIR, suggestedFilename);
	}

	await mkdir(dirname(finalPath), { recursive: true });

	const contentType = (res.headers.get("content-type") || "").toLowerCase();
	const shouldPrettyPrint =
		contentType.includes("application/json") ||
		contentType.includes("text/json") ||
		extname(finalPath).toLowerCase() === ".json";

	if (shouldPrettyPrint) {
		const rawText = await res.text();
		try {
			const parsed = JSON.parse(rawText);
			const cleaned = cleanReplicaPayload(parsed);
			const formatted = `${JSON.stringify(cleaned, null, 2)}\n`;
			await writeFile(finalPath, formatted, "utf8");
		} catch (error) {
			console.warn("Failed to parse JSON response, saving raw payload.", error);
			await writeFile(finalPath, rawText, "utf8");
		}
	} else if (res.body && typeof res.body.pipe === "function") {
		await streamPipeline(res.body, createWriteStream(finalPath));
	} else {
		const buf = Buffer.from(await res.arrayBuffer());
		await writeFile(finalPath, buf);
	}

	return finalPath;
}

async function main() {
	const outputPathOverride = parseCliOptions();

	console.log("Starting export job...");
	if (outputPathOverride) {
		console.log(`Output override: ${outputPathOverride}`);
	} else {
		console.log(`Output directory: ${DEFAULT_OUTPUT_DIR}`);
	}

	const statusUrl = await startExport();
	console.log("Polling:", statusUrl);

	const resultUrl = await waitForResult(statusUrl);
	console.log("Downloading:", resultUrl);

	const savedPath = await downloadFile(resultUrl, outputPathOverride);
	console.log(`Saved -> ${savedPath}`);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
