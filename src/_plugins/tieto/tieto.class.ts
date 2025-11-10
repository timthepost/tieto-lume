/**
 * Tieto - A simple flat-file, vector-based semantic search engine
 * designed for providing completion for RAG servers, LLM long-term 
 * memory of conversations and context.
 * 
 * Buckets based on cosine similiarity of dimensional vectors, then 
 * refines based on Eculidean distance. Extremely fast and memory-efficient;
 * runs on most serverlesss platforms just fine.
 * 
 * Copyright (C) 2025 Tim Post 
 * License: Apache 2
 */

import { walk } from "https://deno.land/std@0.204.0/fs/walk.ts";
import { join } from "https://deno.land/std@0.204.0/path/mod.ts";
import { extract } from "https://deno.land/std@0.204.0/front_matter/yaml.ts";

// for filter parsing
type Op = "=" | ">=" | "<=" | ">" | "<" | "in";
interface Filter {
  key: string;
  op: Op;
  value: string | string[];
}

export interface TietoConfig {
  // The first two options here are particularly important, and are designed
  // to be used in conjunction with each other. 
  //
  // Cosine similarity measures the angle between vectors (semantic similarity)
  // - not affected by magnitude, only direction (opposite | unrelated | related)
  //
  // Euclidean distance measures straight-line distance between vector endpoints
  // - influenced by both direction and magnitude
  //
  // To put it in ths simplest-possible terms: Cosine similarity is the steam shovel,
  // Euclidean distance is the sifter.
  //
  // The *quality* of the embeddings used during ingestion and querying significantly
  // affect this symphony; as they say: "garbage in, garbage out." If the embeddings 
  // don't map well to the actual language, the results will just seem random. Ideally,
  // the same embedding model is used for ingestion and querying (Nomic Text is the
  // best unless you know for sure what you've got is better).
  //
  // Now, with that said, we define two key things: how similiar things have to be in 
  // order for the steam shovel to pick them up (cosine similiarity),  and then how 
  // close they have to be in literal meaning in order to get through the sieve (Euclidean
  // distance). 
  //
  // Eventually, the next two settings will be auto-sensing based on corpus, but that's quite
  // a challenge for such a tiny class.
  //
  // For cosine similiarity, a larger value is stronger signal (higher similarity = stronger 
  // result). 0.6 is noisy, 0.7 is good for fuzzy docs search, 0.8+ is very scrutinizing.
  // default: 0.4
  minSimilarityThreshold?: number;
  // For Euclidean distance, a smaller value is stronger signal (shorter distance).
  // Values have float precision and range between 1.0 and 0.1, with 1.0 being the most noisy.
  // 0.9 - 0.8 is good for general use. 0.7 and below for exceeding scrutiny. This is relative
  // to corpus size and language used, so you may need to play with it.
  // default: 0.8
  maxDistance?: number;

  // 
  // Now, the boring no-math configuration options:
  //

  // directory within {topics}/{topicName} where JSONL embeddings live
  embeddingsDirectory?: string;
  // directory holding topics
  topicsDirectory?: string;
  // be extremely noisy about what's happening
  debug?: boolean;
  // embedding completion URL (environment, then localhost v1/embeddings by default)
  embeddingUrl?: string;
  // completion URL (environment, then localhost v1/completion by default)
  completionUrl?: string;
  // Your (OpenAPI, Claude, Featherless, OpenRouter or (whatever)) bearer token
  apiKey?: string;
  // how big of pieces should documents be broken up into? Default is 1k
  chunkSize?: number;
  // maximum number of results to show
  maxResults?: number;

  //
  // These control the settings issued to the model for RAG completion only (has no
  // effect on embedding calls)
  // 
  
