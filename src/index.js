import Hapi from "@hapi/hapi";
import { uvPath } from "@titaniumnetwork-dev/ultraviolet";
import { epoxyPath } from "@mercuryworkshop/epoxy-transport";
import { baremuxPath } from "@mercuryworkshop/bare-mux/node";
import { join, dirname } from "node:path";
import wisp from "wisp-server-node";
import { fileURLToPath } from "node:url";
import { rewriteHTML, rewriteCSS } from "./rewriter.mjs";
import Inert from "@hapi/inert";
import fs from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const nobloatproxy_enabled = true; //change this to 'false' if you are hoster and wish to disable this feature.

//improved XOR functions, in testing 20-40% faster in encoding and decoding.
const xor = {
  encode(str) {
    if (!str) return str;
    let result = "";
    for (let i = 0; i < str.length; i++) {
      result += i % 2 ? String.fromCharCode(str.charCodeAt(i) ^ 2) : str[i];
    }
    return encodeURIComponent(result);
  },
  decode(str) {
    if (!str) return str;
    const [input, ...search] = str.split("?");
    let result = "";
    const decoded = decodeURIComponent(input);
    for (let i = 0; i < decoded.length; i++) {
      result +=
        i % 2 ? String.fromCharCode(decoded.charCodeAt(i) ^ 2) : decoded[i];
    }
    return result + (search.length ? "?" + search.join("?") : "");
  },
};

const init = async () => {
  const server = Hapi.server({
    port: process.env.PORT || 8080,
    host: "0.0.0.0",
    routes: {
      files: {
        relativeTo: __dirname,
      },
    },
  });

  await server.register(Inert);

  server.route([
    {
      method: "GET",
      path: "/{param*}",
      handler: {
        directory: {
          path: join(__dirname, "public"),
          index: ["index.html"],
        },
      },
    },
    {
      method: "GET",
      path: "/list.txt",
      handler: (request, h) => h.file(join(__dirname, "public", "list.txt")),
    },
    {
      method: "GET",
      path: "/uv/{param*}",
      handler: async (request, h) => {
        const filename = request.params.param;

        if (filename === "uv.config.js") { //UV config here
          const modifiedConfig = `
        self.__uv$config = {
          prefix: "/%F0%9F%92%80/",
          encodeUrl: function ${xor.encode.toString()},
          decodeUrl: function ${xor.decode.toString()},
          handler: "/uv/uv.handler.js",
          client: "/uv/uv.client.js",
          bundle: "/uv/uv.bundle.js",
          config: "/uv/uv.config.js",
          sw: "/uv/uv.sw.js"
        };
      `;
          return h.response(modifiedConfig).type("application/javascript");
        }

        const filepath = join(uvPath, filename);
        try {
          const content = await fs.promises.readFile(filepath);
          return h
            .response(content)
            .type("application/javascript")
            .header("Content-Length", content.length);
        } catch (error) {
          console.error(`Error serving ${filepath}:`, error);
          return h.response("File not found").code(404);
        }
      },
    },
    {
      method: "GET",
      path: "/epoxy/{param*}",
      handler: {
        directory: {
          path: epoxyPath,
        },
      },
    },
    {
      method: "GET",
      path: "/baremux/{param*}",
      handler: {
        directory: {
          path: baremuxPath,
        },
      },
    },
    {
      method: "GET",
      path: "/",
      handler: (request, h) => h.redirect("/search?query="),
    },
    {
      method: "GET",
      path: "/%F0%9F%92%80/",
      handler: (request, h) => h.response().code(204),
    },
    {
      method: "GET",
      path: "/search",
      handler: (request, h) => {
        const query = request.query.query;
        if (query === undefined) {
          return h.redirect("/search?query=");
        } else if (query === "") {
          return h.file(join(__dirname, "public", "search.html"));
        } else {
          if (query.startsWith("https://") || query.startsWith("http://")) {
            return h.redirect(`/%F0%9F%92%80/${xor.encode(query)}`);
          } else {
            return h.redirect(
              `/%F0%9F%92%80/${xor.encode(
                `https://google.com/search?q=${encodeURIComponent(query)}`
              )}`
            );
          }
        }
      },
    },
    {
      method: "GET",
      path: "/nobloatproxy",
      handler: async (request, h) => {
        if (nobloatproxy_enabled == false) {
          return h
            .response(
              "NoBloat Proxy has been disabled by the server hoster, contact them about this issue if you want it enabled."
            )
            .code(400);
        } else {
          const userquery = request.query.query;
          let domain = "";
          if (!userquery) {
            return h
              .response("Query parameter '?query=' is required")
              .code(400);
          }
          if (
            !userquery.startsWith("https://") &&
            !userquery.startsWith("http://")
          ) {
            domain =
              "https://google.com/search?q=" + encodeURIComponent(userquery);
          } else {
            domain = userquery;
          }
          const strippedDomain = domain.replace(/^(https?:\/\/[^\/]+).*/, "$1");

          try {
            const response = await fetch(domain);
            const contentType =
              response.headers.get("content-type") || "text/plain";
            const [mimeType, charset] = contentType.split(";");
            const [type, subtype] = mimeType.split("/");

            const handleBinaryContent = async () => {
              const buffer = await response.arrayBuffer();
              return h.response(Buffer.from(buffer)).type(contentType);
            };

            switch (type) {
              case "text":
                if (subtype === "html") {
                  const htmlContent = await response.text();
                  const modifiedHTML = await rewriteHTML(
                    htmlContent,
                    strippedDomain
                  );
                  return h.response(modifiedHTML).type("text/html");
                } else if (subtype === "css") {
                  const cssContent = await response.text();
                  const modifiedCSS = await rewriteCSS(
                    cssContent,
                    strippedDomain
                  );
                  return h.response(modifiedCSS).type("text/css");
                } else {
                  const content = await response.text();
                  return h.response(content).type(contentType);
                }
              case "image":
              case "video":
              case "audio":
              case "application":
                return handleBinaryContent();
              default:
                try {
                  const content = await response.text();
                  return h.response(content).type(contentType);
                } catch {
                  return handleBinaryContent();
                }
            }
          } catch (err) {
            return h
              .response(`Failed to fetch domain: ${err.message}`)
              .code(500);
          }
        }
      },
    },
  ]);

  server.ext("onPreResponse", (request, h) => {
    const response = request.response;
    if (response.isBoom) {
      return h.continue;
    }
    response.headers["Cross-Origin-Opener-Policy"] = "same-origin";
    response.headers["Cross-Origin-Embedder-Policy"] = "require-corp";
    return h.continue;
  });

  await server.start();
  console.log("Server running on %s", server.info.uri);

  server.listener.on("upgrade", (req, socket, head) => {
    if (req.url.endsWith("/wisp/")) wisp.routeRequest(req, socket, head);
    else socket.end();
  });

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  async function shutdown() {
    console.log("SIGTERM signal received: closing HTTP server");
    await server.stop({ timeout: 10000 });
    process.exit(0);
  }
};

init();
