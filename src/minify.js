import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { minify } from "html-minifier";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const inputFile = path.join(__dirname, "public", "search.html");
const backupFile = path.join(__dirname, "backup.html");
const outputFile = inputFile;

async function minifyHtml() {
  try {
    const data = await fs.readFile(inputFile, "utf8");

    await fs.writeFile(backupFile, data);
    console.log("Backup created successfully");

    const minifiedHtml = minify(data, {
      collapseWhitespace: true,
      removeComments: true,
      removeEmptyAttributes: true,
      removeRedundantAttributes: true,
      removeScriptTypeAttributes: true,
      removeStyleLinkTypeAttributes: true,
      minifyCSS: true,
      minifyJS: true,
      useShortDoctype: true,
    });

    await fs.writeFile(outputFile, minifiedHtml);
    console.log("File minified and saved successfully");
  } catch (err) {
    console.error("An error occurred:", err);
  }
}

minifyHtml();
