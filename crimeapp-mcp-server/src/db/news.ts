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
};

type FetchArgs = {
  limit: number;
  since?: string;
  query?: string;
  sourceIds?: number[];
};

export async function fetchArticles(db: D1Database, args: FetchArgs) {
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
      body_text
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
  return (results ?? []).map((row) => ({
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
  }));
}
