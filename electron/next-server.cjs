const http = require("node:http");
const path = require("node:path");
const next = require("next");

async function main() {
  const root = path.resolve(process.argv[2] || path.join(__dirname, ".."));
  const dev = process.env.ELECTRON_DEV_NEXT !== "0";
  const nextApp = next({
    dev,
    dir: root,
    hostname: "127.0.0.1",
  });
  const handler = nextApp.getRequestHandler();
  await nextApp.prepare();

  const server = http.createServer((req, res) => handler(req, res));
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("could not bind local Next server");
  }

  console.log(`READY http://127.0.0.1:${address.port}`);

  const shutdown = () => {
    server.close(() => process.exit(0));
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
