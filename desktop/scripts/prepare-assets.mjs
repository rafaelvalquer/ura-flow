import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const desktopDirectory = path.resolve(__dirname, "..");
const projectRoot = path.resolve(desktopDirectory, "..");

const sourceDirectory = path.join(projectRoot, "dist");
const sourceIndex = path.join(sourceDirectory, "index.html");
const targetAppDirectory = path.join(desktopDirectory, "app");
const targetDirectory = path.join(targetAppDirectory, "dist");

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function prepareAssets() {
  if (!(await exists(sourceIndex))) {
    throw new Error(
      `Build Vite não encontrado em ${sourceDirectory}. Execute "npm run build" na raiz do projeto.`,
    );
  }

  await fs.rm(targetAppDirectory, { recursive: true, force: true });
  await fs.mkdir(targetAppDirectory, { recursive: true });
  await fs.cp(sourceDirectory, targetDirectory, {
    recursive: true,
    force: true,
  });

  if (!(await exists(path.join(targetDirectory, "index.html")))) {
    throw new Error("A cópia do frontend foi concluída sem o index.html.");
  }

  console.log(`[desktop] frontend preparado em ${targetDirectory}`);
}

prepareAssets().catch((error) => {
  console.error("[desktop] falha ao preparar os assets:", error);
  process.exitCode = 1;
});
