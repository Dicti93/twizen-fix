// Twizen service. TizenBrew runs this file inside its Node.js service (vm sandbox).
// It is a tiny loopback-only HTTP proxy: Twitch rejects playlist requests whose Origin is
// http://127.0.0.1, and usher/id.twitch.tv send no CORS headers for it, so the app routes
// those requests through here. Written in ES5 because the TV's Node runtime is old.
var http = require('http');
var https = require('https');
var urlLib = require('url');

var PORT = 8732;
var ALLOWED_HOST = /(^|\.)(ttvnw\.net|twitch\.tv|jtvnw\.net|live-video\.net|cloudfront\.net)$/i;
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers',
    'Content-Type, X-Fwd-Client-Id, X-Fwd-Authorization, X-Fwd-Device-Id');
  res.setHeader('Access-Control-Max-Age', '600');
}

function fail(res, code, msg) {
  setCors(res);
  res.writeHead(code, { 'Content-Type': 'text/plain' });
  res.end(msg);
}

function proxy(req, res, target) {
  var t = urlLib.parse(target);
  if (t.protocol !== 'https:' || !ALLOWED_HOST.test(t.hostname || '')) {
    return fail(res, 403, 'host not allowed');
  }
  var chunks = [];
  req.on('data', function (c) { chunks.push(c); });
  req.on('end', function () {
    var body = Buffer.concat(chunks);
    var headers = { 'User-Agent': UA, 'Accept': '*/*' };
    if (req.headers['content-type']) headers['Content-Type'] = req.headers['content-type'];
    if (req.headers['x-fwd-client-id']) headers['Client-Id'] = req.headers['x-fwd-client-id'];
    if (req.headers['x-fwd-authorization']) headers['Authorization'] = req.headers['x-fwd-authorization'];
    if (req.headers['x-fwd-device-id']) headers['X-Device-Id'] = req.headers['x-fwd-device-id'];
    if (body.length) headers['Content-Length'] = body.length;

    var up = https.request({
      method: req.method,
      hostname: t.hostname,
      port: t.port || 443,
      path: t.path,
      headers: headers
    }, function (upRes) {
      setCors(res);
      res.writeHead(upRes.statusCode, {
        'Content-Type': upRes.headers['content-type'] || 'application/octet-stream',
        'Cache-Control': 'no-cache'
      });
      upRes.pipe(res);
    });
    up.setTimeout(15000, function () { up.abort(); });
    up.on('error', function (e) { fail(res, 502, 'upstream error: ' + e.message); });
    if (body.length) up.write(body);
    up.end();
  });
}

var server = http.createServer(function (req, res) {
  var u = urlLib.parse(req.url, true);
  if (req.method === 'OPTIONS') {
    setCors(res);
    res.writeHead(204);
    return res.end();
  }
  if (u.pathname === '/ping') {
    setCors(res);
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end('twizen');
  }
  if (u.pathname === '/fetch' && u.query.url) {
    return proxy(req, res, String(u.query.url));
  }
  fail(res, 404, 'not found');
});

server.on('error', function (e) {
  // A previous instance is probably still running; that one keeps serving.
  console.log('[Twizen] service error: ' + e.message);
});
server.listen(PORT, '127.0.0.1', function () {
  console.log('[Twizen] proxy listening on 127.0.0.1:' + PORT);
});
