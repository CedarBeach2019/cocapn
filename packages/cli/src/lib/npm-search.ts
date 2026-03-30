/**
 * npm Search — Search npm registry for cocapn-plugin packages
 */

export interface NpmSearchResult {
  name: string;
  version: string;
  description: string;
  author: string;
  downloads: number;
}

interface NpmSearchObject {
  package: {
    name: string;
    version: string;
    description?: string;
    author?: { name?: string } | string;
    links?: { npm?: string };
  };
  score?: {
    detail?: {
      popularity?: number;
    };
  };
  searchScore?: number;
}

interface NpmSearchResponse {
  objects: NpmSearchObject[];
  total: number;
}

/**
 * Search npm for cocapn-plugin-* packages matching a query.
 */
export async function searchPlugins(query: string): Promise<NpmSearchResult[]> {
  const searchQuery = `${query}+keywords:cocapn-plugin`;
  const url = `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(searchQuery)}&size=20`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`npm search failed: ${response.statusText}`);
  }

  const data = await response.json() as NpmSearchResponse;

  return data.objects.map((obj) => {
    const pkg = obj.package;
    let authorName = "";
    if (typeof pkg.author === "string") {
      authorName = pkg.author;
    } else if (pkg.author?.name) {
      authorName = pkg.author.name;
    }

    return {
      name: pkg.name,
      version: pkg.version,
      description: pkg.description || "",
      author: authorName,
      downloads: obj.score?.detail?.popularity || 0,
    };
  });
}

/**
 * Fetch package metadata from npm for detailed info.
 */
export async function getPluginInfo(name: string): Promise<{
  name: string;
  version: string;
  description: string;
  author: string;
  license?: string;
  repository?: string;
  homepage?: string;
  keywords?: string[];
}> {
  const url = `https://registry.npmjs.org/${encodeURIComponent(name)}`;
  const response = await fetch(url);
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Package not found: ${name}`);
    }
    throw new Error(`npm registry error: ${response.statusText}`);
  }

  const data = await response.json() as Record<string, unknown>;
  const latest = data["dist-tags"] as Record<string, string> | undefined;
  const latestVersion = latest?.["latest"] || Object.keys((data["versions"] as Record<string, unknown>) || {})[0];
  const versionData = latestVersion
    ? (data["versions"] as Record<string, Record<string, unknown>>)[latestVersion]
    : undefined;

  let authorName = "";
  const author = data["author"] as { name?: string } | string | undefined;
  if (typeof author === "string") {
    authorName = author;
  } else if (author?.name) {
    authorName = author.name;
  }

  const repo = versionData?.["repository"] as { url?: string } | string | undefined;
  let repository: string | undefined;
  if (typeof repo === "string") {
    repository = repo;
  } else if (repo?.url) {
    repository = repo.url;
  }

  return {
    name: name,
    version: latestVersion || "unknown",
    description: (data["description"] as string) || "",
    author: authorName,
    license: (versionData?.["license"] as string) || (data["license"] as string) || undefined,
    repository,
    homepage: (versionData?.["homepage"] as string) || (data["homepage"] as string) || undefined,
    keywords: data["keywords"] as string[] | undefined,
  };
}
