import fs from "fs";
import path from "path";
import type { AppPaths } from "../services/app-paths";
import { assertSafeResourceId, resolvePathWithinRoot } from "../developer-tools/path-utils";
import { resolveDataEngineDistModule } from "./bag-detail-adapter-path";

export type ScraperFileBundle = {
  source: string;
  metadata: Record<string, unknown>;
};

export type DisplayFileBundle = {
  html: string;
  css: string;
  javascript: string;
  metadata: Record<string, unknown>;
};

export class ProjectCodeStorageService {
  constructor(private readonly paths: AppPaths) {}

  getProjectCodeRoot(projectId: string): string {
    assertSafeResourceId(projectId, "project ID");
    return resolvePathWithinRoot(this.paths.projects, projectId);
  }

  getScraperCurrentDir(projectId: string): string {
    return resolvePathWithinRoot(this.getProjectCodeRoot(projectId), "scraper", "current");
  }

  getScraperRevisionDir(projectId: string, revisionId: string): string {
    assertSafeResourceId(revisionId, "revision ID");
    return resolvePathWithinRoot(
      this.getProjectCodeRoot(projectId),
      "scraper",
      "revisions",
      revisionId,
    );
  }

  getDisplayCurrentDir(projectId: string, displayId: string): string {
    assertSafeResourceId(displayId, "display ID");
    return resolvePathWithinRoot(
      this.getProjectCodeRoot(projectId),
      "displays",
      displayId,
      "current",
    );
  }

  getDisplayRevisionDir(
    projectId: string,
    displayId: string,
    revisionId: string,
  ): string {
    assertSafeResourceId(displayId, "display ID");
    assertSafeResourceId(revisionId, "revision ID");
    return resolvePathWithinRoot(
      this.getProjectCodeRoot(projectId),
      "displays",
      displayId,
      "revisions",
      revisionId,
    );
  }

  writeScraperPublished(projectId: string, source: string, metadata: Record<string, unknown>) {
    const dir = this.getScraperCurrentDir(projectId);
    this.writeBundle(dir, {
      sourceFile: "scraper.js",
      source,
      metadata,
    });
  }

  writeScraperRevision(
    projectId: string,
    revisionId: string,
    source: string,
    metadata: Record<string, unknown>,
  ) {
    const dir = this.getScraperRevisionDir(projectId, revisionId);
    this.writeBundle(dir, {
      sourceFile: "scraper.js",
      source,
      metadata,
    });
  }

  readScraperPublished(projectId: string): ScraperFileBundle | null {
    return this.readScraperBundle(this.getScraperCurrentDir(projectId));
  }

  readScraperRevision(
    projectId: string,
    revisionId: string,
  ): ScraperFileBundle | null {
    return this.readScraperBundle(this.getScraperRevisionDir(projectId, revisionId));
  }

  writeDisplayPublished(
    projectId: string,
    displayId: string,
    bundle: DisplayFileBundle,
  ) {
    const dir = this.getDisplayCurrentDir(projectId, displayId);
    this.writeDisplayBundle(dir, bundle);
  }

  writeDisplayRevision(
    projectId: string,
    displayId: string,
    revisionId: string,
    bundle: DisplayFileBundle,
  ) {
    const dir = this.getDisplayRevisionDir(projectId, displayId, revisionId);
    this.writeDisplayBundle(dir, bundle);
  }

  readDisplayPublished(
    projectId: string,
    displayId: string,
  ): DisplayFileBundle | null {
    return this.readDisplayBundle(this.getDisplayCurrentDir(projectId, displayId));
  }

  readDisplayRevision(
    projectId: string,
    displayId: string,
    revisionId: string,
  ): DisplayFileBundle | null {
    return this.readDisplayBundle(
      this.getDisplayRevisionDir(projectId, displayId, revisionId),
    );
  }

  deleteDisplayRevision(
    projectId: string,
    displayId: string,
    revisionId: string,
  ): void {
    const dir = this.getDisplayRevisionDir(projectId, displayId, revisionId);
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  deleteDisplayTree(projectId: string, displayId: string): void {
    assertSafeResourceId(displayId, "display ID");
    const displayRoot = resolvePathWithinRoot(
      this.getProjectCodeRoot(projectId),
      "displays",
      displayId,
    );
    if (fs.existsSync(displayRoot)) {
      fs.rmSync(displayRoot, { recursive: true, force: true });
    }
  }

  listDataEngineRuntimeFiles(): Array<{ path: string; source: string }> {
    const distDir = path.join(
      resolveDataEngineDistModule(this.paths, "index.js").workerRoot,
      "dist",
    );
    if (!fs.existsSync(distDir)) {
      return [];
    }

    const files: Array<{ path: string; source: string }> = [];
    const walk = (directory: string, prefix: string) => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
        const absolutePath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          walk(absolutePath, relativePath);
          continue;
        }
        if (!entry.name.endsWith(".js")) {
          continue;
        }
        files.push({
          path: relativePath.replace(/\\/g, "/"),
          source: fs.readFileSync(absolutePath, "utf8"),
        });
      }
    };
    walk(distDir, "");
    files.sort((left, right) => left.path.localeCompare(right.path));
    return files;
  }

  private writeBundle(
    dir: string,
    input: {
      sourceFile: string;
      source: string;
      metadata: Record<string, unknown>;
    },
  ) {
    fs.mkdirSync(dir, { recursive: true });
    const tempSource = path.join(dir, `${input.sourceFile}.tmp`);
    const tempMetadata = path.join(dir, "metadata.json.tmp");
    fs.writeFileSync(tempSource, input.source, "utf8");
    fs.writeFileSync(tempMetadata, JSON.stringify(input.metadata, null, 2), "utf8");
    fs.renameSync(tempSource, path.join(dir, input.sourceFile));
    fs.renameSync(tempMetadata, path.join(dir, "metadata.json"));
  }

  private writeDisplayBundle(dir: string, bundle: DisplayFileBundle) {
    fs.mkdirSync(dir, { recursive: true });
    const files = [
      ["index.html", bundle.html],
      ["styles.css", bundle.css],
      ["script.js", bundle.javascript],
      ["metadata.json", JSON.stringify(bundle.metadata, null, 2)],
    ] as const;

    for (const [filename, contents] of files) {
      const target = path.join(dir, filename);
      const temp = `${target}.tmp`;
      fs.writeFileSync(temp, contents, "utf8");
      fs.renameSync(temp, target);
    }
  }

  private readScraperBundle(dir: string): ScraperFileBundle | null {
    const sourcePath = path.join(dir, "scraper.js");
    if (!fs.existsSync(sourcePath)) {
      return null;
    }
    return {
      source: fs.readFileSync(sourcePath, "utf8"),
      metadata: this.readMetadata(path.join(dir, "metadata.json")),
    };
  }

  private readDisplayBundle(dir: string): DisplayFileBundle | null {
    const htmlPath = path.join(dir, "index.html");
    if (!fs.existsSync(htmlPath)) {
      return null;
    }
    return {
      html: fs.readFileSync(htmlPath, "utf8"),
      css: this.readOptional(path.join(dir, "styles.css")),
      javascript: this.readOptional(path.join(dir, "script.js")),
      metadata: this.readMetadata(path.join(dir, "metadata.json")),
    };
  }

  private readOptional(filePath: string): string {
    return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
  }

  private readMetadata(filePath: string): Record<string, unknown> {
    if (!fs.existsSync(filePath)) {
      return {};
    }
    try {
      return JSON.parse(fs.readFileSync(filePath, "utf8")) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
}
