const { app, BrowserWindow, dialog, shell } = require("electron");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const APP_ID = "br.com.rafaelvalquer.uraflow";
const HOST = "127.0.0.1";

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".wasm": "application/wasm",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".xml": "application/xml; charset=utf-8",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

let mainWindow = null;
let staticServer = null;
let applicationOrigin = "";

app.setAppUserModelId(APP_ID);

function getFrontendDirectory() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "app", "dist");
  }

  return path.join(__dirname, "app", "dist");
}

function isPathInsideRoot(rootDirectory, candidatePath) {
  const root = path.resolve(rootDirectory);
  const candidate = path.resolve(candidatePath);
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

function resolveRequestFile(rootDirectory, requestUrl) {
  let pathname;

  try {
    pathname = decodeURIComponent(new URL(requestUrl || "/", `http://${HOST}`).pathname);
  } catch {
    return null;
  }

  const relativePath = pathname.replace(/^\/+/, "") || "index.html";
  const candidatePath = path.resolve(rootDirectory, relativePath);

  if (!isPathInsideRoot(rootDirectory, candidatePath)) {
    return null;
  }

  if (fs.existsSync(candidatePath)) {
    const stats = fs.statSync(candidatePath);

    if (stats.isFile()) {
      return candidatePath;
    }

    if (stats.isDirectory()) {
      const directoryIndex = path.join(candidatePath, "index.html");
      if (fs.existsSync(directoryIndex)) return directoryIndex;
    }
  }

  // Rotas futuras de SPA devem retornar o index.html. Arquivos com extensão
  // inexistentes continuam retornando 404 para não mascarar assets quebrados.
  if (!path.extname(relativePath)) {
    return path.join(rootDirectory, "index.html");
  }

  return null;
}

function sendText(response, statusCode, text) {
  response.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Type": "text/plain; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(text);
}

function startStaticServer() {
  const rootDirectory = getFrontendDirectory();
  const indexPath = path.join(rootDirectory, "index.html");

  if (!fs.existsSync(indexPath)) {
    throw new Error(
      `Build do frontend não encontrado em ${rootDirectory}. Execute npm run build antes de iniciar o desktop.`,
    );
  }

  return new Promise((resolve, reject) => {
    const server = http.createServer((request, response) => {
      if (!request.url || !["GET", "HEAD"].includes(request.method || "GET")) {
        sendText(response, 405, "Método não permitido.");
        return;
      }

      const filePath = resolveRequestFile(rootDirectory, request.url);
      if (!filePath || !fs.existsSync(filePath)) {
        sendText(response, 404, "Arquivo não encontrado.");
        return;
      }

      try {
        const stats = fs.statSync(filePath);
        const extension = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[extension] || "application/octet-stream";

        response.writeHead(200, {
          "Cache-Control": app.isPackaged
            ? "public, max-age=31536000, immutable"
            : "no-store",
          "Content-Length": stats.size,
          "Content-Type": contentType,
          "X-Content-Type-Options": "nosniff",
        });

        if (request.method === "HEAD") {
          response.end();
          return;
        }

        const stream = fs.createReadStream(filePath);
        stream.on("error", (error) => {
          console.error("[desktop] erro ao ler arquivo:", error);
          if (!response.headersSent) sendText(response, 500, "Erro interno.");
          else response.destroy(error);
        });
        stream.pipe(response);
      } catch (error) {
        console.error("[desktop] erro ao responder requisição:", error);
        if (!response.headersSent) sendText(response, 500, "Erro interno.");
        else response.destroy(error);
      }
    });

    server.once("error", reject);
    server.listen(0, HOST, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Não foi possível determinar a porta da aplicação."));
        return;
      }

      staticServer = server;
      applicationOrigin = `http://${HOST}:${address.port}`;
      resolve(applicationOrigin);
    });
  });
}

function isApplicationUrl(targetUrl) {
  try {
    return new URL(targetUrl).origin === applicationOrigin;
  } catch {
    return false;
  }
}

async function openExternalUrl(targetUrl) {
  try {
    await shell.openExternal(targetUrl);
  } catch (error) {
    console.error("[desktop] não foi possível abrir URL externa:", error);
  }
}

async function createMainWindow() {
  const origin = staticServer ? applicationOrigin : await startStaticServer();

  const window = new BrowserWindow({
    width: 1500,
    height: 950,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#0f172a",
    title: "URA Flow",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  mainWindow = window;

  window.once("ready-to-show", () => {
    if (!window.isDestroyed()) window.show();
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isApplicationUrl(url)) return { action: "allow" };
    void openExternalUrl(url);
    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    if (isApplicationUrl(url)) return;
    event.preventDefault();
    void openExternalUrl(url);
  });

  window.webContents.on("render-process-gone", (_event, details) => {
    console.error("[desktop] processo de renderização encerrado:", details);
  });

  window.on("closed", () => {
    if (mainWindow === window) mainWindow = null;
  });

  await window.loadURL(origin);
}

function stopStaticServer() {
  return new Promise((resolve) => {
    if (!staticServer) {
      resolve();
      return;
    }

    const server = staticServer;
    staticServer = null;
    applicationOrigin = "";
    server.close(() => resolve());
  });
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app
    .whenReady()
    .then(createMainWindow)
    .catch(async (error) => {
      console.error("[desktop] erro ao iniciar a aplicação:", error);
      await dialog.showMessageBox({
        type: "error",
        title: "URA Flow",
        message: "Não foi possível iniciar o URA Flow.",
        detail: error?.stack || error?.message || String(error),
      });
      app.quit();
    });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow().catch((error) => {
        console.error("[desktop] erro ao recriar janela:", error);
      });
    }
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  app.on("before-quit", () => {
    void stopStaticServer();
  });
}
