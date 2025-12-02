type ArticleRow = {
  article_id: number;
  source_id: number;
  title: string;
  byline: string | null;
  url_canonical: string;
  url_landing: string | null;
  published_at: string | null;
  main_image_url: string | null;
  categories: string | null;
  body_text: string | null;
  city_id: number;
};

type RelatedIncidentRow = {
  article_id: number;
  incident_id: number;
  go_number: string | null;
  offence_summary: string | null;
  offence_category: string | null;
  neighbourhood: string | null;
  occurred_date: string | null;
  reported_date: string | null;
  match_score: number | null;
  method: string;
};

export type RelatedIncident = {
  incidentId: number;
  goNumber?: string;
  summary?: string;
  category?: string;
  neighbourhood?: string;
  occurredDate?: string;
  reportedDate?: string;
  matchScore: number;
  method: string;
};

export type ArticleRecord = {
  id: number;
  sourceId: number;
  title: string;
  byline?: string;
  url: string;
  urlLanding?: string;
  publishedAt?: string;
  mainImageUrl?: string;
  categories: string[];
  excerpt?: string;
  relatedIncidents: RelatedIncident[];
  cityId: number;
};

type FetchArgs = {
  limit: number;
  since?: string;
  query?: string;
  sourceIds?: number[];
  cityId?: number;
};

export async function fetchArticles(db: D1Database, args: FetchArgs): Promise<ArticleRecord[]> {
  const filters: string[] = [];
  const params: (string | number)[] = [];

  if (args.since) {
    filters.push("AND published_at >= ?");
    params.push(args.since);
  }
  if (args.query) {
    filters.push("AND (title LIKE ? OR body_text LIKE ?)");
    const pattern = `%${args.query}%`;
    params.push(pattern, pattern);
  }
  if (args.sourceIds?.length) {
    const placeholders = args.sourceIds.map(() => "?").join(",");
    filters.push(`AND source_id IN (${placeholders})`);
    params.push(...args.sourceIds);
  }
  if (typeof args.cityId === "number") {
    filters.push("AND city_id = ?");
    params.push(args.cityId);
  }

  const sql = `
    SELECT
      article_id,
      source_id,
      title,
      byline,
      url_canonical,
      url_landing,
      published_at,
      main_image_url,
      categories,
      body_text,
      city_id
    FROM article
    WHERE 1 = 1
    ${filters.join("\n")}
    ORDER BY
      CASE WHEN published_at IS NULL THEN 1 ELSE 0 END,
      published_at DESC,
      article_id DESC
    LIMIT ?
  `;

  params.push(args.limit);

  const { results } = await db.prepare(sql).bind(...params).all<ArticleRow>();
  const rows = results ?? [];
  if (!rows.length) {
    return [];
  }

  let relatedByArticle = new Map<number, RelatedIncident[]>();
  const articleIds = rows.map((row) => row.article_id);
  try {
    relatedByArticle = await loadRelatedIncidents(db, articleIds);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!/no such table/i.test(message)) {
      throw error;
    }
  }

  return rows.map((row) => ({
    id: row.article_id,
    sourceId: row.source_id,
    title: row.title,
    byline: row.byline ?? undefined,
    url: row.url_canonical,
    urlLanding: row.url_landing ?? undefined,
    publishedAt: row.published_at ?? undefined,
    mainImageUrl: row.main_image_url ?? undefined,
    categories: row.categories?.split(",").map((c) => c.trim()).filter(Boolean) ?? [],
    excerpt: row.body_text?.slice(0, 280),
    relatedIncidents: relatedByArticle.get(row.article_id) ?? [],
    cityId: row.city_id,
  }));
}

async function loadRelatedIncidents(
  db: D1Database,
  articleIds: number[],
): Promise<Map<number, RelatedIncident[]>> {
  const map = new Map<number, RelatedIncident[]>();
  if (!articleIds.length) {
    return map;
  }

  const placeholders = articleIds.map(() => "?").join(",");
  const sql = `
    SELECT
      l.article_id,
      l.match_score,
      l.method,
      i.id AS incident_id,
      i.go_number,
      i.offence_summary,
      i.offence_category,
      i.neighbourhood,
      i.occurred_date,
      i.reported_date
    FROM article_incident_links l
    INNER JOIN incidents i ON i.id = l.incident_id
    WHERE l.article_id IN (${placeholders})
    ORDER BY l.article_id, l.match_score DESC, i.id DESC
  `;
  const { results } = await db.prepare(sql).bind(...articleIds).all<RelatedIncidentRow>();
  for (const row of results ?? []) {
    const list = map.get(row.article_id) ?? [];
    list.push({
      incidentId: row.incident_id,
      goNumber: row.go_number ?? undefined,
      summary: row.offence_summary ?? undefined,
      category: row.offence_category ?? undefined,
      neighbourhood: row.neighbourhood ?? undefined,
      occurredDate: row.occurred_date ?? undefined,
      reportedDate: row.reported_date ?? undefined,
      matchScore: typeof row.match_score === "number" ? row.match_score : 0,
      method: row.method,
    });
    map.set(row.article_id, list);
  }
  return map;
}