  completionParams?: {
    // Token selection distribution modifier (0 for dry, very proper responses, 0.7
    // for "cool high school professor" style distribution, 1.75+ for "buzzed poet"
    // style distribution. Doesn't affect *what things* the model says, only *how* it
    // says those things).
    temperature?: number;
    // how many tokens should the model generate by default? Responses can exceed or
    // fall short of this - it is a default length to target when generation starts.
    n_predict?: number;
    // API-specific limits (throw if request would exceed it)
    // not yet fully working; comprehensive token estimating is planned. Tieto assumes
    // local models by default (no need for token accounting)
    max_tokens?: number;
    // completion model (by name, e.g haiku or gpt-mini)
    // needed if using some third-party AI services (e.g. Claude, ChatGPT)
    // usually something like {vendor}-{version}-{modeel}-{build_date}, ex:
    // claude-3-haiku-20240307 
    modelName?: string;
  };
}

interface Chunk {
  text: string;
  embedding: number[];
  meta: Record<string, unknown>;
}

interface ScoredChunk extends Chunk {
  score: number;
  distance?: number;
}

export class Tieto {
  private config: Required<TietoConfig>;

  constructor(config: TietoConfig = {}) {
    this.config = {
      minSimilarityThreshold: config.minSimilarityThreshold ?? 0.4,
      maxDistance: config.maxDistance ?? 0.8,
      topicsDirectory: config.topicsDirectory ?? "topics",
      embeddingsDirectory: config.embeddingsDirectory ?? "memory",
      debug: config.debug ??
        (Deno.args.includes("--debug") || Deno.env.get("TIETO_DEBUG") === "1"),
      embeddingUrl: config.embeddingUrl ?? Deno.env.get("TIETO_EMBEDDING_URL") ??
        "http://localhost:8080/v1/embeddings",
      completionUrl: config.completionUrl ??
        Deno.env.get("TIETO_COMPLETION_URL") ?? "",
      apiKey: config.apiKey ?? Deno.env.get("TIETO_API_KEY") ?? "",
      chunkSize: config.chunkSize ?? 3,
      maxResults: config.maxResults ?? 3,
      completionParams: {
        temperature: 0,
        n_predict: 128,
        max_tokens: 500,
        modelName: config.completionParams?.modelName ?? "",
      },
    };
  }

  private logDebug(...args: unknown[]) {
    if (this.config.debug) console.log("===", ...args);
  }

