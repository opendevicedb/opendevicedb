// Explicit build only; never execute a build command from a contributor manifest.
import {execFileSync} from "node:child_process";
import {copyFileSync,readFileSync} from "node:fs";
import {join,resolve} from "node:path";
import {homedir} from "node:os";
const repository=resolve(import.meta.dirname,"..");
const root=join(repository,"components/ultrasound/convex-decoder/1.0.0");
const environment={...process.env};
delete environment.RUSTFLAGS;
environment.CARGO_ENCODED_RUSTFLAGS=[
  "-C","link-arg=--max-memory=268435456",
  "-C","metadata=odb-convex-decoder-v1",
  "-C","codegen-units=1",
  `--remap-path-prefix=${repository}=.`,
  `--remap-path-prefix=${process.env.CARGO_HOME??join(homedir(),".cargo")}=/cargo`,
].join("\u001f");
execFileSync("cargo",["+1.99.0","build","--manifest-path",join(root,"Cargo.toml"),"--lib","--release","--target","wasm32-wasip1","--locked"],{stdio:"inherit",env:environment});
const built=join(root,"target/wasm32-wasip1/release/odb_convex_decoder.wasm"),artifact=join(root,"decoder.wasm");
if(process.argv.includes("--check")){if(!readFileSync(built).equals(readFileSync(artifact)))throw Error("Probe WASM differs from the published artifact; rebuild it and regenerate component locks");console.log("Probe WASM reproducibly matches its sources");}
else copyFileSync(built,artifact);
