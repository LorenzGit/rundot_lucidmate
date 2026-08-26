#!/usr/bin/env node
/**
 * Align package.json with the next RUN platform version.
 *
 * rundot can only bump Major/Minor/Patch off the latest uploaded version. It
 * cannot set an arbitrary number. RUNSHIP therefore: read latest platform
 * version → write that + one patch into package.json → deploy --bump Patch.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export function catalogListing(text) {
    const marker = text.search(/\bVersions:\s*/i);
    if (marker >= 0) return text.slice(marker);
    return text.replace(/^rundot CLI \d+\.\d+\.\d+.*$/gim, "");
}

export function parseVersions(text) {
    const catalog = catalogListing(text);
    const matches = [...catalog.matchAll(/\b(\d+)\.(\d+)\.(\d+)\b/g)].map((match) => ({
        raw: `${match[1]}.${match[2]}.${match[3]}`,
        major: Number(match[1]),
        minor: Number(match[2]),
        patch: Number(match[3]),
    }));
    matches.sort((a, b) => a.major - b.major || a.minor - b.minor || a.patch - b.patch);
    return matches;
}

export function nextVersion(latest, kind) {
    if (kind === "major") return `${latest.major + 1}.0.0`;
    if (kind === "minor") return `${latest.major}.${latest.minor + 1}.0`;
    return `${latest.major}.${latest.minor}.${latest.patch + 1}`;
}

function main() {
    const root = process.cwd();
    const packagePath = path.join(root, "package.json");
    const bump = process.argv.includes("--minor") ? "minor" : process.argv.includes("--major") ? "major" : "patch";
    const dryRun = process.argv.includes("--dry-run");

    const listing = execFileSync("rundot", ["game", "list-versions"], {
        encoding: "utf8",
        cwd: root,
        env: process.env,
    });
    const versions = parseVersions(listing);
    if (versions.length === 0) {
        console.error("sync-platform-version: rundot game list-versions returned no versions");
        process.exit(1);
    }
    const latest = versions[versions.length - 1];
    const next = nextVersion(latest, bump);
    const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
    const previous = pkg.version;
    if (!dryRun) {
        pkg.version = next;
        fs.writeFileSync(packagePath, `${JSON.stringify(pkg, null, 4)}\n`);
    }
    console.log(
        `in-game ${previous} → ${next} (RUN latest ${latest.raw}, deploy --bump ${bump[0].toUpperCase()}${bump.slice(1)})`,
    );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main();
}
