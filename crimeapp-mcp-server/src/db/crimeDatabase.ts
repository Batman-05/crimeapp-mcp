export type CrimeDbSchema = {
	name: string;
	description?: string;
	columns: Array<{
		name: string;
		type: string;
		description?: string;
	}>;
};

export const DEFAULT_CRIME_DB_SCHEMA: CrimeDbSchema[] = [
	{
		name: "incidents",
		description: "One row per reported incident sourced from the municipal JSON feed.",
		columns: [
			{ name: "id", type: "integer", description: "Primary key assigned when the row is inserted." },
			{ name: "layer_id", type: "integer", description: "Identifier of the upstream layer the feature originated from." },
			{ name: "object_id", type: "integer", description: "Source OBJECTID value." },
			{ name: "go_number", type: "text", description: "Incident number from the source system." },
			{ name: "offence_summary", type: "text", description: "Summary description for the incident." },
			{ name: "offence_category", type: "text", description: "Categorized offence type." },
			{ name: "time_of_day", type: "text", description: "Bucketed time of day description." },
			{ name: "week_day", type: "text", description: "Weekday on which the incident occurred." },
			{ name: "intersection", type: "text", description: "Nearest intersection based on the data feed." },
			{ name: "neighbourhood", type: "text", description: "Neighbourhood label reported by the feed." },
			{ name: "sector", type: "text", description: "Sector identifier used by local police reporting." },
			{ name: "division", type: "text", description: "Police division or precinct reported for the incident." },
			{ name: "ward", type: "text", description: "Municipal ward identifier." },
			{ name: "reported_date", type: "text", description: "Date the incident was reported (string format from source)." },
			{ name: "reported_year", type: "text", description: "Reported year string." },
			{ name: "reported_hour", type: "text", description: "Reported hour string." },
			{ name: "occurred_date", type: "text", description: "Date the incident occurred (string format from source)." },
			{ name: "occurred_year", type: "text", description: "Occurred year string." },
			{ name: "occurred_hour", type: "text", description: "Occurred hour string." },
			{ name: "x", type: "real", description: "Projected X coordinate supplied by the dataset." },
			{ name: "y", type: "real", description: "Projected Y coordinate supplied by the dataset." },
		],
	},
];