  // extremely fast comparison
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error("Vectors must have the same dimension.");
    }
    const dot = a.reduce((s, ai, i) => s + ai * b[i], 0);
    const na = Math.hypot(...a);
    const nb = Math.hypot(...b);
    return dot / (na * nb);
  }

  // differentiate between precise and fuzzy matches
  // longer distances = fuzzier match
  private euclideanDistance(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error("Vectors must have the same dimension.");
    }
    const sumOfSquaredDifferences = a.reduce((sum, ai, i) => {
      const difference = ai - b[i];
      return sum + difference * difference;
    }, 0);
    return Math.sqrt(sumOfSquaredDifferences);
  }

  // You can modify this to use a third-party embedding model, if you
  // need to.
  async embed(text: string): Promise<Float32Array> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.config.apiKey) {
      headers["Authorization"] = `Bearer ${this.config.apiKey}`;
    }

    const response = await fetch(this.config.embeddingUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ input: text }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(
        `Embedding request failed: ${response.status} ${errText}`,
      );
    }

    const json = await response.json();

    if (
      !json.data ||
      !Array.isArray(json.data) ||
      !json.data[0]?.embedding ||
      !Array.isArray(json.data[0].embedding)
    ) {
      throw new Error("Embedding output malformed or missing");
    }

    return new Float32Array(json.data[0].embedding);
  }

  async ingest(path: string): Promise<void> {
    const raw = await Deno.readTextFile(path);
    const { attrs: meta, body } = extract(raw);
    const lines = body.split("\n").map((l) => l.trim()).filter(Boolean);

    const chunks: Chunk[] = [];

    for (let i = 0; i < lines.length; i += this.config.chunkSize) {
      const text = lines.slice(i, i + this.config.chunkSize).join("\n");
      const vec = Array.from(await this.embed(text));
      chunks.push({ text, embedding: vec, meta });
    }

    const [, topic, nameTxt] = path.split("/");
    const out = `${this.config.topicsDirectory}/${topic}/${this.config.embeddingsDirectory}/${nameTxt.replace(/\.txt$/, ".jsonl")}`;
    await Deno.writeTextFile(
      out,
      chunks.map((c) => JSON.stringify(c)).join("\n"),
    );
    this.logDebug(`✅ Ingested → ${out}`);
  }

  parseFilters(args: string[]): Filter[] {
    const filters: Filter[] = [];
    for (let i = 0; i < args.length; i++) {
      let expr: string | undefined;
      // styles:  --filter key=val   OR  --filter=key=val
      if (args[i] === "--filter") {
        expr = args[i + 1];
        i++; // skip value token
      } else if (args[i].startsWith("--filter=")) {
        expr = args[i].slice("--filter=".length);
      }
      if (!expr) continue;

      const match = expr.match(/^([^\s><=]+)\s*(>=|<=|=|>|<|in)\s*(.+)$/);
      if (!match) {
        this.logDebug(`⚠️  Ignoring bad filter expression: '${expr}'`);
        continue;
      }
      const [, key, op, valRaw] = match as [string, string, Op, string];
      const value: string | string[] = op === "in"
        ? valRaw.split(",").map((s) => s.trim())
        : valRaw.trim();
      filters.push({ key, op, value });
    }
    this.logDebug("Parsed_filters:", filters);
    return filters;
  }

  private satisfies(meta: Record<string, unknown>, f: Filter): boolean {
    const actualRaw = meta?.[f.key];
    if (actualRaw === undefined || actualRaw === null) return false;

    // convert arrays, objects → string consistently for comparison
    const actualStr = Array.isArray(actualRaw)
      ? actualRaw.join(",")
      : actualRaw.toString();

    if (f.op === "=") return actualStr === f.value;
    if (f.op === "in") {
      const list = Array.isArray(f.value)
        ? f.value
        : (f.value as string).split(",");
      return list.includes(actualStr);
    }

    // numeric or date compare
    const left = Number(actualStr) || Date.parse(actualStr);
    const right = Number(f.value as string) || Date.parse(f.value as string);
    if (isNaN(left) || isNaN(right)) return false;

    switch (f.op) {
      case ">=":
        return left >= right;
      case "<=":
        return left <= right;
      case ">":
        return left > right;
      case "<":
        return left < right;
    }

    // default
    return false;
  }

  async search(
    topic: string,
    question: string,
    filters: Filter[] = [],
  ): Promise<ScoredChunk[]> {
    const memDir = join(this.config.topicsDirectory, 
      topic, this.config.embeddingsDirectory);
    const chunks: Chunk[] = [];

    for await (
      const file of walk(memDir, { exts: [".jsonl"], includeDirs: false })
    ) {
      const lines = (await Deno.readTextFile(file.path)).trim().split("\n");
      for (const line of lines) {
        const c = JSON.parse(line);
        if (filters.every((f) => this.satisfies(c.meta ?? {}, f))) {
          chunks.push(c);
        } else {
          this.logDebug("⛔ Excluded by filter:", c.meta);
        }
      }
    }

    if (!chunks.length) {
      this.logDebug("⚠️  No data matched filters", filters);
      return [];
    }

    const qVec = Array.from(await this.embed(question));
    const scored = chunks.map((c) => (
      { 
        ...c, 
        score: this.cosineSimilarity(c.embedding, qVec), 
        distance: this.euclideanDistance(c.embedding, qVec) 
      }
    ))
      .sort((a, b) => b.score - a.score)
      .slice(0, this.config.maxResults);

    // Not exactly needed once you get the class dialed into the corpus you're using, 
    // but if that corpus changes, you'll miss having this. I suggest leaving it here :)
    this.logDebug(
      "Query: minimum score for inclusion is " +
      this.config.minSimilarityThreshold + 
      " with a distance of " + this.config.maxDistance
    );
    this.logDebug("Query: winning cosine similarity score was ", scored[0]?.score);
    this.logDebug("Query: selected winner Euclidean distance was ", scored[0]?.distance);
    this.logDebug("Info: Selected chunks follow below, and are not intentionally sorted by distance.");

    if (this.config.debug) {
      for (const element of scored) {
        console.log("===");
        console.log(
          "= Text: ",
          '"' + element.text.replace(/\n/g, "\\n").replace(/\r/g, "\\r") + '"',
        );
        console.log("= Cosine Similarity Score: ", element.score);
        console.log("= Euclidean Distance From Embedded Query: ", element.distance);
      }
      console.log("===");
      console.log("");
    }

    return scored.filter((chunk) =>
      chunk.score >= this.config.minSimilarityThreshold &&
      chunk.distance <= this.config.maxDistance
    );
  }

  buildPrompt(context: string, question: string): string {
    return `Use the information between the dashes "---" to answer the question that follows:\n\n---\n\n${context}\n\n---\n\nQuestion: ${question}\n`;
  }

  async complete(prompt: string): Promise<string> {
    if (!this.config.completionUrl) {
      return prompt; // Return prompt if no completion URL configured
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.config.apiKey) {
      headers["Authorization"] = `Bearer ${this.config.apiKey}`;
    }

    // Support different API formats and providers, with localhost
    // (llama.cpp style) being the alternative. Not an exhaustive 
    // list (need to maintain one most likely)
    const body = 
        this.config.completionUrl.includes("anthropic") ||
        this.config.completionUrl.includes("openai") ||
        this.config.completionUrl.includes("featherless") ||
        this.config.completionUrl.includes("openrouter") ||
        this.config.completionUrl.includes("atlas")
      ? JSON.stringify({
        model: this.config.completionParams.modelName,
        messages: [{ role: "user", content: prompt }],
        max_tokens: this.config.completionParams.max_tokens,
        temperature: this.config.completionParams.temperature,
      })
      : JSON.stringify({
        prompt,
        temperature: this.config.completionParams.temperature,
        n_predict: this.config.completionParams.n_predict,
      });

    const res = await fetch(this.config.completionUrl, {
      method: "POST",
      headers,
      body,
    });

    if (!res.ok) {
      throw new Error(`Completion request failed: ${res.status}`);
    }

    const json = await res.json();

    // Handle different response formats
    if (json.choices && json.choices[0]?.message?.content) {
      return json.choices[0].message.content.trim(); // OpenAI/Anthropic format
    } else if (json.content) {
      return json.content.trim(); // llama.cpp format
    }

    return "";
  }

  /**
   * Main query method - searches for relevant chunks and optionally generates completion
   * @param topic - directory where the documents are
   * @param question - user query to vectorize and compare
   * @param filters - array of frontmatter filters to refine the query
   * @param returnRaw - return prompt instead of running completion (completion-only mode)
   * @returns Scored chunks or empty array (raw mode), "no info for this" error string otherwise.
   */
  async query(
    topic: string,
    question: string,
    filters: Filter[] = [],
    returnRaw = false,
  ): Promise<
    string | { chunks: ScoredChunk[]; response?: string; prompt?: string }
  > {
    const chunks = await this.search(topic, question, filters);

    if (!chunks.length) {
      const msg = "No relevant chunks found above similarity threshold";
      this.logDebug("⚠️  " + msg);
      return returnRaw ? { chunks: [] } : msg;
    }

    const context = chunks.map((c) => c.text).join("\n\n");
    const prompt = this.buildPrompt(context, question);

    if (returnRaw) {
      const response = this.config.completionUrl
        ? await this.complete(prompt)
        : undefined;
      return { chunks, response, prompt };
    }

    if (!this.config.completionUrl) {
      console.log(prompt);
      return prompt;
    }

    const response = await this.complete(prompt);
    console.log(response);
    return response;
  }

  //
  // Utility methods for external integrations
  // 

  // Using one config object that's constantly updated is
  // basically expected use of the class. 
  updateConfig(updates: Partial<TietoConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  // Return the current config for inspection
  getConfig(): Required<TietoConfig> {
    return { ...this.config };
  }
}
