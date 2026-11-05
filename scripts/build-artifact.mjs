// Gera dist/provador.html: um arquivo único (CSS e JS embutidos) para publicar como Artifact no claude.ai.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(root, "index.html"), "utf8");
const between = (a, b) => html.slice(html.indexOf(a) + a.length, html.indexOf(b));
let head = between("<!-- @@ARTIFACT_HEAD_START -->", "<!-- @@ARTIFACT_HEAD_END -->");
let body = between("<!-- @@ARTIFACT_BODY_START -->", "<!-- @@ARTIFACT_BODY_END -->");

head = head.replace(/<link rel="stylesheet" href="(src\/[^"]+)">/g, (_, p) => `<style>\n${readFileSync(join(root, p), "utf8")}\n</style>`);
body = body.replace(/<script src="(src\/[^"]+)"><\/script>/g, (_, p) => `<script>\n${readFileSync(join(root, p), "utf8").replace(/<\/script/gi, "<\\/script")}\n</script>`);

mkdirSync(join(root, "dist"), { recursive: true });
writeFileSync(join(root, "dist", "provador.html"), head.trim() + "\n" + body.trim() + "\n");
console.log("dist/provador.html gerado");
