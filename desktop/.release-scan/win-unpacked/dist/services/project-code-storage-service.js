"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectCodeStorageService = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const path_utils_1 = require("../developer-tools/path-utils");
const bag_detail_adapter_path_1 = require("./bag-detail-adapter-path");
class ProjectCodeStorageService {
    paths;
    constructor(paths) {
        this.paths = paths;
    }
    getProjectCodeRoot(projectId) {
        (0, path_utils_1.assertSafeResourceId)(projectId, "project ID");
        return (0, path_utils_1.resolvePathWithinRoot)(this.paths.projects, projectId);
    }
    getScraperCurrentDir(projectId) {
        return (0, path_utils_1.resolvePathWithinRoot)(this.getProjectCodeRoot(projectId), "scraper", "current");
    }
    getScraperRevisionDir(projectId, revisionId) {
        (0, path_utils_1.assertSafeResourceId)(revisionId, "revision ID");
        return (0, path_utils_1.resolvePathWithinRoot)(this.getProjectCodeRoot(projectId), "scraper", "revisions", revisionId);
    }
    getDisplayCurrentDir(projectId, displayId) {
        (0, path_utils_1.assertSafeResourceId)(displayId, "display ID");
        return (0, path_utils_1.resolvePathWithinRoot)(this.getProjectCodeRoot(projectId), "displays", displayId, "current");
    }
    getDisplayRevisionDir(projectId, displayId, revisionId) {
        (0, path_utils_1.assertSafeResourceId)(displayId, "display ID");
        (0, path_utils_1.assertSafeResourceId)(revisionId, "revision ID");
        return (0, path_utils_1.resolvePathWithinRoot)(this.getProjectCodeRoot(projectId), "displays", displayId, "revisions", revisionId);
    }
    writeScraperPublished(projectId, source, metadata) {
        const dir = this.getScraperCurrentDir(projectId);
        this.writeBundle(dir, {
            sourceFile: "scraper.js",
            source,
            metadata,
        });
    }
    writeScraperRevision(projectId, revisionId, source, metadata) {
        const dir = this.getScraperRevisionDir(projectId, revisionId);
        this.writeBundle(dir, {
            sourceFile: "scraper.js",
            source,
            metadata,
        });
    }
    readScraperPublished(projectId) {
        return this.readScraperBundle(this.getScraperCurrentDir(projectId));
    }
    readScraperRevision(projectId, revisionId) {
        return this.readScraperBundle(this.getScraperRevisionDir(projectId, revisionId));
    }
    writeDisplayPublished(projectId, displayId, bundle) {
        const dir = this.getDisplayCurrentDir(projectId, displayId);
        this.writeDisplayBundle(dir, bundle);
    }
    writeDisplayRevision(projectId, displayId, revisionId, bundle) {
        const dir = this.getDisplayRevisionDir(projectId, displayId, revisionId);
        this.writeDisplayBundle(dir, bundle);
    }
    readDisplayPublished(projectId, displayId) {
        return this.readDisplayBundle(this.getDisplayCurrentDir(projectId, displayId));
    }
    readDisplayRevision(projectId, displayId, revisionId) {
        return this.readDisplayBundle(this.getDisplayRevisionDir(projectId, displayId, revisionId));
    }
    deleteDisplayRevision(projectId, displayId, revisionId) {
        const dir = this.getDisplayRevisionDir(projectId, displayId, revisionId);
        if (fs_1.default.existsSync(dir)) {
            fs_1.default.rmSync(dir, { recursive: true, force: true });
        }
    }
    deleteDisplayTree(projectId, displayId) {
        (0, path_utils_1.assertSafeResourceId)(displayId, "display ID");
        const displayRoot = (0, path_utils_1.resolvePathWithinRoot)(this.getProjectCodeRoot(projectId), "displays", displayId);
        if (fs_1.default.existsSync(displayRoot)) {
            fs_1.default.rmSync(displayRoot, { recursive: true, force: true });
        }
    }
    listDataEngineRuntimeFiles() {
        const distDir = path_1.default.join((0, bag_detail_adapter_path_1.resolveDataEngineDistModule)(this.paths, "index.js").workerRoot, "dist");
        if (!fs_1.default.existsSync(distDir)) {
            return [];
        }
        const files = [];
        const walk = (directory, prefix) => {
            for (const entry of fs_1.default.readdirSync(directory, { withFileTypes: true })) {
                const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
                const absolutePath = path_1.default.join(directory, entry.name);
                if (entry.isDirectory()) {
                    walk(absolutePath, relativePath);
                    continue;
                }
                if (!entry.name.endsWith(".js")) {
                    continue;
                }
                files.push({
                    path: relativePath.replace(/\\/g, "/"),
                    source: fs_1.default.readFileSync(absolutePath, "utf8"),
                });
            }
        };
        walk(distDir, "");
        files.sort((left, right) => left.path.localeCompare(right.path));
        return files;
    }
    writeBundle(dir, input) {
        fs_1.default.mkdirSync(dir, { recursive: true });
        const tempSource = path_1.default.join(dir, `${input.sourceFile}.tmp`);
        const tempMetadata = path_1.default.join(dir, "metadata.json.tmp");
        fs_1.default.writeFileSync(tempSource, input.source, "utf8");
        fs_1.default.writeFileSync(tempMetadata, JSON.stringify(input.metadata, null, 2), "utf8");
        fs_1.default.renameSync(tempSource, path_1.default.join(dir, input.sourceFile));
        fs_1.default.renameSync(tempMetadata, path_1.default.join(dir, "metadata.json"));
    }
    writeDisplayBundle(dir, bundle) {
        fs_1.default.mkdirSync(dir, { recursive: true });
        const files = [
            ["index.html", bundle.html],
            ["styles.css", bundle.css],
            ["script.js", bundle.javascript],
            ["metadata.json", JSON.stringify(bundle.metadata, null, 2)],
        ];
        for (const [filename, contents] of files) {
            const target = path_1.default.join(dir, filename);
            const temp = `${target}.tmp`;
            fs_1.default.writeFileSync(temp, contents, "utf8");
            fs_1.default.renameSync(temp, target);
        }
    }
    readScraperBundle(dir) {
        const sourcePath = path_1.default.join(dir, "scraper.js");
        if (!fs_1.default.existsSync(sourcePath)) {
            return null;
        }
        return {
            source: fs_1.default.readFileSync(sourcePath, "utf8"),
            metadata: this.readMetadata(path_1.default.join(dir, "metadata.json")),
        };
    }
    readDisplayBundle(dir) {
        const htmlPath = path_1.default.join(dir, "index.html");
        if (!fs_1.default.existsSync(htmlPath)) {
            return null;
        }
        return {
            html: fs_1.default.readFileSync(htmlPath, "utf8"),
            css: this.readOptional(path_1.default.join(dir, "styles.css")),
            javascript: this.readOptional(path_1.default.join(dir, "script.js")),
            metadata: this.readMetadata(path_1.default.join(dir, "metadata.json")),
        };
    }
    readOptional(filePath) {
        return fs_1.default.existsSync(filePath) ? fs_1.default.readFileSync(filePath, "utf8") : "";
    }
    readMetadata(filePath) {
        if (!fs_1.default.existsSync(filePath)) {
            return {};
        }
        try {
            return JSON.parse(fs_1.default.readFileSync(filePath, "utf8"));
        }
        catch {
            return {};
        }
    }
}
exports.ProjectCodeStorageService = ProjectCodeStorageService;
