/**
 * InvertedIndex — fast text search with O(1) term lookups.
 *
 * An inverted index maps terms (tokens) to documents that contain them.
 * This provides significant performance improvement over linear scan
 * for large document collections.
 *
 * Common stop words (the, a, an, in, on, etc.) are filtered out.
 *
 * Example:
 *   index.add("doc1", "hello world")
 *   index.add("doc2", "hello there")
 *   index.search("hello") → ["doc1", "doc2"]
 *   index.search("world") → ["doc1"]
 */

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface TokenizedDocument {
  id: string;
  tokens: Set<string>;
}

export interface SearchResult {
  /** Document ID */
  id: string;
  /** Number of query terms matched */
  score: number;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

/**
 * Common English stop words that add little semantic value.
 * These are filtered out during tokenization.
 */
const STOP_WORDS = new Set([
  "a", "about", "above", "after", "again", "against", "all", "am", "an", "and",
  "any", "are", "aren't", "as", "at", "be", "because", "been", "before",
  "being", "below", "between", "both", "but", "by", "can't", "cannot", "could",
  "couldn't", "did", "didn't", "do", "does", "doesn't", "doing", "don't",
  "down", "during", "each", "few", "for", "from", "further", "had", "hadn't",
  "has", "hasn't", "have", "haven't", "having", "he", "he'd", "he'll", "he's",
  "her", "here", "here's", "hers", "herself", "him", "himself", "his", "how",
  "how's", "i", "i'd", "i'll", "i'm", "i've", "if", "in", "into", "is", "isn't",
  "it", "it's", "its", "itself", "let's", "me", "more", "most", "mustn't", "my",
  "myself", "no", "nor", "not", "of", "off", "on", "once", "only", "or", "other",
  "ought", "our", "ours", "ourselves", "out", "over", "own", "same", "shan't",
  "she", "she'd", "she'll", "she's", "should", "shouldn't", "so", "some", "such",
  "than", "that", "that's", "the", "their", "theirs", "them", "themselves",
  "then", "there", "there's", "these", "they", "they'd", "they'll", "they're",
  "they've", "this", "those", "through", "to", "too", "under", "until", "up",
  "very", "was", "wasn't", "we", "we'd", "we'll", "we're", "we've", "were",
  "weren't", "what", "what's", "when", "when's", "where", "where's", "which",
  "while", "who", "who's", "whom", "why", "why's", "with", "won't", "would",
  "wouldn't", "you", "you'd", "you'll", "you're", "you've", "your", "yours",
  "yourself", "yourselves",
]);

// ─── Tokenizer ─────────────────────────────────────────────────────────────────

/**
 * Tokenize text into searchable terms.
 *
 * Process:
 *   1. Split on whitespace and punctuation
 *   2. Convert to lowercase
 *   3. Filter out stop words
 *   4. Return as Set for deduplication
 */
export function tokenize(text: string): Set<string> {
  const tokens = new Set<string>();

  // Split on non-word characters (whitespace, punctuation, etc.)
  const words = text.toLowerCase().split(/[^a-z0-9]+/);

  for (const word of words) {
    // Filter out empty strings and stop words
    if (word.length > 1 && !STOP_WORDS.has(word)) {
      tokens.add(word);
    }
  }

  return tokens;
}

// ─── InvertedIndex ─────────────────────────────────────────────────────────────

export class InvertedIndex {
  /** Map: term → Set of document IDs containing the term */
  private index = new Map<string, Set<string>>();
  /** Map: document ID → tokenized document */
  private documents = new Map<string, TokenizedDocument>();

  /**
   * Add or update a document in the index.
   * If the document already exists, it is re-indexed.
   */
  add(id: string, content: string): void {
    const tokens = tokenize(content);

    // Remove old document if it exists
    this.remove(id);

    // Store document
    const doc: TokenizedDocument = { id, tokens };
    this.documents.set(id, doc);

    // Update inverted index
    for (const token of tokens) {
      let postings = this.index.get(token);
      if (!postings) {
        postings = new Set();
        this.index.set(token, postings);
      }
      postings.add(id);
    }
  }

  /**
   * Remove a document from the index.
   * No-op if the document doesn't exist.
   */
  remove(id: string): void {
    const doc = this.documents.get(id);
    if (!doc) return;

    // Remove from postings lists
    for (const token of doc.tokens) {
      const postings = this.index.get(token);
      if (postings) {
        postings.delete(id);
        // Clean up empty posting lists
        if (postings.size === 0) {
          this.index.delete(token);
        }
      }
    }

    // Remove document
    this.documents.delete(id);
  }

  /**
   * Search for documents matching the query.
   *
   * Returns documents sorted by relevance (number of matching terms).
   * Uses OR semantics: matches ANY of the query terms.
   */
  search(query: string): SearchResult[] {
    const queryTokens = tokenize(query);
    if (queryTokens.size === 0) return [];

    // Score documents by number of matched terms
    const scores = new Map<string, number>();

    for (const token of queryTokens) {
      const postings = this.index.get(token);
      if (!postings) continue;

      for (const docId of postings) {
        scores.set(docId, (scores.get(docId) || 0) + 1);
      }
    }

    // Convert to results and sort by score (descending)
    const results: SearchResult[] = [];
    for (const [id, score] of scores.entries()) {
      results.push({ id, score });
    }

    results.sort((a, b) => b.score - a.score);
    return results;
  }

  /**
   * Check if a document exists in the index.
   */
  has(id: string): boolean {
    return this.documents.has(id);
  }

  /**
   * Get the number of documents in the index.
   */
  size(): number {
    return this.documents.size;
  }

  /**
   * Clear all documents from the index.
   */
  clear(): void {
    this.index.clear();
    this.documents.clear();
  }

  /**
   * Get all document IDs in the index.
   */
  getDocumentIds(): string[] {
    return [...this.documents.keys()];
  }
}
