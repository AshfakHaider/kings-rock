const fs = require("fs");
const path = require("path");

const root = process.cwd();
const standaloneDir = path.join(root, ".next", "standalone");

if (!fs.existsSync(standaloneDir)) {
  process.exit(0);
}

const copies = [
  [path.join(root, "public"), path.join(standaloneDir, "public")],
  [path.join(root, ".next", "static"), path.join(standaloneDir, ".next", "static")]
];

for (const [source, destination] of copies) {
  if (!fs.existsSync(source)) continue;
  fs.rmSync(destination, { recursive: true, force: true });
  fs.cpSync(source, destination, { recursive: true });
}
