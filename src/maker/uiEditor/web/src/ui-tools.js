(function (root) {
  "use strict";
  function escapePart(key) { return String(key).replace(/~/g, "~0").replace(/\//g, "~1"); }
  function diff(before, after) {
    var out = [];
    function visit(a, b, path) {
      if (JSON.stringify(a) === JSON.stringify(b)) return;
      if (a && b && typeof a === "object" && typeof b === "object" && Array.isArray(a) === Array.isArray(b)) {
        Array.from(new Set(Object.keys(a).concat(Object.keys(b)))).forEach(function (key) {
          if (key.charAt(0) !== "_") visit(a[key], b[key], path + "/" + escapePart(key));
        });
      } else {
        out.push({ path: path || "/", kind: a === undefined ? "add" : b === undefined ? "remove" : "change", before: a, after: b });
      }
    }
    visit(before, after, "");
    return out;
  }
  function matchPositions(value, query) {
    var valueChars = Array.from(String(value)), needle = Array.from(String(query).toLowerCase().replace(/\s/g, ""));
    var positions = [], from = 0;
    for (var i = 0; i < needle.length; i++) {
      while (from < valueChars.length && valueChars[from].toLowerCase() !== needle[i]) from++;
      if (from === valueChars.length) return null;
      positions.push(from++);
    }
    return positions;
  }
  function highlight(element, value, query) {
    var chars = Array.from(String(value)), positions = new Set(matchPositions(value, query) || []);
    element.replaceChildren();
    var run = "", marked = false;
    function flush() {
      if (!run) return;
      var part = document.createElement(marked ? "mark" : "span");
      part.textContent = run; element.appendChild(part); run = "";
    }
    chars.forEach(function (char, i) {
      if (positions.has(i) !== marked) { flush(); marked = positions.has(i); }
      run += char;
    });
    flush();
  }
  root.UrhoxUiTools = { diff: diff, matchPositions: matchPositions, highlight: highlight };
})(window);
