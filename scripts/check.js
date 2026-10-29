// Checks that the app still runs on Tizen 3.0 (Chromium 47) before a release:
// - JavaScript parses as ES5 (no let/const, arrow functions, template strings, ...)
// - no browser APIs that Chromium 47 doesn't have
// - no CSS that Chromium 47 doesn't understand (variables, grid, flex gap)
// Usage: node scripts/check.js   (needs the "acorn" package: npm install --no-save acorn)
'use strict';

var fs = require('fs');
var path = require('path');
var acorn = require('acorn');

var root = path.join(__dirname, '..');
var problems = [];

function lineOf(text, index) { return text.slice(0, index).split('\n').length; }

function checkJs(file, code, lineOffset) {
  try {
    acorn.parse(code, { ecmaVersion: 5, sourceType: 'script' });
  } catch (e) {
    problems.push(file + ':' + ((e.loc ? e.loc.line : 0) + lineOffset) + ': not ES5: ' + e.message);
  }
  // Newer than Chromium 47 (comments and strings may mention them, so only code patterns).
  var banned = [
    [/querySelectorAll\([^)]*\)\.forEach\(/, 'NodeList.forEach (Chrome 51)'],
    [/\bObject\.(values|entries)\(/, 'Object.values/entries (Chrome 54)'],
    [/\.(padStart|padEnd)\(/, 'padStart/padEnd (Chrome 57)'],
    [/\.(flat|flatMap)\(/, 'Array.flat/flatMap (Chrome 69)'],
    [/\bnew URLSearchParams\b/, 'URLSearchParams (Chrome 49)'],
    [/\bnew AbortController\b/, 'AbortController (Chrome 66)'],
    [/\bnew IntersectionObserver\b/, 'IntersectionObserver (Chrome 51)'],
    [/\.(append|prepend|before|after|replaceWith)\(/, 'ChildNode/ParentNode methods (Chrome 54)'],
    [/\.scrollTo\(\{|\bbehavior:\s*'smooth'/, 'smooth scrolling options (Chrome 61)']
  ];
  code.split('\n').forEach(function (line, i) {
    var code = line.replace(/\/\/.*$/, '');
    banned.forEach(function (b) {
      if (b[0].test(code)) problems.push(file + ':' + (i + 1 + lineOffset) + ': ' + b[1]);
    });
  });
}

function checkCss(file, css) {
  var banned = [
    [/var\(--/, 'CSS variables (Chrome 49)'],
    [/display:\s*grid|grid-template/, 'CSS grid (Chrome 57)'],
    [/(^|[;{\s])(row-|column-)?gap:/, 'flexbox gap (Chrome 84)'],
    [/:is\(|:where\(|:has\(/, 'modern selectors'],
    [/\binset:/, 'inset (Chrome 87)'],
    [/aspect-ratio:/, 'aspect-ratio (Chrome 88)'],
    [/position:\s*sticky/, 'position: sticky (Chrome 56)']
  ];
  css.split('\n').forEach(function (line, i) {
    banned.forEach(function (b) {
      if (b[0].test(line)) problems.push(file + ':' + (i + 1) + ': ' + b[1]);
    });
  });
}

checkJs('app/twizen.js', fs.readFileSync(path.join(root, 'app/twizen.js'), 'utf8'), 0);

var html = fs.readFileSync(path.join(root, 'app/index.html'), 'utf8');
var re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g, m;
while ((m = re.exec(html))) {
  checkJs('app/index.html', m[1], lineOf(html, m.index) - 1);
}
var styles = /<style[^>]*>([\s\S]*?)<\/style>/g;
while ((m = styles.exec(html))) checkCss('app/index.html', m[1]);

checkCss('app/css/style.css', fs.readFileSync(path.join(root, 'app/css/style.css'), 'utf8'));

if (problems.length) {
  console.error(problems.join('\n'));
  console.error('\n' + problems.length + ' problem(s): this would break Twizen on Tizen 3.0.');
  process.exit(1);
}
console.log('OK: ES5 and Chromium 47 compatible');
