//credit to Osana proxy by NebulaServices for the CSS regex.

import { parseDocument } from "htmlparser2";
import { removeElement } from "domutils";
import render from "dom-serializer";

const supportedAttributes = new Set([
  "href",
  "src",
  "usemap",
  "archive",
  "icon",
  "manifest",
  "formaction",
]);

export function rewriteHTML(htmlContent, initialDomain) {
  const dom = parseDocument(htmlContent);

  function modifyLinks(node) {
    if (node.tagName === "script" || node.tagName === "noscript") {
      removeElement(node);
      return;
    }

    if (node.attribs) {
      for (const key in node.attribs) {
        const value = node.attribs[key];
        if (supportedAttributes.has(key)) {
          if (isRelativeURL(value)) {
            node.attribs[key] = value.startsWith("/")
              ? `?query=${initialDomain}${value}`
              : `?query=${initialDomain}/${value}`;
          } else if (isAbsoluteURL(value)) {
            node.attribs[key] = `?query=${value}`;
          }
        }
      }
    }

    if (node.children) {
      node.children.forEach(modifyLinks);
    }
  }

  dom.children.forEach(modifyLinks);

  return render(dom);
}

export function rewriteCSS(cssContent, initialDomain) {
  return cssContent.replace(
    /(?<=url\("?'?)[^"'][\S]*[^"'](?="?'?\);?)/g,
    (url) => rewriteCSSURL(url, initialDomain)
  );
}

function rewriteCSSURL(url, initialDomain) {
  if (isRelativeURL(url)) {
    return url.startsWith("/")
      ? `?query=${initialDomain}${url}`
      : `?query=${initialDomain}/${url}`;
  } else if (isAbsoluteURL(url)) {
    return `?query=${url}`;
  }
  return url;
}

function isRelativeURL(url) {
  return url.startsWith("/") || url.startsWith("./") || url.startsWith("//");
}

function isAbsoluteURL(url) {
  return url.startsWith("http://") || url.startsWith("https://");
}
