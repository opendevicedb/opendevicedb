// SPDX-License-Identifier: AGPL-3.0-or-later
// Explicit source-only build. No device access or external profile inputs.
import { execFileSync } from "node:child_process";
import { copyFileSync, readFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
const repository = resolve(import.meta.dirname, "..");
const root = join(repository, "components/ultrasound/convex-open-image/0.1.0");
const shared = JSON.parse(readFileSync(join(root, "shared-sources.json"), "utf8"));
if (shared.format !== "odb-source-lock/1" || !Array.isArray(shared.files) || !shared.files.length) throw Error("Missing shared processing source lock");
for (const file of shared.files) {
  if (!file.path.startsWith("components/ultrasound/convex-decoder/1.0.0/") || file.path.split("/").some((p: string) => p.startsWith("."))) throw Error("Invalid shared processing source path");
  if (createHash("sha256").update(readFileSync(join(repository, file.path))).digest("hex") !== file.sha256) throw Error(`Shared processing source changed: ${file.path}`);
}
const wrapperSource = join(repository, "components/ultrasound/convex-decoder/1.0.0/build/reproducible-rustc.rs");
const target = join(root, "target", `wasm-repro-v1-${createHash("sha256").update(readFileSync(wrapperSource)).digest("hex").slice(0,16)}`);
mkdirSync(target, { recursive: true });
const wrapper = join(target, `odb-reproducible-rustc${process.platform === "win32" ? ".exe" : ""}`);
execFileSync("rustc", ["+1.99.0", wrapperSource, "-O", "-o", wrapper], { stdio: "inherit" });
const environment = { ...process.env };
delete environment.RUSTFLAGS;
delete environment.RUSTC_WORKSPACE_WRAPPER;
environment.RUSTC_WRAPPER = wrapper;
environment.CARGO_TARGET_DIR = target;
environment.CARGO_ENCODED_RUSTFLAGS = [
  "-C", "link-arg=--max-memory=268435456",
  "-C", "metadata=odb-open-image-v1",
  "-C", "codegen-units=1",
  `--remap-path-prefix=${repository}=.`,
  `--remap-path-prefix=${process.env.CARGO_HOME ?? join(homedir(), ".cargo")}=/cargo`,
].join("\u001f");
execFileSync("cargo", ["+1.99.0", "build", "--manifest-path", join(root, "Cargo.toml"), "--lib", "--release", "--target", "wasm32-wasip1", "--locked"], {
  stdio: "inherit", env: environment,
});
const built = join(target, "wasm32-wasip1/release/probe_open_image.wasm");
const artifact = join(root, "decoder.wasm");
if (process.argv.includes("--check")) {
  if (!readFileSync(built).equals(readFileSync(artifact))) throw Error("Original image WASM differs; rebuild and regenerate component locks");
  console.log("Original image WASM reproducibly matches its sources");
} else copyFileSync(built, artifact);
