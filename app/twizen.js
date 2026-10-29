/* Twizen 0.5.4 (fork of Twizen 0.3.3; app/js sources are not published, edit this file). */
/* ---- core.js ---- */
;// Shared helpers. All app code is ES5 (no build step) so it runs on older Tizen browsers.
var TT = window.TT = window.TT || {};

TT.VERSION = '0.7.2';
TT.PROXY = 'http://127.0.0.1:8732';
TT.WEB_CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko';
TT.TV_CLIENT_ID = 'ue6666qo983tsx6so1t0vnawi233wa';

TT.log = function () {
  var args = Array.prototype.slice.call(arguments);
  args.unshift('[Twizen]');
  console.log.apply(console, args);
};

TT.store = {
  get: function (key, def) {
    try {
      var v = localStorage.getItem('tt.' + key);
      return v === null ? def : JSON.parse(v);
    } catch (e) { return def; }
  },
  set: function (key, value) {
    try {
      if (value === null || value === undefined) localStorage.removeItem('tt.' + key);
      else localStorage.setItem('tt.' + key, JSON.stringify(value));
    } catch (e) { /* storage unavailable */ }
  }
};

TT.deviceId = (function () {
  var id = TT.store.get('deviceId', null);
  if (!id) {
    id = '';
    for (var i = 0; i < 32; i++) id += Math.floor(Math.random() * 16).toString(16);
    TT.store.set('deviceId', id);
  }
  return id;
})();

// Promise-based XHR. opts: { headers, body, timeout, proxy }.
// proxy:true routes through the service; X-Fwd-* headers become real headers there.
TT.http = function (method, url, opts) {
  opts = opts || {};
  return new Promise(function (resolve, reject) {
    var xhr = new XMLHttpRequest();
    var target = opts.proxy ? TT.PROXY + '/fetch?url=' + encodeURIComponent(url) : url;
    xhr.open(method, target, true);
    xhr.timeout = opts.timeout || 12000;
    var headers = opts.headers || {};
    for (var k in headers) {
      if (headers.hasOwnProperty(k)) xhr.setRequestHeader(opts.proxy ? 'X-Fwd-' + k : k, headers[k]);
    }
    if (opts.contentType) xhr.setRequestHeader('Content-Type', opts.contentType);
    xhr.onload = function () {
      var res = { status: xhr.status, text: xhr.responseText };
      res.json = function () { return JSON.parse(xhr.responseText); };
      if (xhr.status >= 200 && xhr.status < 300) resolve(res);
      else {
        var err = new Error('HTTP ' + xhr.status);
        err.status = xhr.status;
        err.response = res;
        reject(err);
      }
    };
    xhr.onerror = function () { reject(new Error('Network error')); };
    xhr.ontimeout = function () { reject(new Error('Timeout')); };
    xhr.send(opts.body || null);
  });
};

TT.el = function (tag, cls, text) {
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined && text !== null) e.textContent = text;
  return e;
};

TT.clear = function (node) {
  while (node.firstChild) node.removeChild(node.firstChild);
};

// German short counts like Twitch: 18,4 Tsd. / 1,2 Mio.
TT.fmtCount = function (n) {
  n = n || 0;
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '').replace('.', ',') + ' Mio.';
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '').replace('.', ',') + ' Tsd.';
  return String(n);
};

TT.fmtViewers = function (n) { return TT.fmtCount(n) + ' Zuschauer'; };

// "3:12 Std." / "45 Min." since an ISO timestamp.
TT.fmtUptime = function (iso) {
  var t = iso ? Date.parse(iso) : NaN;
  if (isNaN(t)) return '';
  var m = Math.max(0, Math.floor((Date.now() - t) / 60000)), h = Math.floor(m / 60);
  return h ? h + ':' + (m % 60 < 10 ? '0' : '') + (m % 60) + ' Std.' : m + ' Min.';
};

// "gestern", "vor 3 Tagen", ... for a past ISO timestamp.
TT.fmtAgo = function (iso) {
  var t = iso ? Date.parse(iso) : NaN;
  if (isNaN(t)) return '';
  var d = Math.floor((Date.now() - t) / 86400000);
  if (d <= 0) return 'heute';
  if (d === 1) return 'gestern';
  if (d < 7) return 'vor ' + d + ' Tagen';
  if (d < 14) return 'vor 1 Woche';
  if (d < 60) return 'vor ' + Math.floor(d / 7) + ' Wochen';
  return new Date(t).toLocaleDateString('de-DE');
};

TT.toast = (function () {
  var timer = null;
  return function (msg, ms) {
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'toast show';
    clearTimeout(timer);
    timer = setTimeout(function () { t.className = 'toast'; }, ms || 3000);
  };
})();

// hls.js (415 KB) is loaded after the UI is up, not before, so startup isn't blocked on it.
// QR codes (login, chat on the phone): vendor/qrcode.js (MIT, Kazuhiko Arase), loaded on
// first use. Resolves with an <img> of the code.
TT.qrImage = (function () {
  var pending = null;
  function lib() {
    if (window.qrcode) return Promise.resolve(window.qrcode);
    if (pending) return pending;
    pending = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = 'vendor/qrcode.js';
      s.onload = function () { if (window.qrcode) resolve(window.qrcode); else reject(new Error('qrcode.js did not start')); };
      s.onerror = function () { pending = null; reject(new Error('Could not load qrcode.js')); };
      document.head.appendChild(s);
    });
    return pending;
  }
  return function (text, cls) {
    return lib().then(function (qrcode) {
      var q = qrcode(0, 'M');
      q.addData(text);
      q.make();
      var img = TT.el('img', 'qr' + (cls ? ' ' + cls : ''));
      img.src = q.createDataURL(8, 2);
      return img;
    });
  };
})();

TT.loadHls = (function () {
  var pending = null;
  return function () {
    if (window.Hls) return Promise.resolve(window.Hls);
    if (pending) return pending;
    pending = new Promise(function (resolve, reject) {
      var t0 = Date.now();
      var s = document.createElement('script');
      s.src = 'vendor/hls.min.js';
      s.onload = function () {
        TT.hlsLoadMs = Date.now() - t0;
        if (window.Hls) resolve(window.Hls);
        else reject(new Error('Video library loaded but did not start'));
      };
      s.onerror = function () { pending = null; reject(new Error('Could not load the video library (hls.js)')); };
      document.head.appendChild(s);
    });
    return pending;
  };
})();

// Recently watched channels (newest first), for the "Zuletzt gesehen" row.
TT.recent = {
  list: function () { return TT.store.get('recent', []) || []; },
  add: function (c) {
    if (!c || !c.login) return;
    var list = TT.recent.list().filter(function (x) { return x.login !== c.login; });
    list.unshift({ login: c.login, displayName: c.displayName || c.login, profileImageURL: c.profileImageURL || '' });
    TT.store.set('recent', list.slice(0, 20));
  }
};

// Favourite channels (logins, newest first): pinned in the sidebar, "live now" notices.
TT.favorites = {
  list: function () { return TT.store.get('favorites', []) || []; },
  has: function (login) { return TT.favorites.list().indexOf(login) >= 0; },
  toggle: function (login) {
    var list = TT.favorites.list().filter(function (l) { return l !== login; });
    var on = !TT.favorites.has(login);
    if (on) list.unshift(login);
    TT.store.set('favorites', list);
    return on;
  }
};

// Videos that were started, newest first: { vod, owner } for the "Weiterschauen" row.
TT.watched = {
  list: function () { return TT.store.get('watched', []) || []; },
  add: function (vod, owner) {
    var keep = { id: vod.id, title: vod.title, lengthSeconds: vod.lengthSeconds, publishedAt: vod.publishedAt,
      previewThumbnailURL: vod.previewThumbnailURL, game: vod.game || null };
    var list = TT.watched.list().filter(function (w) { return w.vod.id !== vod.id; });
    list.unshift({ vod: keep, owner: { login: owner.login, displayName: owner.displayName, profileImageURL: owner.profileImageURL } });
    TT.store.set('watched', list.slice(0, 30));
  }
};

// Saved VOD positions in seconds: { vodId: seconds }.
TT.vodPos = function (id) { return (TT.store.get('vodPos', {}) || {})[id] || 0; };

TT.checkService = function () {
  return TT.http('GET', TT.PROXY + '/ping', { timeout: 3000 })
    .then(function () { return true; }, function () { return false; });
};

/* ---- api.js ---- */
;// Twitch GQL queries, playback tokens and device-code login.
(function () {
  var GQL_URL = 'https://gql.twitch.tv/gql';
  var ID_URL = 'https://id.twitch.tv/oauth2';
  var SCOPES = 'user_read user:read:follows chat:read';

  var STREAM_FIELDS =
    'id title viewersCount createdAt contentClassificationLabels{ id } previewImageURL(width:356,height:200) ' +
    'broadcaster{ login displayName profileImageURL(width:70) } game{ name displayName }';

  // ---- auth -------------------------------------------------------------
  var auth = {
    current: function () { return TT.store.get('auth', null); },
    save: function (a) { TT.store.set('auth', a); },
    logout: function () { TT.store.set('auth', null); },

    startDeviceFlow: function () {
      return TT.http('POST', ID_URL + '/device', {
        proxy: true,
        contentType: 'application/x-www-form-urlencoded',
        body: 'client_id=' + TT.TV_CLIENT_ID + '&scopes=' + encodeURIComponent(SCOPES)
      }).then(function (r) { return r.json(); });
    },

    // Resolves with the auth record, or null while the user hasn't entered the code yet.
    pollDeviceFlow: function (deviceCode) {
      return TT.http('POST', ID_URL + '/token', {
        proxy: true,
        contentType: 'application/x-www-form-urlencoded',
        body: 'client_id=' + TT.TV_CLIENT_ID +
          '&scopes=' + encodeURIComponent(SCOPES) +
          '&device_code=' + encodeURIComponent(deviceCode) +
          '&grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:device_code')
      }).then(function (r) {
        var j = r.json();
        var a = { token: j.access_token, refresh: j.refresh_token, clientId: TT.TV_CLIENT_ID };
        auth.save(a);
        return gql('query{ currentUser{ login displayName } }').then(function (d) {
          a.login = d.currentUser.login;
          a.displayName = d.currentUser.displayName;
          auth.save(a);
          return a;
        });
      }, function (err) {
        var msg = '';
        try { msg = err.response.json().message || ''; } catch (e) { /* ignore */ }
        if (err.status === 400 && /pending/i.test(msg)) return null;
        throw new Error(msg || err.message);
      });
    },

    refresh: function () {
      var a = auth.current();
      if (!a || !a.refresh) return Promise.reject(new Error('No refresh token'));
      return TT.http('POST', ID_URL + '/token', {
        proxy: true,
        contentType: 'application/x-www-form-urlencoded',
        body: 'client_id=' + a.clientId + '&grant_type=refresh_token&refresh_token=' +
          encodeURIComponent(a.refresh)
      }).then(function (r) {
        var j = r.json();
        a.token = j.access_token;
        if (j.refresh_token) a.refresh = j.refresh_token;
        auth.save(a);
        return a;
      });
    }
  };

  // ---- gql --------------------------------------------------------------
  // opts.anonymous: never send the user's token (used for backup playback tokens).
  function gql(query, variables, opts, retried) {
    opts = opts || {};
    var a = opts.anonymous ? null : auth.current();
    var headers = { 'Client-Id': a ? a.clientId : TT.WEB_CLIENT_ID };
    if (a) headers.Authorization = 'OAuth ' + a.token;
    return TT.http('POST', GQL_URL, {
      headers: headers,
      contentType: 'text/plain;charset=UTF-8',
      body: JSON.stringify({ query: query, variables: variables || {} })
    }).then(function (r) {
      var j = r.json();
      if (j.errors && j.errors.length) {
        var allNull = true;
        for (var k in (j.data || {})) if (j.data[k] !== null) allNull = false;
        if (allNull) throw new Error(j.errors[0].message);
      }
      return j.data;
    }, function (err) {
      if (err.status === 401 && a && !retried) {
        return auth.refresh().then(function () {
          return gql(query, variables, opts, true);
        }, function () {
          auth.logout();
          TT.toast('Twitch session expired, please sign in again');
          return gql(query, variables, opts, true);
        });
      }
      throw err;
    });
  }

  function edgesToNodes(conn) {
    var out = [];
    var edges = (conn && conn.edges) || [];
    for (var i = 0; i < edges.length; i++) if (edges[i] && edges[i].node) out.push(edges[i].node);
    return out;
  }

  // ---- helix (official API; token is from the TV client, so use its Client-Id) ----
  function helix(path, retried) {
    var a = auth.current();
    if (!a) return Promise.reject(new Error('Not signed in'));
    return TT.http('GET', 'https://api.twitch.tv/helix/' + path, {
      headers: { 'Client-Id': a.clientId, 'Authorization': 'Bearer ' + a.token }
    }).then(function (r) { return r.json(); }, function (err) {
      if (err.status === 401 && !retried) {
        return auth.refresh().then(function () { return helix(path, true); });
      }
      var msg = '';
      try { msg = err.response.json().message || ''; } catch (e) { /* ignore */ }
      throw new Error('Helix ' + (err.status || '') + (msg ? ' ' + msg : ''));
    });
  }

  function myUserId() {
    var a = auth.current();
    return a && a.userId ? Promise.resolve(a.userId) : helix('users').then(function (d) {
      var id = d.data[0].id;
      var cur = auth.current();
      if (cur) { cur.userId = id; auth.save(cur); }
      return id;
    });
  }

  // Profile pictures for up to 100 user ids: { id: url }.
  function helixPictures(ids) {
    if (!ids.length) return Promise.resolve({});
    return helix('users?' + ids.slice(0, 100).map(function (id) { return 'id=' + id; }).join('&')).then(function (u) {
      var pics = {};
      (u.data || []).forEach(function (x) { pics[x.id] = x.profile_image_url; });
      return pics;
    }, function () { return {}; });
  }

  // All followed channels (live or not), most recently followed first.
  function helixFollowedChannels() {
    return myUserId().then(function (id) {
      return helix('channels/followed?first=100&user_id=' + id);
    }).then(function (d) {
      var list = d.data || [];
      return helixPictures(list.map(function (c) { return c.broadcaster_id; })).then(function (pics) {
        return list.map(function (c) {
          return { login: c.broadcaster_login, displayName: c.broadcaster_name, profileImageURL: pics[c.broadcaster_id] || '' };
        });
      });
    });
  }

  // Helix stream objects -> the app's stream shape (with profile pictures).
  function helixStreams(streams) {
    if (!streams.length) return Promise.resolve([]);
    return helixPictures(streams.map(function (s) { return s.user_id; })).then(function (pics) {
      return streams.map(function (s) {
        return {
          id: s.id,
          title: s.title,
          viewersCount: s.viewer_count,
          createdAt: s.started_at,
          isMature: !!s.is_mature,
          previewImageURL: (s.thumbnail_url || '').replace('{width}', '356').replace('{height}', '200'),
          game: s.game_name ? { name: s.game_name, displayName: s.game_name } : null,
          broadcaster: { login: s.user_login, displayName: s.user_name, profileImageURL: pics[s.user_id] || '' }
        };
      });
    });
  }

  function helixFollowedLive() {
    return myUserId().then(function (id) {
      return helix('streams/followed?first=100&user_id=' + id);
    }).then(function (d) { return helixStreams(d.data || []); });
  }

  function gqlFollowedLive() {
    return gql('query{ currentUser{ followedLiveUsers(first:30){ edges{ node{ login displayName ' +
      'profileImageURL(width:70) stream{ id title viewersCount createdAt ' +
      'previewImageURL(width:356,height:200) game{ name displayName } } } } } } }')
      .then(function (d) {
        if (!d.currentUser) throw new Error('GQL: not signed in');
        if (!d.currentUser.followedLiveUsers) throw new Error('GQL: followed list unavailable');
        return edgesToNodes(d.currentUser.followedLiveUsers).filter(function (u) {
          return !!u.stream;
        }).map(function (u) {
          var s = u.stream;
          s.broadcaster = { login: u.login, displayName: u.displayName, profileImageURL: u.profileImageURL };
          return s;
        });
      });
  }

  var api = {
    auth: auth,
    gql: gql,

    // Live streams in Twitch's own "recommended" order (or `sort`). lang: 'de', 'en' or 'all';
    // default is the Settings language ('de').
    topStreams: function (lang, sort) {
      lang = lang || TT.store.get('lang', 'de');
      var opt = 'sort:' + (sort || 'RELEVANCE') + (lang === 'all' ? '' : ', languages:[' + lang.toUpperCase() + ']');
      return gql('query{ streams(first:30, options:{' + opt + '}){ edges{ node{ ' + STREAM_FIELDS + ' } } } }')
        .then(function (d) { return edgesToNodes(d.streams); });
    },

    // Live channels for the "Live-Kanäle" page. f: { lang, sort, game }. Returns a pager whose
    // next() resolves { items, done }. A category gives up to 100; otherwise GQL pages of 30
    // (only signed in; anonymous GQL refuses page 2). GQL, not Helix, because only GQL has the
    // content classification labels the 18+ filter needs.
    livePager: function (f) {
      var cursor = null, done = false, first = true;
      var langs = f.lang === 'all' ? null : f.lang;
      function finish(items, next) {
        cursor = next || null;
        done = !cursor;
        first = false;
        return { items: items, done: done };
      }
      return {
        next: function () {
          if (done) return Promise.resolve({ items: [], done: true });
          if (f.game) {
            done = true;
            return gql('query($n:String!){ game(name:$n){ streams(first:100, options:{sort:' + f.sort +
              (langs ? ', languages:["' + langs.toUpperCase() + '"]' : '') + '}){ edges{ node{ ' + STREAM_FIELDS + ' } } } } }',
              { n: f.game.name }).then(function (d) { return { items: d.game ? edgesToNodes(d.game.streams) : [], done: true }; });
          }
          var opt = 'sort:' + f.sort + (langs ? ', languages:[' + langs.toUpperCase() + ']' : '');
          return gql('query{ streams(first:30' + (cursor ? ', after:' + JSON.stringify(cursor) : '') + ', options:{' + opt + '}){ ' +
            'edges{ cursor node{ ' + STREAM_FIELDS + ' } } } }').then(function (d) {
            var edges = (d.streams && d.streams.edges) || [];
            var last = edges.length ? edges[edges.length - 1].cursor : null;
            // Without a login Twitch refuses further pages, so don't promise any.
            return finish(edgesToNodes(d.streams), edges.length >= 20 && auth.current() ? last : null);
          }, function (e) {
            if (first) throw e;
            return finish([], null); // Twitch refuses further pages (e.g. without login)
          });
        }
      };
    },

    // Live status of several channels at once: [{ login, displayName, profileImageURL, stream }].
    usersByLogin: function (logins) {
      if (!logins.length) return Promise.resolve([]);
      return gql('query($l:[String!]){ users(logins:$l){ login displayName profileImageURL(width:150) ' +
        'stream{ ' + STREAM_FIELDS.replace(/broadcaster\{[^}]*\} /, '') + ' } } }', { l: logins })
        .then(function (d) {
          return (d.users || []).filter(Boolean).map(function (u) {
            if (u.stream) u.stream.broadcaster = { login: u.login, displayName: u.displayName, profileImageURL: u.profileImageURL };
            return u;
          });
        });
    },

    // Upcoming schedule segments: [{ startAt, endAt, title, categories }].
    schedule: function (login) {
      return gql('query($login:String!){ user(login:$login){ channel{ schedule{ segmentList(first:7){ edges{ node{ ' +
        'startAt endAt title categories{ name displayName } } } } } } } }', { login: login })
        .then(function (d) {
          var sch = d.user && d.user.channel && d.user.channel.schedule;
          return sch ? edgesToNodes(sch.segmentList) : [];
        });
    },

    // Chapters and seek-preview storyboard of a VOD: { chapters: [{ start, end, name }], seek }.
    vodInfo: function (id) {
      return gql('query($id:ID!){ video(id:$id){ seekPreviewsURL moments(first:50, momentRequestType:VIDEO_CHAPTER_MARKERS){ ' +
        'edges{ node{ positionMilliseconds durationMilliseconds description } } } } }', { id: id })
        .then(function (d) {
          var v = d.video || {};
          var chapters = edgesToNodes(v.moments).map(function (m) {
            return { start: m.positionMilliseconds / 1000, end: (m.positionMilliseconds + (m.durationMilliseconds || 0)) / 1000,
              name: m.description || '' };
          });
          return { chapters: chapters, seek: v.seekPreviewsURL || null };
        });
    },

    // Chat messages of a VOD from `offset` seconds on (about a minute's worth).
    vodComments: function (id, offset) {
      return gql('query($id:ID!,$o:Int){ video(id:$id){ comments(contentOffsetSeconds:$o){ edges{ node{ id contentOffsetSeconds ' +
        'commenter{ displayName login } message{ userColor userBadges{ setID } fragments{ text emote{ emoteID } } } } } } } }',
        { id: id, o: Math.max(0, Math.floor(offset)) })
        .then(function (d) { return d.video ? edgesToNodes(d.video.comments) : []; });
    },

    // The channel's latest past broadcast (while live: the recording in progress).
    latestVod: function (login) {
      return gql('query($l:String!){ user(login:$l){ login displayName profileImageURL(width:70) ' +
        'videos(first:1, type:ARCHIVE, sort:TIME){ edges{ node{ id title lengthSeconds viewCount publishedAt status previewThumbnailURL(width:356,height:200) game{ name displayName } } } } } }', { l: login })
        .then(function (d) {
          var u = d.user;
          var v = u && edgesToNodes(u.videos)[0];
          return v ? { vod: v, owner: { login: u.login, displayName: u.displayName, profileImageURL: u.profileImageURL } } : null;
        });
    },

    // Most-viewed clips of a channel or a category (period: LAST_DAY, LAST_WEEK, ...).
    channelClips: function (login, period) {
      return gql('query($l:String!){ user(login:$l){ clips(first:20, criteria:{period:' + (period || 'LAST_WEEK') +
        ', sort:VIEWS_DESC}){ edges{ node{ slug title viewCount durationSeconds createdAt thumbnailURL(width:356,height:200) broadcaster{ login displayName profileImageURL(width:70) } game{ name displayName } } } } } }', { l: login })
        .then(function (d) { return d.user ? edgesToNodes(d.user.clips) : []; });
    },
    gameClips: function (name) {
      var lang = TT.store.get('lang', 'de');
      return gql('query($n:String!){ game(name:$n){ clips(first:20, criteria:{period:LAST_WEEK, sort:VIEWS_DESC' +
        (lang === 'all' ? '' : ', languages:[' + lang.toUpperCase() + ']') + '}){ edges{ node{ slug title viewCount durationSeconds createdAt thumbnailURL(width:356,height:200) broadcaster{ login displayName profileImageURL(width:70) } game{ name displayName } } } } } }', { n: name })
        .then(function (d) { return d.game ? edgesToNodes(d.game.clips) : []; });
    },
    // Top clips of the last 24 h for several channels at once (one request).
    clipsOfChannels: function (logins) {
      if (!logins.length) return Promise.resolve([]);
      return gql('query($l:[String!]){ users(logins:$l){ clips(first:3, criteria:{period:LAST_DAY, sort:VIEWS_DESC}){ ' +
        'edges{ node{ slug title viewCount durationSeconds createdAt thumbnailURL(width:356,height:200) broadcaster{ login displayName profileImageURL(width:70) } game{ name displayName } } } } } }', { l: logins.slice(0, 50) })
        .then(function (d) {
          var out = [];
          (d.users || []).forEach(function (u) { if (u) out = out.concat(edgesToNodes(u.clips)); });
          return out.sort(function (a, b) { return b.viewCount - a.viewCount; });
        });
    },
    // Playable MP4 of a clip: { url } (signed with the clip's access token).
    clipSource: function (slug) {
      return gql('query($s:ID!){ clip(slug:$s){ playbackAccessToken(params:{platform:"web", playerBackend:"mediaplayer", ' +
        'playerType:"site"}){ signature value } videoQualities{ quality frameRate sourceURL } } }', { s: slug })
        .then(function (d) {
          var c = d.clip;
          if (!c || !c.videoQualities || !c.videoQualities.length) throw new Error('Clip nicht verfügbar');
          // Twitch doesn't sort the list: take the best version up to 1080p.
          var q = c.videoQualities.filter(function (v) { return +v.quality <= 1080; })
            .sort(function (x, y) { return +y.quality - +x.quality || (y.frameRate || 0) - (x.frameRate || 0); })[0] || c.videoQualities[0];
          var t = c.playbackAccessToken, auth = t ? '?sig=' + encodeURIComponent(t.signature) + '&token=' + encodeURIComponent(t.value) : '';
          // The smallest version has the same sound; the player decodes it for other speeds.
          var small = c.videoQualities.slice().sort(function (x, y) { return +x.quality - +y.quality; })[0];
          var all = c.videoQualities.map(function (v) {
            return { height: +v.quality, fps: v.frameRate || 30, url: v.sourceURL + auth };
          });
          return { url: q.sourceURL + auth, soundUrl: small.sourceURL + auth, qualities: all };
        });
    },

    // Schedules of several channels at once: [{ login, displayName, profileImageURL, stream, segments }].
    schedules: function (logins) {
      if (!logins.length) return Promise.resolve([]);
      return gql('query($l:[String!]){ users(logins:$l){ login displayName profileImageURL(width:70) stream{ id } ' +
        'channel{ schedule{ segmentList(first:20){ edges{ node{ startAt endAt title categories{ name displayName } } } } } } } }',
        { l: logins.slice(0, 50) })
        .then(function (d) {
          return (d.users || []).filter(Boolean).map(function (u) {
            var sch = u.channel && u.channel.schedule;
            return { login: u.login, displayName: u.displayName, profileImageURL: u.profileImageURL, live: !!u.stream,
              segments: sch ? edgesToNodes(sch.segmentList) : [] };
          });
        });
    },

    // Is this channel raiding someone right now? Resolves { live, target } (target: user or null).
    raidState: function (login) {
      return gql('query($login:String!){ user(login:$login){ stream{ id } raid{ targetChannel{ login displayName ' +
        'profileImageURL(width:70) } } } }', { login: login })
        .then(function (d) {
          var u = d.user || {};
          return { live: !!u.stream, target: u.raid && u.raid.targetChannel ? u.raid.targetChannel : null };
        });
    },

    topCategories: function () {
      return gql('query{ games(first:100){ edges{ node{ name displayName ' +
        'boxArtURL(width:192,height:256) viewersCount } } } }')
        .then(function (d) { return edgesToNodes(d.games); });
    },

    // German streams first if that's the setting; falls back to all languages when there are none.
    categoryStreams: function (name) {
      function query(de) {
        return gql('query($name:String!){ game(name:$name){ streams(first:100' + (de ? ', options:{languages:["DE"]}' : '') +
          '){ edges{ node{ ' + STREAM_FIELDS + ' } } } } }', { name: name })
          .then(function (d) { return d.game ? edgesToNodes(d.game.streams) : []; });
      }
      if (TT.store.get('lang', 'de') !== 'de') return query(false);
      return query(true).then(function (list) { return list.length ? list : query(false); },
        function () { return query(false); });
    },

    // Official Helix endpoint first; GQL's followedLiveUsers as a fallback.
    followedLive: function () {
      return helixFollowedLive().catch(function (helixErr) {
        TT.log('helix followed failed, trying GQL:', helixErr && helixErr.message);
        return gqlFollowedLive().catch(function (gqlErr) {
          throw new Error('Gefolgte Kanäle konnten nicht geladen werden (' + (helixErr.message || helixErr) + '; ' +
            (gqlErr.message || gqlErr) + '). Bitte ab- und wieder anmelden.');
        });
      });
    },

    followedChannels: helixFollowedChannels,

    // Whether the signed-in user follows `login` (false when signed out).
    isFollowing: function (login) {
      if (!auth.current()) return Promise.resolve(false);
      return gql('query($l:String!){ user(login:$l){ self{ follower{ followedAt } } } }', { l: login })
        .then(function (d) { return !!(d.user && d.user.self && d.user.self.follower); });
    },

    // Follow (on = true) or unfollow a channel. Helix dropped this in 2023; GQL with the
    // TV client's login still allows it.
    setFollow: function (login, on) {
      return api.userId(login).then(function (id) {
        if (!id) throw new Error('Kanal nicht gefunden');
        return on
          ? gql('mutation($id:ID!){ followUser(input:{targetID:$id, disableNotifications:false}){ follow{ followedAt } error{ code } } }', { id: id })
            .then(function (d) {
              var r = d.followUser || {};
              if (r.error && r.error.code) throw new Error(r.error.code);
              return true;
            })
          : gql('mutation($id:ID!){ unfollowUser(input:{targetID:$id}){ follow{ followedAt } } }', { id: id })
            .then(function () { return false; });
      });
    },

    // Categories the signed-in user follows that are live right now.
    followedGames: function () {
      return gql('query{ currentUser{ followedGames(first:30, type:LIVE){ nodes{ id name displayName ' +
        'boxArtURL(width:192,height:256) viewersCount } } } }').then(function (d) {
        return d.currentUser && d.currentUser.followedGames ? d.currentUser.followedGames.nodes || [] : [];
      });
    },

    // { id, following } for the category `name` (signed in).
    gameFollow: function (name) {
      return gql('query($n:String!){ game(name:$n){ id self{ follow{ followedAt } } } }', { n: name }).then(function (d) {
        if (!d.game) throw new Error('Kategorie nicht gefunden');
        return { id: d.game.id, following: !!(d.game.self && d.game.self.follow) };
      });
    },

    setGameFollow: function (id, on) {
      return gql(on ? 'mutation($id:ID!){ followGame(input:{gameID:$id}){ game{ id } } }'
        : 'mutation($id:ID!){ unfollowGame(input:{gameID:$id}){ game{ id } } }', { id: id })
        .then(function () { return on; });
    },

    // Chat message as the signed-in user (the same GQL mutation twitch.tv uses). It comes
    // back through the normal (anonymous) chat connection like every other message.
    sendChat: function (login, message) {
      return api.userId(login).then(function (id) {
        if (!id) throw new Error('Kanal nicht gefunden');
        return gql('mutation($i:SendChatMessageInput!){ sendChatMessage(input:$i){ dropReason message{ id } } }',
          { i: { channelID: id, message: message, nonce: Date.now() + Math.random().toString(36).slice(2, 8) } });
      }).then(function (d) {
        var r = d.sendChatMessage || {};
        if (r.dropReason) throw new Error(r.dropReason);
        return true;
      });
    },

    // Channel page: profile, live stream (if any) and recent videos.
    channelPage: function (login) {
      return gql('query($login:String!){ user(login:$login){ id login displayName ' +
        'profileImageURL(width:150) description stream{ id title viewersCount createdAt ' +
        'previewImageURL(width:356,height:200) game{ name displayName } } ' +
        'videos(first:30, sort:TIME){ edges{ node{ id title lengthSeconds viewCount publishedAt status ' +
        'previewThumbnailURL(width:440,height:248) game{ name displayName } } } } } }', { login: login })
        .then(function (d) {
          var u = d.user;
          if (!u) throw new Error('Channel not found');
          u.videoList = edgesToNodes(u.videos);
          if (u.stream) u.stream.broadcaster = { login: u.login, displayName: u.displayName, profileImageURL: u.profileImageURL };
          return u;
        });
    },

    userId: function (login) {
      return gql('query($login:String!){ user(login:$login){ id } }', { login: login })
        .then(function (d) { return d.user ? d.user.id : null; });
    },

    vodToken: function (id) {
      return gql('query($id:ID!){ videoPlaybackAccessToken(id:$id, params:{platform:"web", ' +
        'playerBackend:"mediaplayer", playerType:"site"}){ value signature } }', { id: id })
        .then(function (d) {
          var t = d.videoPlaybackAccessToken;
          if (!t) throw new Error('No playback token for this video');
          return t;
        });
    },

    // Path of a VOD's files on the CDN, taken from its seek previews (null if unknown).
    vodCdnBase: function (id) {
      return gql('query($id:ID!){ video(id:$id){ seekPreviewsURL } }', { id: id }).then(function (d) {
        var url = (d.video && d.video.seekPreviewsURL) || '', cut = url.indexOf('/storyboards/');
        return cut > 0 ? url.slice(0, cut) : null;
      });
    },

    vodUsherUrl: function (id, token) {
      return 'https://usher.ttvnw.net/vod/' + encodeURIComponent(id) + '.m3u8' +
        '?allow_source=true&player_backend=mediaplayer&playlist_include_framerate=true' +
        '&supported_codecs=avc1&cdm=wv&p=' + Math.floor(Math.random() * 9999999) +
        '&sig=' + encodeURIComponent(token.signature) +
        '&token=' + encodeURIComponent(token.value);
    },

    search: function (q) {
      return gql('query($q:String!){ searchFor(userQuery:$q, platform:"web"){ ' +
        'channels{ items{ login displayName profileImageURL(width:150) ' +
        'stream{ id title viewersCount createdAt previewImageURL(width:356,height:200) game{ name displayName } } } } ' +
        'games{ items{ name displayName boxArtURL(width:192,height:256) viewersCount } } } }', { q: q })
        .then(function (d) {
          var s = d.searchFor || {};
          return {
            channels: (s.channels && s.channels.items) || [],
            games: (s.games && s.games.items) || []
          };
        });
    },

    // Live stream info for one channel (used by the player OSD and channel search results).
    channel: function (login) {
      return gql('query($login:String!){ user(login:$login){ login displayName ' +
        'profileImageURL(width:70) stream{ id title viewersCount createdAt ' +
        'previewImageURL(width:356,height:200) game{ name displayName } } } }', { login: login })
        .then(function (d) { return d.user; });
    },

    playbackToken: function (login, playerType, anonymous) {
      var platform = playerType === 'autoplay' || playerType === 'mobile_feed' ? 'android' : 'web';
      return gql('query($login:String!,$pt:String!,$pf:String!){ ' +
        'streamPlaybackAccessToken(channelName:$login, params:{platform:$pf, ' +
        'playerBackend:"mediaplayer", playerType:$pt}){ value signature } }',
        { login: login, pt: playerType, pf: platform }, { anonymous: anonymous })
        .then(function (d) {
          var t = d.streamPlaybackAccessToken;
          if (!t) throw new Error('No playback token');
          return t;
        });
    },

    usherUrl: function (login, token) {
      return 'https://usher.ttvnw.net/api/channel/hls/' + encodeURIComponent(login) + '.m3u8' +
        '?allow_source=true&fast_bread=true&player_backend=mediaplayer' +
        '&playlist_include_framerate=true&reassignments_supported=true' +
        '&supported_codecs=avc1&cdm=wv' +
        '&p=' + Math.floor(Math.random() * 9999999) +
        '&sig=' + encodeURIComponent(token.signature) +
        '&token=' + encodeURIComponent(token.value);
    }
  };

  TT.api = api;
})();

/* ---- adblock.js ---- */
;// Twitch ad blocking at the HLS playlist level (same idea as TwitchAdSolutions "vaft").
//
// Twitch stitches ads into the live media playlist server-side. While an ad plays, the
// playlist's segments are ad segments (EXTINF title other than "live"). We:
//   1. detect ad segments / ad markers in every media playlist reload,
//   2. while ads are present, fetch a playlist for the same quality with a different
//      playerType, which often comes without ads: "mobile_feed" (as Android; ad-free at
//      full quality, see scamorza/TwitchAdBlock), "embed", "popout", and last
//      "autoplay" (ad-free but only up to 360p),
//   3. if every backup has ads too, strip the ad segments (picture freezes, no ad).
// Output playlists are renumbered by PROGRAM-DATE-TIME so hls.js sees one continuous
// sequence even when we switch between the main and backup playlists.
(function (root) {
  var AD_MARKER = /stitched-ad|X-TV-TWITCH-AD|CLASS="twitch-ad/i;
  var BACKUP_TYPES = ['mobile_feed', 'embed', 'popout', 'autoplay'];

  function attr(line, name) {
    var m = new RegExp('[:,]' + name + '=("([^"]*)"|[^,]*)').exec(line);
    return m ? (m[2] !== undefined ? m[2] : m[1]) : null;
  }

  function parseMaster(text) {
    var lines = text.split(/\r?\n/);
    var variants = [];
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (line.indexOf('#EXT-X-STREAM-INF:') === 0) {
        var uri = (lines[i + 1] || '').trim();
        variants.push({
          url: uri,
          resolution: attr(line, 'RESOLUTION'),
          name: attr(line, 'VIDEO'),
          codecs: attr(line, 'CODECS') || '',
          bandwidth: parseInt(attr(line, 'BANDWIDTH'), 10) || 0,
          frameRate: parseFloat(attr(line, 'FRAME-RATE')) || 0
        });
      }
    }
    return variants;
  }

  function isAudioOnly(v) {
    return !!v.codecs && !/avc1|hvc1|hev1|av01/i.test(v.codecs);
  }

  // Many TVs cannot decode the 1440p "Enhanced Broadcasting" source and hls.js starts on
  // the first variant, which leaves a black screen. Keep only variants up to 1080p whose
  // codecs the TV's MediaSource says it can play.
  var MAX_HEIGHT = 1080;

  function isPlayable(v) {
    var m = /^\d+x(\d+)$/.exec(v.resolution || '');
    if (m && parseInt(m[1], 10) > MAX_HEIGHT) return false;
    if (v.codecs && typeof MediaSource !== 'undefined' && MediaSource.isTypeSupported &&
        !MediaSource.isTypeSupported('video/mp4; codecs="' + v.codecs + '"')) return false;
    return true;
  }

  // Drops the audio-only rendition and variants the TV can't play so hls.js never picks them.
  function cleanMaster(text) {
    var lines = text.split(/\r?\n/);
    var out = [];
    var kept = 0;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (line.indexOf('#EXT-X-STREAM-INF:') === 0) {
        var v = { codecs: attr(line, 'CODECS') || '', resolution: attr(line, 'RESOLUTION') };
        if (isAudioOnly(v) || !isPlayable(v)) {
          i++; // skip its URI too
          continue;
        }
        kept++;
      }
      out.push(line);
    }
    // Never filter everything away: fall back to the old behaviour (audio-only dropped).
    if (!kept) return cleanMasterAudioOnly(text);
    return out.join('\n');
  }

  function cleanMasterAudioOnly(text) {
    var lines = text.split(/\r?\n/);
    var out = [];
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (line.indexOf('#EXT-X-STREAM-INF:') === 0 &&
          isAudioOnly({ codecs: attr(line, 'CODECS') || '' })) {
        i++;
        continue;
      }
      out.push(line);
    }
    return out.join('\n');
  }

  function parseMedia(text) {
    var lines = text.split(/\r?\n/);
    var p = { targetDuration: 2, mediaSequence: 0, ended: false, segments: [], adMarkers: AD_MARKER.test(text) };
    var cur = {};
    var map = null; // fMP4 streams (e.g. Enhanced Broadcasting) need their init segment
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      if (line.charAt(0) !== '#') {
        cur.uri = line;
        cur.map = map;
        p.segments.push(cur);
        cur = {};
      } else if (line.indexOf('#EXT-X-MAP:') === 0) {
        map = line;
      } else if (line.indexOf('#EXTINF:') === 0) {
        var body = line.substring(8);
        var comma = body.indexOf(',');
        cur.duration = parseFloat(comma >= 0 ? body.substring(0, comma) : body) || 0;
        cur.title = comma >= 0 ? body.substring(comma + 1) : '';
      } else if (line.indexOf('#EXT-X-PROGRAM-DATE-TIME:') === 0) {
        cur.pdt = line.substring(25);
      } else if (line.indexOf('#EXT-X-TARGETDURATION:') === 0) {
        p.targetDuration = parseInt(line.substring(22), 10) || 2;
      } else if (line.indexOf('#EXT-X-MEDIA-SEQUENCE:') === 0) {
        p.mediaSequence = parseInt(line.substring(22), 10) || 0;
      } else if (line.indexOf('#EXT-X-ENDLIST') === 0) {
        p.ended = true;
      }
    }
    return p;
  }

  function isAdSegment(seg) {
    return !!seg.title && seg.title !== 'live';
  }

  // Only ad *segments* count: stitched-ad DATERANGE markers can linger in the playlist
  // after the break is over (parsed.adMarkers is kept for debugging).
  function hasAds(parsed) {
    for (var i = 0; i < parsed.segments.length; i++) if (isAdSegment(parsed.segments[i])) return true;
    return false;
  }

  function stripAds(parsed) {
    return {
      targetDuration: parsed.targetDuration,
      mediaSequence: parsed.mediaSequence,
      ended: parsed.ended,
      adMarkers: false,
      segments: parsed.segments.filter(function (s) { return !isAdSegment(s); })
    };
  }

  // Pick the variant in `variants` that best matches `want` (same name, else resolution,
  // else closest bandwidth).
  function pickVariant(variants, want) {
    var list = variants.filter(function (v) { return !isAudioOnly(v); });
    var playable = list.filter(isPlayable);
    if (playable.length) list = playable;
    if (!list.length) return null;
    if (!want) return list[0];
    var i;
    for (i = 0; i < list.length; i++) if (want.name && list[i].name === want.name) return list[i];
    for (i = 0; i < list.length; i++) {
      if (want.resolution && list[i].resolution === want.resolution &&
          Math.round(list[i].frameRate) === Math.round(want.frameRate)) return list[i];
    }
    for (i = 0; i < list.length; i++) if (want.resolution && list[i].resolution === want.resolution) return list[i];
    var best = list[0];
    for (i = 1; i < list.length; i++) {
      if (Math.abs(list[i].bandwidth - want.bandwidth) < Math.abs(best.bandwidth - want.bandwidth)) best = list[i];
    }
    return best;
  }

  // Gives segments stable sequence numbers keyed by PROGRAM-DATE-TIME, so playlists
  // from different sources (main / backup) line up for hls.js.
  function Normalizer() {
    this.snByKey = {};
    this.keys = [];
    this.maxSn = null;
    this.lastText = null;
    this.mapByUri = {};
    this.mapKeys = [];
  }

  // seg URI -> init segment URI (from an #EXT-X-MAP line).
  Normalizer.prototype.rememberMap = function (uri, mapLine) {
    if (this.mapByUri[uri]) return;
    var m = /URI="([^"]*)"/.exec(mapLine);
    if (!m) return;
    this.mapByUri[uri] = m[1];
    this.mapKeys.push(uri);
    if (this.mapKeys.length > 300) delete this.mapByUri[this.mapKeys.shift()];
  };

  Normalizer.prototype.key = function (seg) {
    if (seg.pdt) {
      var t = Date.parse(seg.pdt);
      if (!isNaN(t)) return 't' + Math.round(t / 500);
    }
    return 'u' + seg.uri;
  };

  Normalizer.prototype.render = function (parsed) {
    var segs = parsed.segments;
    if (!segs.length) {
      // Nothing playable (ad with no clean backup): repeat the last clean playlist so
      // hls.js just waits instead of erroring or playing the ad.
      return this.lastText || null;
    }
    if (this.maxSn === null) this.maxSn = parsed.mediaSequence - 1;
    var sns = [];
    for (var i = 0; i < segs.length; i++) {
      var k = this.key(segs[i]);
      var sn = this.snByKey[k];
      if (sn === undefined) {
        sn = ++this.maxSn;
        this.snByKey[k] = sn;
        this.keys.push(k);
        if (this.keys.length > 300) delete this.snByKey[this.keys.shift()];
      }
      sns.push(sn);
    }
    // Sequence numbers in a playlist must be consecutive: keep the longest consecutive tail.
    var start = sns.length - 1;
    while (start > 0 && sns[start - 1] === sns[start] - 1) start--;

    var target = parsed.targetDuration;
    for (i = start; i < segs.length; i++) target = Math.max(target, Math.ceil(segs[i].duration));
    var out = ['#EXTM3U', '#EXT-X-VERSION:3', '#EXT-X-TARGETDURATION:' + target,
      '#EXT-X-MEDIA-SEQUENCE:' + sns[start]];
    for (i = start; i < segs.length; i++) {
      // fMP4 segments are repackaged as TS by the fragment loader (fmp4ts.js), so the
      // playlist must not announce an init segment; remember it for the loader instead.
      if (segs[i].map) this.rememberMap(segs[i].uri, segs[i].map);
      if (segs[i].pdt) out.push('#EXT-X-PROGRAM-DATE-TIME:' + segs[i].pdt);
      out.push('#EXTINF:' + segs[i].duration.toFixed(3) + ',live');
      out.push(segs[i].uri);
    }
    if (parsed.ended) out.push('#EXT-X-ENDLIST');
    this.lastText = out.join('\n') + '\n';
    return this.lastText;
  };

  // opts: {
  //   fetchText(url) -> Promise<string>,
  //   backupMasterUrl(playerType) -> Promise<string>  (usher URL with a fresh token),
  //   onAdState(active, how)  how: 'backup' | 'stripped'
  // }
  function AdController(opts) {
    this.opts = opts;
    this.normalizer = new Normalizer();
    this.variantByUrl = {};
    this.backupMasters = {}; // playerType -> { at, variants }
    this.lastGoodType = null;
    this.adActive = false;
    this.adHow = null;
    this.blockedCount = 0;
  }

  // Init segment URI for an fMP4 segment URL, or null for TS segments.
  AdController.prototype.mapFor = function (url) {
    return this.normalizer.mapByUri[url] || null;
  };

  AdController.prototype.processMaster = function (url, text) {
    var variants = parseMaster(text);
    for (var i = 0; i < variants.length; i++) this.variantByUrl[variants[i].url] = variants[i];
    return cleanMaster(text);
  };

  AdController.prototype.setAd = function (active, how) {
    if (active === this.adActive && how === this.adHow) return;
    if (active && !this.adActive) this.blockedCount++;
    this.adActive = active;
    this.adHow = how;
    if (this.opts.onAdState) this.opts.onAdState(active, how);
  };

  AdController.prototype.processMedia = function (url, text) {
    var self = this;
    var parsed = parseMedia(text);
    if (!hasAds(parsed)) {
      self.setAd(false, null);
      return Promise.resolve(self.normalizer.render(parsed) || text);
    }
    var want = self.variantByUrl[url] || null;
    return self.findCleanBackup(want).then(function (backup) {
      if (backup) {
        self.setAd(true, 'backup');
        return self.normalizer.render(backup);
      }
      self.setAd(true, 'stripped');
      return self.normalizer.render(stripAds(parsed)) || text;
    });
  };

  AdController.prototype.backupVariants = function (type) {
    var self = this;
    var cached = self.backupMasters[type];
    if (cached && Date.now() - cached.at < 5 * 60 * 1000) return Promise.resolve(cached.variants);
    return self.opts.backupMasterUrl(type).then(function (masterUrl) {
      return self.opts.fetchText(masterUrl);
    }).then(function (text) {
      var variants = parseMaster(text);
      self.backupMasters[type] = { at: Date.now(), variants: variants };
      return variants;
    });
  };

  AdController.prototype.findCleanBackup = function (want) {
    var self = this;
    var order = BACKUP_TYPES.slice();
    if (self.lastGoodType) {
      order.splice(order.indexOf(self.lastGoodType), 1);
      order.unshift(self.lastGoodType);
    }
    function attempt(i) {
      if (i >= order.length) return Promise.resolve(null);
      var type = order[i];
      return self.backupVariants(type).then(function (variants) {
        var v = pickVariant(variants, want);
        if (!v) return null;
        return self.opts.fetchText(v.url);
      }).then(function (text) {
        if (!text) return attempt(i + 1);
        var parsed = parseMedia(text);
        if (hasAds(parsed) || !parsed.segments.length) return attempt(i + 1);
        self.lastGoodType = type;
        return parsed;
      }, function () {
        delete self.backupMasters[type]; // token may have expired; refetch next time
        return attempt(i + 1);
      });
    }
    return attempt(0);
  };

  var exportsObj = {
    parseMaster: parseMaster,
    cleanMaster: cleanMaster,
    isPlayable: isPlayable,
    parseMedia: parseMedia,
    isAdSegment: isAdSegment,
    hasAds: hasAds,
    stripAds: stripAds,
    pickVariant: pickVariant,
    Normalizer: Normalizer,
    AdController: AdController
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = exportsObj;
  root.TT = root.TT || {};
  root.TT.adblock = exportsObj;
})(typeof window !== 'undefined' ? window : this);

/* ---- audio.js ---- */
;// Compressor setting (Aus / Leicht / Nacht). The player applies it on its own sound path
// (see "own sound path" in player.js): the TV gives Web Audio no samples from the video.
// Chrome's compressor adds make-up gain of its own; makeupDb is chosen (measured on Twitch
// speech) so loud parts stay as loud as with Aus and quiet parts come up by ~3 / ~7 dB.
(function () {
  var PRESETS = {
    off: null,
    light: { label: 'Leicht', threshold: -24, ratio: 3, knee: 12, attack: 0.01, release: 0.25, makeupDb: -4 },
    night: { label: 'Nacht', threshold: -40, ratio: 12, knee: 6, attack: 0.003, release: 0.25, makeupDb: -2 }
  };
  var ORDER = ['off', 'light', 'night'];
  var mode = TT.store.get('compressor', 'off');
  if (!PRESETS.hasOwnProperty(mode)) mode = 'off';

  function supported() { return !!(window.AudioContext || window.webkitAudioContext); }

  TT.audio = {
    mode: function () { return mode; },
    label: function () { return PRESETS[mode] ? PRESETS[mode].label : 'Aus'; },
    preset: function () { return PRESETS[mode]; },
    supported: supported,
    // Cycles Off -> Light -> Night. Returns the new label, or null if unsupported.
    cycle: function () {
      if (!supported()) return null;
      mode = ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length];
      TT.store.set('compressor', mode);
      return TT.audio.label();
    }
  };
})();

/* ---- stretch.js ---- */
;// Streaming WSOLA time stretch: plays audio `speed` times faster at the same pitch.
// Frames of 40 ms with 50 % Hann overlap; each frame's start is searched within ±12 ms for the
// best match with the natural continuation of the previous frame (coarse on a decimated mono
// mix, then fine). Output sample j belongs to input sample j * speed (within ±12 ms).
(function () {
  function Stretcher(nch, sr, speed) {
    this.N = Math.round(0.040 * sr) & ~1;
    this.Hs = this.N / 2;
    this.Ha = this.Hs * speed;
    this.S = Math.round(0.012 * sr);
    this.inp = [];
    this.acc = [];
    for (var c = 0; c < nch; c++) { this.inp.push(new Float32Array(0)); this.acc.push(new Float32Array(this.N)); }
    this.mono = new Float32Array(0);
    this.base = 0;   // absolute input index of inp[0]
    this.next = 0;   // nominal absolute input position of the next frame
    this.prev = -1;  // absolute input position of the previous frame
    this.win = new Float32Array(this.N);
    for (var i = 0; i < this.N; i++) this.win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / this.N);
  }

  function join(a, b) {
    var out = new Float32Array(a.length + b.length);
    out.set(a, 0);
    out.set(b, a.length);
    return out;
  }

  Stretcher.prototype.score = function (a, b, step) {
    var m = this.mono, sum = 0, ea = 1e-9, eb = 1e-9, x, y;
    a -= this.base;
    b -= this.base;
    for (var k = 0; k < this.Hs; k += step) { x = m[a + k]; y = m[b + k]; sum += x * y; ea += x * x; eb += y * y; }
    return sum / Math.sqrt(ea * eb);
  };

  // Takes new input channels, returns the output that is complete so far.
  Stretcher.prototype.process = function (chs) {
    var nch = this.inp.length, c, i, n = chs[0].length;
    var mono = new Float32Array(n);
    for (c = 0; c < nch; c++) {
      this.inp[c] = join(this.inp[c], chs[c]);
      for (i = 0; i < n; i++) mono[i] += chs[c][i];
    }
    this.mono = join(this.mono, mono);
    var N = this.N, Hs = this.Hs, S = this.S, pieces = [];
    for (;;) {
      var end = this.base + this.inp[0].length, nominal = Math.round(this.next), pos = nominal;
      if (nominal + S + N > end) break;
      if (this.prev >= 0) {
        var target = this.prev + Hs, best = nominal, bestS = -2, d, sc;
        var lo = Math.max(this.base, nominal - S), hi = Math.min(end - N, nominal + S);
        if (target + Hs > end) break;
        for (d = lo; d <= hi; d += 4) { sc = this.score(target, d, 4); if (sc > bestS) { bestS = sc; best = d; } }
        var coarse = best;
        for (d = Math.max(lo, coarse - 3); d <= Math.min(hi, coarse + 3); d++) {
          sc = this.score(target, d, 2);
          if (sc > bestS) { bestS = sc; best = d; }
        }
        pos = best;
      }
      var piece = [];
      for (c = 0; c < nch; c++) {
        var src = this.inp[c], acc = this.acc[c], off = pos - this.base;
        for (i = 0; i < N; i++) acc[i] += src[off + i] * this.win[i];
        piece.push(new Float32Array(acc.subarray(0, Hs)));
        acc.set(acc.subarray(Hs), 0);
        for (i = N - Hs; i < N; i++) acc[i] = 0;
      }
      pieces.push(piece);
      this.prev = pos;
      this.next += this.Ha;
    }
    // Drop input that no future frame can reach.
    var keep = Math.min(this.prev, Math.round(this.next) - S) - this.base;
    if (keep > 0) {
      for (c = 0; c < nch; c++) this.inp[c] = this.inp[c].subarray(keep);
      this.mono = this.mono.subarray(keep);
      this.base += keep;
    }
    var out = [];
    for (c = 0; c < nch; c++) {
      var o = new Float32Array(pieces.length * Hs);
      for (i = 0; i < pieces.length; i++) o.set(pieces[i][c], i * Hs);
      out.push(o);
    }
    return out;
  };

  TT.Stretcher = Stretcher;
})();

/* ---- chat.js ---- */
;// Read-only Twitch chat over anonymous IRC WebSocket.
(function () {
  var MAX_LINES = 40; // more never fits on screen; fewer DOM nodes on slow TVs
  var MODES = ['off', 'side', 'overlay'];
  var SIZES = ['s', 'm', 'l', 'xl'];
  var ws = null, channel = null, box = null, list = null, reconnectTimer = null, qrBox = null;
  var mode = TT.store.get('chatMode', 'side');
  if (MODES.indexOf(mode) < 0) mode = 'side';
  var size = TT.store.get('chatSize', 'm');
  if (SIZES.indexOf(size) < 0) size = 'm';

  function me() {
    var a = TT.api.auth.current();
    return a && a.login ? a.login.toLowerCase() : null;
  }

  function trim() { while (list.childNodes.length > MAX_LINES) list.removeChild(list.firstChild); }

  // ---- delay: messages appear when the picture gets there (no spoilers) ---------------
  // The video runs behind the live edge by the player's latency plus ~2 s that Twitch needs
  // to encode and publish a segment; chat arrives in real time.
  var syncOn = TT.store.get('chatSync', true);
  var queue = [], flushTimer = null;

  function delayMs() {
    if (!syncOn || !TT.player || !TT.player.latency) return 0;
    var l = TT.player.latency();
    return l > 0 ? Math.min(30, l + 2) * 1000 : 0;
  }

  function flush() {
    var now = Date.now();
    while (queue.length && queue[0].at <= now) queue.shift().fn();
    if (!queue.length) { clearInterval(flushTimer); flushTimer = null; }
  }

  function enqueue(fn) {
    var d = delayMs();
    if (!d) { fn(); return; }
    var at = Date.now() + d;
    if (queue.length && queue[queue.length - 1].at > at) at = queue[queue.length - 1].at;
    queue.push({ at: at, fn: fn });
    if (!flushTimer) flushTimer = setInterval(flush, 250);
  }

  function clearQueue() {
    queue = [];
    clearInterval(flushTimer);
    flushTimer = null;
  }

  // ---- 7TV emotes (can be turned off in Settings for slower TVs) -------------
  var sevenTvOn = TT.store.get('sevenTv', true);
  var stvGlobal = null;   // name -> image URL, loaded once
  var stvChannel = {};    // name -> image URL for the open channel
  var stvLoadId = 0;

  function stvMap(emotes) {
    var map = {};
    (emotes || []).forEach(function (e) {
      var host = e.data && e.data.host;
      if (host && host.url) map[e.name] = 'https:' + host.url + '/1x.webp';
    });
    return map;
  }

  // BTTV list ([{ id, code }]) -> name -> image URL.
  function bttvMap(list) {
    var map = {};
    (list || []).forEach(function (e) { if (e && e.code && e.id) map[e.code] = 'https://cdn.betterttv.net/emote/' + e.id + '/1x'; });
    return map;
  }

  // FFZ via BTTV's cache ([{ code, images: { '1x': url } }]) -> name -> image URL.
  function ffzMap(list) {
    var map = {};
    (list || []).forEach(function (e) { if (e && e.code && e.images && e.images['1x']) map[e.code] = e.images['1x']; });
    return map;
  }

  function merge(into, map) { for (var k in map) if (map.hasOwnProperty(k) && !into.hasOwnProperty(k)) into[k] = map[k]; }

  function getJson(url) { return TT.http('GET', url).then(function (r) { return r.json(); }); }

  // Third-party emotes (7TV, BTTV, FFZ): global sets once, channel sets per stream.
  function loadSevenTv(login) {
    var my = ++stvLoadId;
    stvChannel = {};
    if (!sevenTvOn) return;
    if (!stvGlobal) {
      stvGlobal = {};
      getJson('https://7tv.io/v3/emote-sets/global').then(function (j) { merge(stvGlobal, stvMap(j.emotes)); }).catch(function () {});
      getJson('https://api.betterttv.net/3/cached/emotes/global').then(function (j) { merge(stvGlobal, bttvMap(j)); }).catch(function () {});
      getJson('https://api.betterttv.net/3/cached/frankerfacez/emotes/global').then(function (j) { merge(stvGlobal, ffzMap(j)); }).catch(function () {});
    }
    TT.api.userId(login).then(function (id) {
      if (!id || my !== stvLoadId) return;
      function add(map) { if (my === stvLoadId) merge(stvChannel, map); }
      getJson('https://7tv.io/v3/users/twitch/' + id).then(function (j) {
        add(stvMap(j.emote_set && j.emote_set.emotes));
      }).catch(function () { /* channel has no 7TV set */ });
      getJson('https://api.betterttv.net/3/cached/users/twitch/' + id).then(function (j) {
        add(bttvMap((j.channelEmotes || []).concat(j.sharedEmotes || [])));
      }).catch(function () { /* no BTTV emotes */ });
      getJson('https://api.betterttv.net/3/cached/frankerfacez/users/twitch/' + id).then(function (j) {
        add(ffzMap(j));
      }).catch(function () { /* no FFZ emotes */ });
    }).catch(function () {});
  }

  function sevenTvUrl(word) {
    if (!sevenTvOn) return null;
    if (stvChannel.hasOwnProperty(word)) return stvChannel[word];
    if (stvGlobal && stvGlobal.hasOwnProperty(word)) return stvGlobal[word];
    return null;
  }

  // Appends plain text, swapping in 7TV emotes word by word.
  function appendText(into, text) {
    if (!text) return;
    if (!sevenTvOn) { into.appendChild(document.createTextNode(text)); return; }
    var parts = text.split(/(\s+)/);
    var buf = '';
    for (var i = 0; i < parts.length; i++) {
      var url = parts[i] && !/^\s+$/.test(parts[i]) ? sevenTvUrl(parts[i]) : null;
      if (url) {
        if (buf) { into.appendChild(document.createTextNode(buf)); buf = ''; }
        var img = TT.el('img', 'emote');
        img.src = url;
        img.alt = parts[i];
        into.appendChild(img);
      } else {
        buf += parts[i];
      }
    }
    if (buf) into.appendChild(document.createTextNode(buf));
  }

  function parseTags(raw) {
    var tags = {};
    var parts = raw.split(';');
    for (var i = 0; i < parts.length; i++) {
      var eq = parts[i].indexOf('=');
      tags[parts[i].substring(0, eq)] = parts[i].substring(eq + 1);
    }
    return tags;
  }

  // Splits `text` into text/emote parts using the IRC `emotes` tag ("id:0-4,6-10/id2:...").
  function renderMessage(text, emotesTag, into) {
    var ranges = [];
    if (emotesTag) {
      var groups = emotesTag.split('/');
      for (var g = 0; g < groups.length; g++) {
        var c = groups[g].indexOf(':');
        var id = groups[g].substring(0, c);
        var spans = groups[g].substring(c + 1).split(',');
        for (var s = 0; s < spans.length; s++) {
          var ab = spans[s].split('-');
          ranges.push({ id: id, start: +ab[0], end: +ab[1] });
        }
      }
      ranges.sort(function (a, b) { return a.start - b.start; });
    }
    // Emote positions are in code points, not UTF-16 units.
    var chars = Array.from ? Array.from(text) : text.split('');
    var pos = 0;
    for (var r = 0; r < ranges.length; r++) {
      if (ranges[r].start > pos) appendText(into, chars.slice(pos, ranges[r].start).join(''));
      var img = TT.el('img', 'emote');
      img.src = 'https://static-cdn.jtvnw.net/emoticons/v2/' + ranges[r].id + '/default/dark/1.0';
      img.alt = chars.slice(ranges[r].start, ranges[r].end + 1).join('');
      into.appendChild(img);
      pos = ranges[r].end + 1;
    }
    if (pos < chars.length) appendText(into, chars.slice(pos).join(''));
  }

  function addLine(tags, nick, text) {
    if (!list) return;
    var line = TT.el('div', 'chat-line');
    // Highlights: your own messages, mentions of you, highlighted (channel points) and Bits.
    var my = me();
    if (my && nick.toLowerCase() === my) line.className += ' chat-own';
    else if (my && new RegExp('(^|[^a-z0-9_])' + my + '([^a-z0-9_]|$)').test(text.toLowerCase())) line.className += ' chat-mention';
    if (tags['msg-id'] === 'highlighted-message') line.className += ' chat-highlight';
    if (tags.bits) {
      line.className += ' chat-bits';
      line.appendChild(TT.el('span', 'bits', TT.fmtCount(parseInt(tags.bits, 10) || 0) + ' Bits'));
    }
    // Small coloured badges like Twitch: moderator, VIP, subscriber.
    var badges = tags.badges || '';
    if (/(^|,)(broadcaster|moderator)\//.test(badges)) line.appendChild(TT.el('span', 'bdg mod', 'M'));
    if (/(^|,)vip\//.test(badges)) line.appendChild(TT.el('span', 'bdg vip', 'V'));
    if (/(^|,)(subscriber|founder)\//.test(badges)) line.appendChild(TT.el('span', 'bdg sub', 'S'));
    var name = TT.el('span', 'chat-name', (tags['display-name'] || nick) + ': ');
    name.style.color = tags.color || '#b9a3e3';
    line.appendChild(name);
    var msg = TT.el('span', 'chat-text');
    var action = /^\u0001ACTION (.*)\u0001$/.exec(text);
    if (action) { text = action[1]; msg.style.fontStyle = 'italic'; }
    renderMessage(text, tags.emotes, msg);
    line.appendChild(msg);
    list.appendChild(line);
    trim();
  }

  // ---- USERNOTICE: subs, gifted subs, raids, announcements --------------------------------
  function unescapeTag(v) {
    return String(v || '').replace(/\\s/g, ' ').replace(/\\:/g, ';').replace(/\\\\/g, '\\');
  }

  // German headline for an event, null to skip it.
  function noticeText(t) {
    var id = t['msg-id'];
    var who = unescapeTag(t['display-name']) || t.login || 'Jemand';
    function param(k) { return unescapeTag(t['msg-param-' + k]); }
    switch (id) {
      case 'sub':
      case 'resub':
        var months = parseInt(param('cumulative-months'), 10) || 0;
        return who + ' hat abonniert' + (param('sub-plan') === 'Prime' ? ' (Prime)' : '') +
          (months > 1 ? ' – seit ' + months + ' Monaten' : '');
      case 'subgift':
      case 'anonsubgift':
        if (t['msg-param-community-gift-id']) return null; // one of many: the total is shown once
        return (id === 'anonsubgift' ? 'Jemand' : who) + ' schenkt ' + param('recipient-display-name') + ' ein Abo';
      case 'submysterygift':
      case 'anonsubmysterygift':
        var n = parseInt(param('mass-gift-count'), 10) || 1;
        return (id === 'anonsubmysterygift' ? 'Jemand' : who) + ' verschenkt ' + n + (n === 1 ? ' Abo' : ' Abos') + ' an den Chat';
      case 'giftpaidupgrade':
      case 'anongiftpaidupgrade':
      case 'primepaidupgrade':
        return who + ' bleibt Abonnent';
      case 'raid':
        return param('displayName') + ' raidet mit ' + TT.fmtCount(parseInt(param('viewerCount'), 10) || 0) + ' Zuschauern';
      case 'announcement':
        return 'Ankündigung von ' + who;
      case 'bitsbadgetier':
        return who + ' hat ein neues Bits-Abzeichen';
      case 'viewermilestone':
        return who + ' schaut ' + param('value') + ' Streams in Folge';
      default:
        return unescapeTag(t['system-msg']) || null;
    }
  }

  function notice(tags, text) {
    var head = noticeText(tags);
    if (!head) return;
    enqueue(function () {
      if (!list) return;
      var ev = TT.el('div', 'chat-line chat-event' + (tags['msg-id'] === 'announcement' ? ' chat-announce' : ''));
      ev.appendChild(TT.el('div', 'chat-event-h', head));
      if (text) {
        var msg = TT.el('div', 'chat-text');
        renderMessage(text, tags.emotes, msg);
        ev.appendChild(msg);
      }
      list.appendChild(ev);
      trim();
    });
  }

  function system(text) {
    if (!list) return;
    list.appendChild(TT.el('div', 'chat-line chat-system', text));
  }

  function onMessage(ev) {
    var lines = String(ev.data).split('\r\n');
    for (var i = 0; i < lines.length; i++) {
      var raw = lines[i];
      if (!raw) continue;
      if (raw.indexOf('PING') === 0) { ws.send('PONG' + raw.substring(4)); continue; }
      var tags = {};
      if (raw.charAt(0) === '@') {
        var sp = raw.indexOf(' ');
        tags = parseTags(raw.substring(1, sp));
        raw = raw.substring(sp + 1);
      }
      var m = /^:([^!\s]+)![^\s]+ PRIVMSG #[^\s]+ :(.*)$/.exec(raw);
      var n = m ? null : /^:tmi\.twitch\.tv USERNOTICE #[^\s]+(?: :(.*))?$/.exec(raw);
      if (m) enqueue(addLine.bind(null, tags, m[1], m[2]));
      else if (n) notice(tags, n[1] || '');
      else if (/ JOIN #/.test(raw) && raw.indexOf(':justinfan') === 0) system('Mit dem Chat verbunden');
      else if (raw.indexOf(' CLEARCHAT ') >= 0 || raw.indexOf(' CLEARMSG ') >= 0) { /* ignore */ }
    }
  }

  function connect() {
    if (!channel) return;
    var ch = channel;
    ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443');
    ws.onopen = function () {
      ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands');
      ws.send('PASS SCHMOOPIIE');
      ws.send('NICK justinfan' + Math.floor(10000 + Math.random() * 80000));
      ws.send('JOIN #' + ch);
    };
    ws.onmessage = onMessage;
    ws.onclose = function () {
      if (channel === ch) reconnectTimer = setTimeout(connect, 3000);
    };
  }

  // ---- VOD chat replay -----------------------------------------------------------
  // Messages are fetched about a minute ahead of the video position and shown when the
  // video reaches their timestamp. A jump of more than 15 s clears the chat and refetches.
  var replay = null; // { id, buf: [], seen: {}, until, fetching, lastT }

  var BADGE = { broadcaster: 'mod', moderator: 'mod', vip: 'vip', subscriber: 'sub', founder: 'sub' };

  function replayLine(c) {
    if (!list) return;
    var line = TT.el('div', 'chat-line');
    var shown = {};
    ((c.message && c.message.userBadges) || []).forEach(function (b) {
      var k = b && BADGE[b.setID];
      if (k && !shown[k]) { shown[k] = 1; line.appendChild(TT.el('span', 'bdg ' + k, { mod: 'M', vip: 'V', sub: 'S' }[k])); }
    });
    var who = c.commenter || {};
    var name = TT.el('span', 'chat-name', (who.displayName || who.login || '?') + ': ');
    name.style.color = (c.message && c.message.userColor) || '#b9a3e3';
    line.appendChild(name);
    var msg = TT.el('span', 'chat-text');
    ((c.message && c.message.fragments) || []).forEach(function (f) {
      if (f.emote && f.emote.emoteID) {
        var img = TT.el('img', 'emote');
        img.src = 'https://static-cdn.jtvnw.net/emoticons/v2/' + f.emote.emoteID + '/default/dark/1.0';
        img.alt = f.text;
        msg.appendChild(img);
      } else {
        appendText(msg, f.text);
      }
    });
    line.appendChild(msg);
    list.appendChild(line);
    trim();
  }

  function replayFetch(from) {
    var r = replay;
    r.fetching = true;
    TT.api.vodComments(r.id, from).then(function (items) {
      if (replay !== r) return;
      items.forEach(function (c) {
        if (r.seen[c.id]) return;
        r.seen[c.id] = 1;
        r.buf.push(c);
      });
      r.buf.sort(function (a, b) { return a.contentOffsetSeconds - b.contentOffsetSeconds; });
      var last = items.length ? items[items.length - 1].contentOffsetSeconds : from;
      r.until = Math.max(last, from + 20); // quiet stretch: move on
      r.fetching = false;
    }, function () { if (replay === r) { r.fetching = false; r.until = from + 30; } });
  }

  function applyMode() {
    var root = document.getElementById('player');
    root.className = root.className.replace(/\bchat-[\w-]+\b/g, '').trim() + ' chat-' + mode + ' chat-size-' + size;
  }

  // QR code under the chat: opens this channel's chat on the phone (to write there).
  function showQr(login) {
    TT.clear(qrBox);
    qrBox.style.display = 'none';
    if (!login || !TT.store.get('chatQr', true)) return;
    TT.qrImage('https://www.twitch.tv/popout/' + login + '/chat').then(function (img) {
      if (channel !== login) return;
      qrBox.appendChild(img);
      var t = TT.el('div', 'chat-qr-text', 'Chat am Handy');
      t.appendChild(TT.el('span', '', 'Scannen, um dort mitzulesen und zu schreiben'));
      qrBox.appendChild(t);
      qrBox.style.display = '';
    }).catch(function () { /* no QR */ });
  }

  TT.chat = {
    init: function () {
      box = document.getElementById('chat');
      list = document.getElementById('chat-list');
      qrBox = TT.el('div', '');
      qrBox.id = 'chat-qr';
      qrBox.style.display = 'none';
      box.appendChild(qrBox);
      applyMode();
    },
    // VOD: replay the chat of video `id` (owner's emotes) in step with replayTick(time).
    openReplay: function (id, login) {
      TT.chat.close();
      TT.clear(list);
      showQr(null);
      loadSevenTv(login.toLowerCase());
      replay = { id: id, buf: [], seen: {}, until: -1, fetching: false, lastT: -100 };
    },
    replayTick: function (t) {
      var r = replay;
      if (!r || mode === 'off') return;
      if (Math.abs(t - r.lastT) > 15) {
        // Started or jumped: show the last few seconds of context right away.
        TT.clear(list);
        r.buf = []; r.seen = {}; r.until = t - 10; r.fetching = false;
      }
      r.lastT = t;
      if (!r.fetching && r.until < t + 30) replayFetch(Math.max(r.until, t - 10));
      while (r.buf.length && r.buf[0].contentOffsetSeconds <= t) replayLine(r.buf.shift());
    },
    open: function (login) {
      TT.chat.close();
      channel = login.toLowerCase();
      TT.clear(list);
      loadSevenTv(channel);
      showQr(channel);
      if (mode !== 'off') connect();
    },
    // The open channel's 7TV/BTTV/FFZ emotes: [{ name, url }] (for the chat keyboard).
    channelEmotes: function () {
      var out = [];
      for (var k in stvChannel) if (stvChannel.hasOwnProperty(k)) out.push({ name: k, url: stvChannel[k] });
      return out;
    },
    sizeLabel: function () { return { s: 'Klein', m: 'Normal', l: 'Groß', xl: 'Sehr groß' }[size]; },
    cycleSize: function () {
      size = SIZES[(SIZES.indexOf(size) + 1) % SIZES.length];
      TT.store.set('chatSize', size);
      applyMode();
    },
    syncEnabled: function () { return syncOn; },
    setSync: function (on) {
      syncOn = !!on;
      TT.store.set('chatSync', syncOn);
      if (!on) { var q = queue; clearQueue(); q.forEach(function (x) { x.fn(); }); }
    },
    qrEnabled: function () { return TT.store.get('chatQr', true); },
    setQr: function (on) {
      TT.store.set('chatQr', !!on);
      showQr(on ? channel : null);
    },
    sevenTvEnabled: function () { return sevenTvOn; },
    setSevenTv: function (on) {
      sevenTvOn = !!on;
      TT.store.set('sevenTv', sevenTvOn);
      if (!on) { stvChannel = {}; stvGlobal = null; }
    },
    close: function () {
      clearTimeout(reconnectTimer);
      clearQueue();
      replay = null;
      var old = ws;
      channel = null;
      ws = null;
      if (old) { old.onclose = null; try { old.close(); } catch (e) { /* ignore */ } }
    },
    // Off -> Side -> Overlay. Returns the new mode's label.
    cycle: function () {
      mode = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
      TT.store.set('chatMode', mode);
      applyMode();
      var ch = channel;
      if (mode === 'off') { TT.chat.close(); channel = ch; }
      else if (!ws && ch) connect();
      return TT.chat.label();
    },
    label: function () {
      return { off: 'Aus', side: 'Seite', overlay: 'Überlagert' }[mode];
    }
  };
})();

/* ---- fmp4ts.js ---- */
;// Repackages Twitch fMP4 segments (Enhanced Broadcasting) as MPEG-TS.
//
// Older Tizen TVs (Tizen 3.0) can't play these fMP4 segments: audio and video are muxed in
// one track pair with 1 MHz, 64-bit video timestamps, and both MSE and the TV's own player
// fail with a decode error. Classic Twitch TS streams play fine, so we rewrite each fMP4
// segment into TS (same H.264/AAC data, new container) and hls.js handles it like any TS
// stream: separate audio/video buffers, 90 kHz timestamps.
(function (root) {
  function u32(d, p) { return ((d[p] << 24) >>> 0) + (d[p + 1] << 16) + (d[p + 2] << 8) + d[p + 3]; }
  function u64(d, p) { return u32(d, p) * 4294967296 + u32(d, p + 4); }
  function s32(d, p) { return (d[p] << 24) | (d[p + 1] << 16) | (d[p + 2] << 8) | d[p + 3]; }
  function type(d, p) { return String.fromCharCode(d[p], d[p + 1], d[p + 2], d[p + 3]); }

  // Calls fn(type, start, bodyStart, end) for each box in [off, end).
  function eachBox(d, off, end, fn) {
    while (off + 8 <= end) {
      var size = u32(d, off), hdr = 8;
      if (size === 1) { size = u64(d, off + 8); hdr = 16; } else if (size === 0) { size = end - off; }
      if (size < hdr || off + size > end) return;
      fn(type(d, off + 4), off, off + hdr, off + size);
      off += size;
    }
  }

  function child(d, start, end, name) {
    var found = null;
    eachBox(d, start, end, function (t, s, b, e) { if (!found && t === name) found = { start: s, body: b, end: e }; });
    return found;
  }

  function isFmp4(d) {
    var hit = false;
    eachBox(d, 0, Math.min(d.length, 1 << 20), function (t) { if (t === 'moof' || t === 'moov') hit = true; });
    return hit;
  }

  // ---- init segment ---------------------------------------------------------------
  function parseInit(d) {
    var tracks = {};
    var moov = child(d, 0, d.length, 'moov');
    if (!moov) return null;
    eachBox(d, moov.body, moov.end, function (t, s, b, e) {
      if (t === 'mvex') {
        eachBox(d, b, e, function (t2, s2, b2) {
          if (t2 !== 'trex') return;
          var id = u32(d, b2 + 4);
          tracks[id] = tracks[id] || {};
          tracks[id].defDur = u32(d, b2 + 12);
          tracks[id].defSize = u32(d, b2 + 16);
          tracks[id].defFlags = u32(d, b2 + 20);
        });
        return;
      }
      if (t !== 'trak') return;
      var tkhd = child(d, b, e, 'tkhd');
      var id = u32(d, tkhd.body + (d[tkhd.body] === 1 ? 20 : 12));
      var tr = tracks[id] = tracks[id] || {};
      var mdia = child(d, b, e, 'mdia');
      var mdhd = child(d, mdia.body, mdia.end, 'mdhd');
      tr.timescale = u32(d, mdhd.body + (d[mdhd.body] === 1 ? 20 : 12));
      var hdlr = child(d, mdia.body, mdia.end, 'hdlr');
      var handler = type(d, hdlr.body + 8);
      var minf = child(d, mdia.body, mdia.end, 'minf');
      var stbl = child(d, minf.body, minf.end, 'stbl');
      var stsd = child(d, stbl.body, stbl.end, 'stsd');
      eachBox(d, stsd.body + 8, stsd.end, function (et, es, eb, ee) {
        if (handler === 'vide' && (et === 'avc1' || et === 'avc3')) {
          var avcC = child(d, eb + 78, ee, 'avcC');
          if (!avcC) return;
          var p = avcC.body;
          tr.kind = 'video';
          tr.nalLen = (d[p + 4] & 3) + 1;
          tr.sps = []; tr.pps = [];
          var n = d[p + 5] & 31, q = p + 6, i, len;
          for (i = 0; i < n; i++) { len = (d[q] << 8) | d[q + 1]; tr.sps.push(d.subarray(q + 2, q + 2 + len)); q += 2 + len; }
          n = d[q]; q++;
          for (i = 0; i < n; i++) { len = (d[q] << 8) | d[q + 1]; tr.pps.push(d.subarray(q + 2, q + 2 + len)); q += 2 + len; }
        } else if (handler === 'soun' && et === 'mp4a') {
          var esds = child(d, eb + 28, ee, 'esds');
          if (!esds) return;
          var asc = findAsc(d, esds.body + 4, esds.end);
          if (!asc) return;
          tr.kind = 'audio';
          tr.aot = asc[0] >> 3;
          tr.freqIdx = ((asc[0] & 7) << 1) | (asc[1] >> 7);
          tr.channels = (asc[1] >> 3) & 15;
        }
      });
    });
    return tracks;
  }

  // Walks the esds descriptors to the DecoderSpecificInfo (AudioSpecificConfig).
  function findAsc(d, p, end) {
    function readLen() { var len = 0, b; do { b = d[p++]; len = (len << 7) | (b & 0x7f); } while (b & 0x80 && p < end); return len; }
    while (p < end) {
      var tag = d[p++], len = readLen();
      if (tag === 0x03) { var flags = d[p + 2]; p += 3; if (flags & 0x80) p += 2; if (flags & 0x40) p += 1 + d[p]; if (flags & 0x20) p += 2; continue; }
      if (tag === 0x04) { p += 13; continue; }
      if (tag === 0x05) return d.subarray(p, p + len);
      p += len;
    }
    return null;
  }

  // ---- media segment --------------------------------------------------------------
  // Returns [{ id, samples: [{ dts, cts, data, flags }] }] in decode order per track.
  function parseSegment(d, tracks) {
    var out = {};
    eachBox(d, 0, d.length, function (t, moofStart, b, e) {
      if (t !== 'moof') return;
      eachBox(d, b, e, function (t2, s2, tb, te) {
        if (t2 !== 'traf') return;
        var tfhd = child(d, tb, te, 'tfhd');
        var tf = u32(d, tfhd.body) & 0xffffff;
        var id = u32(d, tfhd.body + 4), p = tfhd.body + 8;
        var tr = tracks[id];
        if (!tr) return;
        var base = moofStart, defDur = tr.defDur, defSize = tr.defSize, defFlags = tr.defFlags;
        if (tf & 0x1) { base = u64(d, p); p += 8; }
        if (tf & 0x2) p += 4;
        if (tf & 0x8) { defDur = u32(d, p); p += 4; }
        if (tf & 0x10) { defSize = u32(d, p); p += 4; }
        if (tf & 0x20) { defFlags = u32(d, p); p += 4; }
        var tfdt = child(d, tb, te, 'tfdt');
        var dts = tfdt ? (d[tfdt.body] === 1 ? u64(d, tfdt.body + 4) : u32(d, tfdt.body + 4)) : 0;
        var list = out[id] = out[id] || [];
        eachBox(d, tb, te, function (t3, s3, rb) {
          if (t3 !== 'trun') return;
          var v = d[rb], f = u32(d, rb) & 0xffffff, n = u32(d, rb + 4), q = rb + 8;
          var pos = base;
          if (f & 0x1) { pos = base + s32(d, q); q += 4; }
          var firstFlags = null;
          if (f & 0x4) { firstFlags = u32(d, q); q += 4; }
          for (var i = 0; i < n; i++) {
            var dur = defDur, size = defSize, flags = (i === 0 && firstFlags !== null) ? firstFlags : defFlags, cts = 0;
            if (f & 0x100) { dur = u32(d, q); q += 4; }
            if (f & 0x200) { size = u32(d, q); q += 4; }
            if (f & 0x400) { flags = u32(d, q); q += 4; }
            if (f & 0x800) { cts = v ? s32(d, q) : u32(d, q); q += 4; }
            list.push({ dts: dts, cts: cts, data: d.subarray(pos, pos + size), flags: flags });
            dts += dur;
            pos += size;
          }
        });
      });
    });
    return out;
  }

  // ---- MPEG-TS writer ---------------------------------------------------------------
  var PMT_PID = 0x1000, VIDEO_PID = 0x100, AUDIO_PID = 0x101;
  var CRC_TABLE = (function () {
    var t = [], c, i, j;
    for (i = 0; i < 256; i++) {
      c = i << 24;
      for (j = 0; j < 8; j++) c = (c & 0x80000000) ? ((c << 1) ^ 0x04c11db7) : (c << 1);
      t.push(c >>> 0);
    }
    return t;
  })();
  function crc32(bytes) {
    var c = 0xffffffff;
    for (var i = 0; i < bytes.length; i++) c = ((c << 8) ^ CRC_TABLE[((c >>> 24) ^ bytes[i]) & 0xff]) >>> 0;
    return c;
  }
  function section(bytes) {
    var c = crc32(bytes);
    return [0].concat(bytes, [(c >>> 24) & 0xff, (c >>> 16) & 0xff, (c >>> 8) & 0xff, c & 0xff]);
  }
  var PAT = section([0x00, 0xb0, 0x0d, 0x00, 0x01, 0xc1, 0x00, 0x00, 0x00, 0x01, 0xe0 | (PMT_PID >> 8), PMT_PID & 0xff]);
  function pmt(hasVideo, hasAudio) {
    var streams = [];
    if (hasVideo) streams = streams.concat([0x1b, 0xe0 | (VIDEO_PID >> 8), VIDEO_PID & 0xff, 0xf0, 0x00]);
    if (hasAudio) streams = streams.concat([0x0f, 0xe0 | (AUDIO_PID >> 8), AUDIO_PID & 0xff, 0xf0, 0x00]);
    var pcrPid = hasVideo ? VIDEO_PID : AUDIO_PID;
    var body = [0x00, 0x01, 0xc1, 0x00, 0x00, 0xe0 | (pcrPid >> 8), pcrPid & 0xff, 0xf0, 0x00].concat(streams);
    var len = body.length + 4;
    return section([0x02, 0xb0 | (len >> 8), len & 0xff].concat(body));
  }

  // 33-bit timestamp field (PTS/DTS) with a 4-bit prefix.
  function writeTs(buf, p, prefix, ts) {
    buf[p] = (prefix << 4) | ((Math.floor(ts / 1073741824) & 0x07) << 1) | 1;
    buf[p + 1] = Math.floor(ts / 4194304) & 0xff;
    buf[p + 2] = ((Math.floor(ts / 32768) & 0x7f) << 1) | 1;
    buf[p + 3] = Math.floor(ts / 128) & 0xff;
    buf[p + 4] = ((ts % 128) << 1) | 1;
  }

  function Writer(cc) {
    this.chunks = [];
    this.cc = cc; // continuity counters per PID, kept across segments
  }

  // Splits one payload into 188-byte packets on `pid`. opts: { pcr, rai }
  Writer.prototype.packets = function (pid, payload, opts) {
    var off = 0, first = true;
    while (off < payload.length || first) {
      var pkt = new Uint8Array(188);
      var afLen = 0; // adaptation field bytes including its length byte
      var withPcr = first && opts && opts.pcr !== undefined;
      if (withPcr) afLen = 8;
      var room = 184 - afLen;
      var chunk = Math.min(room, payload.length - off);
      var stuff = room - chunk;
      afLen += stuff; // a 1-byte adaptation field is just its (zero) length byte
      var cc = this.cc[pid] = ((this.cc[pid] === undefined ? -1 : this.cc[pid]) + 1) & 15;
      pkt[0] = 0x47;
      pkt[1] = (first ? 0x40 : 0) | ((pid >> 8) & 0x1f);
      pkt[2] = pid & 0xff;
      pkt[3] = (afLen ? 0x30 : 0x10) | cc;
      var p = 4;
      if (afLen) {
        pkt[p] = afLen - 1;
        if (afLen > 1) {
          pkt[p + 1] = (withPcr ? 0x10 : 0) | (first && opts && opts.rai ? 0x40 : 0);
          var q = p + 2;
          if (withPcr) {
            var base = opts.pcr;
            pkt[q] = Math.floor(base / 33554432) & 0xff;
            pkt[q + 1] = Math.floor(base / 131072) & 0xff;
            pkt[q + 2] = Math.floor(base / 512) & 0xff;
            pkt[q + 3] = Math.floor(base / 2) & 0xff;
            pkt[q + 4] = ((base % 2) << 7) | 0x7e;
            pkt[q + 5] = 0;
            q += 6;
          }
          while (q < p + afLen) pkt[q++] = 0xff;
        }
        p += afLen;
      }
      pkt.set(payload.subarray(off, off + chunk), p);
      off += chunk;
      first = false;
      this.chunks.push(pkt);
    }
  };

  Writer.prototype.psi = function (pid, bytes) {
    var payload = new Uint8Array(184);
    for (var i = 0; i < 184; i++) payload[i] = i < bytes.length ? bytes[i] : 0xff;
    this.packets(pid, payload);
  };

  Writer.prototype.pes = function (pid, streamId, pts, dts, data, opts) {
    var hasDts = dts !== null && dts !== pts;
    var hdrLen = hasDts ? 10 : 5;
    var total = 9 + hdrLen + data.length;
    var pes = new Uint8Array(total);
    var pesLen = total - 6;
    pes[0] = 0; pes[1] = 0; pes[2] = 1; pes[3] = streamId;
    if (pesLen > 0xffff || streamId === 0xe0) pesLen = 0;
    pes[4] = pesLen >> 8; pes[5] = pesLen & 0xff;
    pes[6] = 0x80; pes[7] = hasDts ? 0xc0 : 0x80; pes[8] = hdrLen;
    writeTs(pes, 9, hasDts ? 3 : 2, pts);
    if (hasDts) writeTs(pes, 14, 1, dts);
    pes.set(data, 9 + hdrLen);
    this.packets(pid, pes, opts);
  };

  Writer.prototype.result = function () {
    var out = new Uint8Array(this.chunks.length * 188);
    for (var i = 0; i < this.chunks.length; i++) out.set(this.chunks[i], i * 188);
    return out;
  };

  var MAX_TS = 8589934592; // 2^33
  function to90k(t, timescale) { return Math.round(t * 90000 / timescale) % MAX_TS; }

  // AVCC sample -> Annex B access unit (AUD, SPS/PPS before keyframes).
  function annexB(sample, tr) {
    var d = sample.data, nals = [], p = 0, key = false, size = 6, i;
    while (p + tr.nalLen <= d.length) {
      var len = 0;
      for (i = 0; i < tr.nalLen; i++) len = len * 256 + d[p + i];
      p += tr.nalLen;
      var nal = d.subarray(p, p + len);
      p += len;
      var nt = nal[0] & 31;
      if (nt === 9) continue; // our own AUD goes first
      if (nt === 5) key = true;
      nals.push(nal);
    }
    if (key) nals = tr.sps.concat(tr.pps, nals);
    for (i = 0; i < nals.length; i++) size += 4 + nals[i].length;
    var out = new Uint8Array(size);
    out.set([0, 0, 0, 1, 0x09, 0xf0], 0);
    var q = 6;
    for (i = 0; i < nals.length; i++) {
      out.set([0, 0, 0, 1], q);
      out.set(nals[i], q + 4);
      q += 4 + nals[i].length;
    }
    return { data: out, key: key };
  }

  function adts(raw, tr) {
    var len = raw.length + 7;
    var out = new Uint8Array(len);
    out[0] = 0xff; out[1] = 0xf1;
    out[2] = (((tr.aot - 1) & 3) << 6) | (tr.freqIdx << 2) | (tr.channels >> 2);
    out[3] = ((tr.channels & 3) << 6) | (len >> 11);
    out[4] = (len >> 3) & 0xff;
    out[5] = ((len & 7) << 5) | 0x1f;
    out[6] = 0xfc;
    out.set(raw, 7);
    return out;
  }

  function Converter() {
    this.cc = {};
    this.converted = 0;
  }

  // init, seg: Uint8Array. Returns a Uint8Array of MPEG-TS packets.
  Converter.prototype.convert = function (init, seg) {
    var tracks = parseInit(init);
    if (!tracks) throw new Error('fMP4 init segment without moov');
    var bytrack = parseSegment(seg, tracks);
    var video = null, audio = null, id;
    for (id in tracks) {
      if (!tracks.hasOwnProperty(id)) continue;
      if (tracks[id].kind === 'video') video = { tr: tracks[id], samples: bytrack[id] || [] };
      if (tracks[id].kind === 'audio') audio = { tr: tracks[id], samples: bytrack[id] || [] };
    }
    var w = new Writer(this.cc);
    w.psi(0, PAT);
    w.psi(PMT_PID, pmt(!!video, !!audio));
    // Interleave by decode time so the demuxer sees audio and video together.
    var events = [], i, s;
    if (video) {
      for (i = 0; i < video.samples.length; i++) {
        s = video.samples[i];
        events.push({ t: s.dts / video.tr.timescale, v: true, s: s });
      }
    }
    if (audio) {
      // Group a few AAC frames per PES (like Twitch's TS streams).
      var group = [];
      for (i = 0; i < audio.samples.length; i++) {
        group.push(audio.samples[i]);
        if (group.length === 4 || i === audio.samples.length - 1) {
          events.push({ t: group[0].dts / audio.tr.timescale, v: false, g: group });
          group = [];
        }
      }
    }
    events.sort(function (a, b) { return a.t - b.t; });
    for (i = 0; i < events.length; i++) {
      var ev = events[i];
      if (ev.v) {
        var tr = video.tr, au = annexB(ev.s, tr);
        var dts = to90k(ev.s.dts, tr.timescale), pts = to90k(ev.s.dts + ev.s.cts, tr.timescale);
        w.pes(VIDEO_PID, 0xe0, pts, dts, au.data, { pcr: dts, rai: au.key });
      } else {
        var atr = audio.tr, parts = [], size = 0, j;
        for (j = 0; j < ev.g.length; j++) { parts.push(adts(ev.g[j].data, atr)); size += parts[j].length; }
        var buf = new Uint8Array(size), q = 0;
        for (j = 0; j < parts.length; j++) { buf.set(parts[j], q); q += parts[j].length; }
        w.pes(AUDIO_PID, 0xc0, to90k(ev.g[0].dts, atr.timescale), null, buf);
      }
    }
    this.converted++;
    return w.result();
  };

  // hls.js fragment loader that converts fMP4 segments to TS. mapFor(url) returns the
  // segment's init-segment URL (from #EXT-X-MAP, which the playlist rewrite removes).
  function makeFragLoader(Hls, mapFor, conv, onError) {
    var Base = Hls.DefaultConfig.loader;
    var inits = {}; // url -> Promise<Uint8Array>

    function getInit(url) {
      if (!inits[url]) {
        inits[url] = new Promise(function (resolve, reject) {
          var xhr = new XMLHttpRequest();
          xhr.open('GET', url, true);
          xhr.responseType = 'arraybuffer';
          xhr.onload = function () {
            if (xhr.status >= 200 && xhr.status < 300) resolve(new Uint8Array(xhr.response));
            else { delete inits[url]; reject(new Error('init HTTP ' + xhr.status)); }
          };
          xhr.onerror = function () { delete inits[url]; reject(new Error('init network error')); };
          xhr.send();
        });
        var keys = Object.keys(inits);
        if (keys.length > 20) delete inits[keys[0]];
      }
      return inits[url];
    }

    function Loader(config) { this.inner = new Base(config); }
    Object.defineProperty(Loader.prototype, 'stats', { get: function () { return this.inner.stats; } });
    Object.defineProperty(Loader.prototype, 'context', { get: function () { return this.inner.context; } });
    Loader.prototype.load = function (context, config, callbacks) {
      var mapUrl = mapFor(context.url);
      if (!mapUrl) return this.inner.load(context, config, callbacks);
      var initP = getInit(mapUrl);
      var cb = {};
      for (var k in callbacks) if (callbacks.hasOwnProperty(k)) cb[k] = callbacks[k];
      cb.onSuccess = function (response, stats, ctx, net) {
        var data = response.data;
        if (!(data instanceof ArrayBuffer)) return callbacks.onSuccess(response, stats, ctx, net);
        initP.then(function (init) {
          var seg = new Uint8Array(data);
          if (isFmp4(seg)) response.data = conv.convert(init, seg).buffer;
          callbacks.onSuccess(response, stats, ctx, net);
        }).catch(function (e) {
          if (onError) onError(e);
          callbacks.onSuccess(response, stats, ctx, net); // let hls.js try the original data
        });
      };
      this.inner.load(context, config, cb);
    };
    Loader.prototype.abort = function () { this.inner.abort(); };
    Loader.prototype.destroy = function () { this.inner.destroy(); };
    return Loader;
  }

  var exportsObj = { Converter: Converter, parseInit: parseInit, parseSegment: parseSegment, isFmp4: isFmp4, makeFragLoader: makeFragLoader };
  if (typeof module !== 'undefined' && module.exports) module.exports = exportsObj;
  root.TT = root.TT || {};
  root.TT.fmp4ts = exportsObj;
})(typeof window !== 'undefined' ? window : this);

/* ---- player.js ---- */
;// Player: hls.js + playlist loader (ad blocking for live, proxied segments for VODs) + OSD.
(function () {
  var video = null, hls = null, ctrl = null, session = 0;
  var current = null;        // { stream } live, { vod, owner } video, { vod, owner, clip, clips } clip
  var playlist = [];         // live streams for channel up/down
  var index = 0;
  var retries = 0, osdTimer = null, pausedAt = 0, saveTimer = null, startedAt = 0;

  function $(id) { return document.getElementById(id); }

  // Master playlists the app already has (usher's answer, or one written for the CDN fallback).
  var knownPlaylists = {};

  function fetchText(url) {
    if (knownPlaylists.hasOwnProperty(url)) return Promise.resolve(knownPlaylists[url]);
    return TT.http('GET', url, { proxy: true }).then(function (r) { return r.text; });
  }

  function proxied(url) {
    return TT.PROXY + '/fetch?url=' + encodeURIComponent(url);
  }

  function absolute(uri, base) {
    if (/^https?:\/\//i.test(uri)) return uri;
    if (uri.charAt(0) === '/') return base.replace(/^(https?:\/\/[^\/]+).*$/i, '$1') + uri;
    return base.substring(0, base.lastIndexOf('/') + 1) + uri;
  }

  // Twitch's VOD CDN only allows twitch.tv origins, so VOD segments go through the service.
  // fMP4 VODs: the #EXT-X-MAP init segment is dropped from the playlist and remembered per
  // segment, so the fragment loader can repackage each segment as TS (see fmp4ts.js).
  var vodMaps = {};
  function rewriteVodMedia(url, text) {
    var map = null;
    return text.split(/\r?\n/).map(function (line) {
      var l = line.trim();
      if (l.indexOf('#EXT-X-MAP:') === 0) {
        var m = /URI="([^"]*)"/.exec(l);
        map = m ? proxied(absolute(m[1], url)) : null;
        return null;
      }
      if (!l || l.charAt(0) === '#') return line;
      var seg = proxied(absolute(l, url));
      if (map) vodMaps[seg] = map;
      return seg;
    }).filter(function (line) { return line !== null; }).join('\n');
  }

  function newStats() {
    var t = performance.now();
    return {
      aborted: false, loaded: 0, retry: 0, total: 0, chunkCount: 0, bwEstimate: 0,
      loading: { start: t, first: 0, end: 0 },
      parsing: { start: 0, end: 0 },
      buffering: { start: 0, first: 0, end: 0 }
    };
  }

  // hls.js playlist loader: fetches playlists via the service proxy, then either runs them
  // through the AdController (live) or proxies their segments (VOD).
  function makePlaylistLoader(adCtrl) {
    function Loader(config) {
      this.config = config;
      this.context = null;
      this.stats = newStats();
      this.aborted = false;
    }
    Loader.prototype.load = function (context, config, callbacks) {
      var self = this;
      self.context = context;
      self.stats = newStats();
      var url = context.url;
      fetchText(url).then(function (text) {
        if (self.aborted) return null;
        var now = performance.now();
        self.stats.loading.first = self.stats.loading.end = now;
        self.stats.loaded = self.stats.total = text.length;
        var isMaster = text.indexOf('#EXT-X-STREAM-INF') >= 0;
        if (!adCtrl) return isMaster ? TT.adblock.cleanMaster(text) : rewriteVodMedia(url, text);
        if (isMaster) return adCtrl.processMaster(url, text);
        return adCtrl.processMedia(url, text);
      }).then(function (out) {
        if (self.aborted || out === null) return;
        callbacks.onSuccess({ url: url, data: out }, self.stats, context, null);
      }).catch(function (err) {
        if (self.aborted) return;
        // The body carries Twitch's reason (geo block, subscribers only), see blockedReason().
        callbacks.onError({ code: err.status || 0, text: err.response ? err.response.text : String(err.message || err) },
          context, null, self.stats);
      });
    };
    Loader.prototype.abort = function () { this.aborted = true; this.stats.aborted = true; };
    Loader.prototype.destroy = function () { this.abort(); };
    return Loader;
  }

  function fmtTime(s) {
    s = Math.max(0, Math.floor(s || 0));
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return (h ? h + ':' + (m < 10 ? '0' : '') : '') + m + ':' + (sec < 10 ? '0' : '') + sec;
  }

  function vodDuration() {
    return video.duration || (current && current.vod && current.vod.lengthSeconds) || 0;
  }

  function updateProgress() {
    if (!current || !current.vod) return;
    if (!current.clip) TT.chat.replayTick(video.currentTime);
    var dur = vodDuration();
    var pos = scrub.active ? scrub.target : video.currentTime;
    $('osd-bar').style.width = (dur ? Math.min(100, pos / dur * 100) : 0) + '%';
    updateSeekPreview(pos, dur);
    $('osd-time').textContent = (scrub.active ? (scrub.dir < 0 ? '◀◀ ' : '▶▶ ') : '') +
      fmtTime(pos) + ' / ' + fmtTime(dur) + (scrub.active ? '   (' + stepLabel(scrub.step) + '-Schritte)' : '');
  }

  // ---- VOD extras: chapters, seek previews, hype moments ------------------------------
  var extras = { chapters: [], seek: null, hype: [] };

  function renderMarks() {
    var box = $('osd-marks'), dur = vodDuration();
    TT.clear(box);
    if (!dur) return;
    extras.chapters.forEach(function (c, i) {
      if (i === 0) return;
      var m = TT.el('i', 'mark chapter');
      m.style.left = (c.start / dur * 100) + '%';
      box.appendChild(m);
    });
    extras.hype.forEach(function (t) {
      var m = TT.el('i', 'mark hype');
      m.style.left = (t / dur * 100) + '%';
      box.appendChild(m);
    });
  }

  // Storyboard JSON: [{ width, height, cols, rows, count, interval, images, quality }].
  function loadStoryboard(url, my) {
    fetchText(url).then(function (text) {
      if (my !== session) return;
      var boards = JSON.parse(text);
      var b = boards.filter(function (x) { return x.quality === 'high'; })[0] || boards[0];
      if (!b || !b.images || !b.images.length) return;
      extras.seek = { b: b, base: url.substring(0, url.lastIndexOf('/') + 1) };
    }).catch(function () { /* no previews */ });
  }

  function updateSeekPreview(pos, dur) {
    var el = $('seek-preview');
    var sk = extras.seek;
    if (!scrub.active || !sk || !dur) { el.style.display = 'none'; return; }
    var b = sk.b, per = b.cols * b.rows;
    var n = Math.min(b.count - 1, Math.floor(pos / (b.interval || (dur / b.count))));
    var sheet = b.images[Math.floor(n / per)];
    if (!sheet) { el.style.display = 'none'; return; }
    var k = n % per;
    el.style.width = b.width + 'px';
    el.style.height = b.height + 'px';
    el.style.backgroundImage = 'url("' + proxied(sk.base + sheet) + '")';
    el.style.backgroundPosition = (-(k % b.cols) * b.width) + 'px ' + (-Math.floor(k / b.cols) * b.height) + 'px';
    // Keep the whole picture over the bar, also at its very start and end.
    var w = el.parentNode.clientWidth, x = Math.max(0, Math.min(1, pos / dur)) * w;
    el.style.left = Math.max(b.width / 2, Math.min(w - b.width / 2, x)) + 'px';
    el.style.display = 'block';
  }

  // Hype moments: sample the VOD chat every few minutes, measure messages per second and
  // keep the strongest peaks (at least 10 min apart). Cached per video.
  function loadHype(vod, my) {
    var cache = TT.store.get('hype', {}) || {};
    if (cache[vod.id] && vod.status !== 'RECORDING') { extras.hype = cache[vod.id]; renderMarks(); return; }
    var len = vod.lengthSeconds || 0;
    if (len < 900) return;
    var step = Math.max(90, Math.round(len / 150)), samples = [], t = 30;
    (function next() {
      if (my !== session) return;
      if (t >= len) return finish();
      TT.api.vodComments(vod.id, t).then(function (items) {
        if (items.length > 1) {
          var span = items[items.length - 1].contentOffsetSeconds - items[0].contentOffsetSeconds;
          samples.push({ t: items[0].contentOffsetSeconds, rate: items.length / Math.max(5, span) });
        }
      }).catch(function () {}).then(function () { t += step; setTimeout(next, 250); });
    })();
    function finish() {
      if (samples.length < 5) return;
      var rates = samples.map(function (x) { return x.rate; }).sort(function (a, b) { return a - b; });
      var median = rates[Math.floor(rates.length / 2)];
      var picks = [];
      samples.slice().sort(function (a, b) { return b.rate - a.rate; }).forEach(function (x) {
        if (picks.length >= 6 || x.rate < median * 2) return;
        if (picks.some(function (y) { return Math.abs(y - x.t) < 600; })) return;
        picks.push(x.t);
      });
      picks = picks.map(function (x) { return Math.max(0, x - 20); }).sort(function (a, b) { return a - b; });
      extras.hype = picks;
      if (vod.status !== 'RECORDING') {
        var keys = Object.keys(cache);
        if (keys.length > 30) delete cache[keys[0]];
        cache[vod.id] = picks;
        TT.store.set('hype', cache);
      }
      renderMarks();
      if (picks.length) TT.toast(picks.length + ' Hype-Momente gefunden', 4000);
      if (osdVisible) renderControls();
    }
  }

  function currentChapter() {
    var t = video.currentTime, cur = null;
    extras.chapters.forEach(function (c) { if (c.start <= t + 1) cur = c; });
    return cur;
  }

  function nextChapter() {
    var t = video.currentTime;
    var n = extras.chapters.filter(function (c) { return c.start > t + 5; })[0] || extras.chapters[0];
    if (n) { video.currentTime = n.start; TT.toast('Kapitel: ' + n.name); }
  }

  function nextHype() {
    var t = video.currentTime;
    var n = extras.hype.filter(function (x) { return x > t + 5; })[0];
    if (n === undefined) n = extras.hype[0];
    if (n !== undefined) {
      video.currentTime = n;
      TT.toast('Hype-Moment ' + (extras.hype.indexOf(n) + 1) + ' von ' + extras.hype.length);
    }
  }

  function loadExtras(vod, my) {
    extras = { chapters: [], seek: null, hype: [] };
    renderMarks();
    TT.api.vodInfo(vod.id).then(function (info) {
      if (my !== session) return;
      extras.chapters = info.chapters;
      renderMarks();
      if (info.seek) loadStoryboard(info.seek, my);
      if (osdVisible) renderControls();
    }).catch(function () {});
    setTimeout(function () { if (my === session) loadHype(vod, my); }, 3000);
  }

  // ---- live: watch from the start / the recording after the stream ----------------------
  function watchFromStart() {
    var b = current && current.stream && current.stream.broadcaster;
    if (!b) return;
    TT.api.latestVod(b.login).then(function (r) {
      if (!r || r.vod.status !== 'RECORDING') { TT.toast('Für diesen Stream gibt es keine Aufzeichnung'); return; }
      TT.player.openVod(r.vod, r.owner, { fromStart: true });
    }).catch(function () { TT.toast('Die Aufzeichnung konnte nicht geladen werden'); });
  }

  function offerRecording() {
    var b = current && current.stream && current.stream.broadcaster, my = session;
    if (!b) return;
    TT.api.latestVod(b.login).then(function (r) {
      if (my !== session || !r || raidTarget) return;
      current.ended = r;
      setStatus('Der Stream ist beendet');
      btnIndex = 0;
      row = 'buttons';
      showOsd(60000);
    }).catch(function () {});
  }

  // ---- clips ----------------------------------------------------------------------------
  function playClip(my) {
    setStatus('Clip wird geladen …');
    ctrl = null;
    return TT.api.clipSource(current.clip.slug).then(function (src) {
      if (my !== session) return;
      current.clipQualities = src.qualities || [];
      current.clipSrc = (speed > 1 && clipUrlForSpeed()) || src.url;
      video.src = current.clipSrc;
      current.clipUrl = src.soundUrl || src.url;
      video.playbackRate = speed;
      var pr = video.play();
      if (pr && pr.catch) pr.catch(function () { /* user presses play */ });
      soundUpdate();
    });
  }

  function switchClip(delta) {
    var list = current.clips || [];
    var i = list.indexOf(current.clip) + delta;
    if (i < 0 || i >= list.length) { TT.toast(delta > 0 ? 'Das war der letzte Clip' : 'Das ist der erste Clip'); return; }
    TT.player.openClip(list[i], list);
  }

  // ---- playback speed (videos and clips) -------------------------------------------------
  var speed = 1, SPEEDS = [1, 1.25, 1.5, 2];
  function fmtSpeed(x) { return String(x).replace('.', ',') + '×'; }
  function cycleSpeed() {
    speed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    video.playbackRate = speed;
    TT.toast('Tempo: ' + fmtSpeed(speed));
    if (current && current.clip) switchClipQuality();
    else applyCap(true);
    soundUpdate();
  }

  // The clip version for the current speed (see speedAllows).
  function clipUrlForSpeed() {
    var qs = (current.clipQualities || []).slice().sort(function (a, b) { return b.height - a.height || b.fps - a.fps; });
    var fit = qs.filter(function (q) { return q.height <= 1080 && speedAllows(q.height, q.fps); })[0];
    return (fit || qs[qs.length - 1] || {}).url || null;
  }

  function switchClipQuality() {
    var url = clipUrlForSpeed();
    if (!url || url === current.clipSrc) return;
    var t = video.currentTime, paused = video.paused;
    current.clipSrc = url;
    video.src = url;
    video.addEventListener('loadedmetadata', function once() {
      video.removeEventListener('loadedmetadata', once);
      video.currentTime = t;
      video.playbackRate = speed;
      if (!paused) { var pr = video.play(); if (pr && pr.catch) pr.catch(function () { /* user presses play */ }); }
    });
  }

  // ---- INFO: playback statistics ------------------------------------------------------------
  var statsTimer = null, lastConv = null;
  function renderStats() {
    var el = $('stats'), lines = [];
    function line(k, v) { lines.push(k + ': ' + v); }
    line('Bild', video.videoWidth ? video.videoWidth + '×' + video.videoHeight : '–');
    if (hls && hls.levels && hls.levels.length) {
      var l = hls.levels[hls.currentLevel >= 0 ? hls.currentLevel : hls.loadLevel];
      line('Qualität', qualityLabel() + (l && l.bitrate ? ' · ' + (l.bitrate / 1e6).toFixed(1).replace('.', ',') + ' Mbit/s' : ''));
      if (hls.bandwidthEstimate) line('Leitung', (hls.bandwidthEstimate / 1e6).toFixed(1).replace('.', ',') + ' Mbit/s');
      if (current && current.stream && hls.latency) line('Verzögerung', hls.latency.toFixed(1).replace('.', ',') + ' s');
    }
    var b = video.buffered, ahead = 0;
    for (var i = 0; i < b.length; i++) if (b.start(i) <= video.currentTime + 0.5 && b.end(i) > video.currentTime) ahead = b.end(i) - video.currentTime;
    line('Puffer', ahead.toFixed(1).replace('.', ',') + ' s');
    var q = video.getVideoPlaybackQuality ? video.getVideoPlaybackQuality() : null;
    var dropped = q ? q.droppedVideoFrames : video.webkitDroppedFrameCount;
    if (dropped !== undefined) line('Ausgelassene Bilder', dropped);
    if (lastConv && lastConv.converted) line('Format', 'fMP4 → TS (' + lastConv.converted + ' Stücke umgepackt)');
    if (snd) {
      var ahead = snd.anchored && sndCtx ? Math.max(0, snd.schedEnd - sndCtx.currentTime) : 0;
      line('Ton', 'von der App' + (snd.anchored ? ', ' + ahead.toFixed(1).replace('.', ',') + ' s vorbereitet' : ', wird vorbereitet'));
    }
    if (ctrl) line('Werbeblocker', ctrl.adActive ? 'blockt gerade' : 'aktiv' + (ctrl.blockedCount ? ' · ' + ctrl.blockedCount + '× geblockt' : ''));
    if (speed !== 1) line('Tempo', fmtSpeed(speed));
    el.textContent = lines.join('\n');
  }
  // ---- own sound path: tempo with sound, compressor ----------------------------------------
  // The TV's video chip mutes the sound at any speed other than 1x, and Web Audio gets no samples
  // from it. So for another speed or the compressor the video is muted and the app plays the
  // sound itself: hls.js hands the audio over as its own fMP4 track; its AAC frames are collected,
  // decoded with Web Audio in chunks of a few seconds, stretched to the speed at the same pitch
  // and scheduled in step with the picture. Clips (plain MP4) are decoded once as a whole.
  var aud = { init: null, lcInit: null, scale: 0, track: 1, frames: [] };
  var snd = null, sndCtx = null, sndBus = null, sndComp = null, sndGain = null, sndFailed = false;
  var SND_AHEAD = 2.5;

  function readU32(b, o) { return b[o] * 16777216 + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3]; }
  function writeU32(b, o, v) { b[o] = (v >>> 24) & 255; b[o + 1] = (v >>> 16) & 255; b[o + 2] = (v >>> 8) & 255; b[o + 3] = v & 255; }
  function boxType(b, o) { return String.fromCharCode(b[o + 4], b[o + 5], b[o + 6], b[o + 7]); }

  function sameBytes(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  // Offsets of the boxes along `names` (each inside the previous one), or null.
  function boxPath(b, names) {
    var skip = { stsd: 8, mp4a: 28 }, path = [], off = 0, end = b.length;
    for (var level = 0; level < names.length; level++) {
      var found = -1;
      while (off + 8 <= end) {
        var size = readU32(b, off);
        if (size < 8 || off + size > end) return null;
        if (boxType(b, off) === names[level]) { found = off; break; }
        off += size;
      }
      if (found < 0) return null;
      path.push(found);
      end = found + readU32(b, found);
      off = found + 8 + (skip[names[level]] || 0);
    }
    return path;
  }

  // hls.js labels Twitch's AAC-LC as HE-AAC (object type 5, "SBR") on Chrome-like browsers. The
  // video chip ignores that, but Web Audio's decoder then applies SBR and the voice comes out
  // distorted and low. Returns a copy of the audio init segment with a plain LC config.
  function initAsLc(init) {
    var path = boxPath(init, ['moov', 'trak', 'mdia', 'minf', 'stbl', 'stsd', 'mp4a', 'esds']);
    if (!path) return null;
    // esds: full box header, then 03 len ES_ID flags | 04 len (13 bytes) | 05 len config
    var e = path[path.length - 1] + 12;
    if (init[e] !== 3 || init[e + 1] > 127 || init[e + 5] !== 4 || init[e + 6] > 127 || init[e + 20] !== 5 || init[e + 21] !== 4) return null;
    var c0 = init[e + 22], c1 = init[e + 23];
    if (c0 >> 3 === 2) return init;
    if (c0 >> 3 !== 5) return null;
    var si = ((c0 & 7) << 1) | (c1 >> 7), ch = (c1 >> 3) & 15;
    var out = new Uint8Array(init.length - 2);
    out.set(init.subarray(0, e + 22));
    out[e + 22] = (2 << 3) | (si >> 1);
    out[e + 23] = ((si & 1) << 7) | (ch << 3);
    out.set(init.subarray(e + 26), e + 24);
    out[e + 1] -= 2;
    out[e + 6] -= 2;
    out[e + 21] = 2;
    for (var j = 0; j < path.length; j++) writeU32(out, path[j], readU32(init, path[j]) - 2);
    return out;
  }

  function captureAudio(h) {
    var cap = aud = { init: null, lcInit: null, scale: 0, track: 1, frames: [] };
    h.on(Hls.Events.FRAG_PARSING_INIT_SEGMENT, function (e, d) {
      var init = d.tracks && d.tracks.audio && d.tracks.audio.initSegment;
      // hls.js sends a fresh copy on every quality switch; only a real change counts.
      if (!init || sameBytes(init, cap.init)) return;
      var mdhd = boxPath(init, ['moov', 'trak', 'mdia', 'mdhd']), trex = boxPath(init, ['moov', 'mvex', 'trex']);
      cap.init = init;
      cap.lcInit = initAsLc(init);
      cap.frames = [];
      if (mdhd) {
        var m = mdhd[mdhd.length - 1];
        cap.scale = readU32(init, m + 8 + (init[m + 8] === 1 ? 20 : 12));
      }
      if (trex) cap.track = readU32(init, trex[trex.length - 1] + 12);
    });
    h.on(Hls.Events.BUFFER_APPENDING, function (e, d) {
      if (d.type === 'audio' && cap.lcInit && cap.scale) addFrames(cap, d.data);
    });
  }

  // Splits hls.js's moof/mdat into AAC frames with their media times (seconds, same as video.currentTime).
  function addFrames(cap, b) {
    var off = 0, list = [];
    while (off + 8 <= b.length) {
      var size = readU32(b, off);
      if (size < 8 || off + size > b.length) break;
      if (boxType(b, off) === 'moof') {
        var traf = boxPath(b.subarray(off, off + size), ['moof', 'traf']);
        if (traf) parseTraf(cap, b, off, off + traf[1], list);
      }
      off += size;
    }
    if (!list.length) return;
    var fr = cap.frames, last = fr[fr.length - 1];
    if (!last || list[0].t >= last.t + last.d - 0.001) fr.push.apply(fr, list);
    else {
      // Out of order (seek, quality switch): keep the list sorted, skip frames we have.
      list.forEach(function (f) {
        var lo = 0, hi = fr.length;
        while (lo < hi) { var mid = (lo + hi) >> 1; if (fr[mid].t < f.t) lo = mid + 1; else hi = mid; }
        if (lo < fr.length && Math.abs(fr[lo].t - f.t) < 0.001) return;
        fr.splice(lo, 0, f);
      });
    }
    // Keep half a minute behind the picture and (at low qualities hls.js buffers minutes ahead)
    // at most ~7 minutes in all, dropping what is furthest ahead.
    var keepFrom = (video.currentTime || 0) - 30, cut = 0;
    while (cut < fr.length && fr[cut].t < keepFrom) cut++;
    if (cut) fr.splice(0, cut);
    if (fr.length > 20000) fr.length = 20000;
  }

  function parseTraf(cap, b, moof, traf, list) {
    var end = traf + readU32(b, traf), o = traf + 8, base = 0, defDur = 0, defSize = 0, trun = -1;
    for (; o + 8 <= end; o += readU32(b, o)) {
      var t = boxType(b, o), fl = readU32(b, o + 8) & 0xffffff;
      if (t === 'tfhd') {
        var q = o + 16;
        if (fl & 1) q += 8;
        if (fl & 2) q += 4;
        if (fl & 8) { defDur = readU32(b, q); q += 4; }
        if (fl & 16) defSize = readU32(b, q);
      } else if (t === 'tfdt') {
        base = b[o + 8] === 1 ? readU32(b, o + 12) * 4294967296 + readU32(b, o + 16) : readU32(b, o + 12);
      } else if (t === 'trun') trun = o;
      if (readU32(b, o) < 8) return;
    }
    if (trun < 0 || !cap.scale) return;
    var flags = readU32(b, trun + 8) & 0xffffff, count = readU32(b, trun + 12), p = trun + 16;
    var data = moof;
    if (flags & 1) { data += readU32(b, p) | 0; p += 4; }
    if (flags & 4) p += 4;
    var time = base;
    for (var i = 0; i < count; i++) {
      var dur = defDur, sz = defSize;
      if (flags & 0x100) { dur = readU32(b, p); p += 4; }
      if (flags & 0x200) { sz = readU32(b, p); p += 4; }
      if (flags & 0x400) p += 4;
      if (flags & 0x800) p += 4;
      if (data + sz > b.length) return;
      list.push({ t: time / cap.scale, d: dur / cap.scale, data: b.subarray(data, data + sz) });
      data += sz;
      time += dur;
    }
  }

  // Our own small fMP4 (corrected init + one moof/mdat) with the given AAC frames, for decodeAudioData.
  function muxFrames(cap, list) {
    var n = list.length, size = 0, i;
    for (i = 0; i < n; i++) size += list[i].data.length;
    var trunSize = 20 + 8 * n, trafSize = 8 + 16 + 20 + trunSize, moofSize = 8 + 16 + trafSize;
    var out = new Uint8Array(cap.lcInit.length + moofSize + 8 + size), o = cap.lcInit.length;
    out.set(cap.lcInit, 0);
    function u32(v) { writeU32(out, o, v); o += 4; }
    function str(t) { for (var k = 0; k < 4; k++) out[o++] = t.charCodeAt(k); }
    var base = Math.round(list[0].t * cap.scale);
    u32(moofSize); str('moof');
    u32(16); str('mfhd'); u32(0); u32(1);
    u32(trafSize); str('traf');
    u32(16); str('tfhd'); u32(0x020000); u32(cap.track);
    u32(20); str('tfdt'); u32(0x01000000); u32(Math.floor(base / 4294967296)); u32(base % 4294967296);
    u32(trunSize); str('trun'); u32(0x000301); u32(n); u32(moofSize + 8);
    for (i = 0; i < n; i++) { u32(Math.round(list[i].d * cap.scale)); u32(list[i].data.length); }
    u32(8 + size); str('mdat');
    for (i = 0; i < n; i++) { out.set(list[i].data, o); o += list[i].data.length; }
    return out;
  }

  // Delivers the stream's sound as PCM, chunk by chunk, each continuing the previous one exactly.
  // Every chunk is decoded with a few frames of the previous one in front (an AAC frame needs its
  // predecessor) and lined up with the previous chunk's end by correlation.
  function HlsSound() { this.reset(); }
  HlsSound.prototype.reset = function () { this.tail = null; this.endT = -1; this.delay = 0; this.gen = (this.gen || 0) + 1; };
  // cb(chunk) with { t0, chs, rate } starting at media time t, cb(null) if the frames aren't there yet.
  HlsSound.prototype.read = function (ctx, t, dur, cb) {
    var fr = aud.frames, lo = 0, hi = fr.length, self = this;
    while (lo < hi) { var mid = (lo + hi) >> 1; if (fr[mid].t <= t + 1e-4) lo = mid + 1; else hi = mid; }
    var i0 = lo - 1;
    if (i0 < 0 || fr[i0].t + fr[i0].d < t || !aud.lcInit) { cb(null); return; }
    var i1 = i0 + 1;
    while (i1 < fr.length && fr[i1].t < t + dur && fr[i1].t - (fr[i1 - 1].t + fr[i1 - 1].d) < 0.002) i1++;
    var atEnd = video.duration && fr[i1 - 1].t + fr[i1 - 1].d > video.duration - 0.5;
    if (i1 - i0 < 24 && !atEnd && (i1 >= fr.length || fr[i1].t < t + dur)) { cb(null); return; }
    var first = i0;
    while (first > 0 && i0 - first < 3 && fr[first].t - (fr[first - 1].t + fr[first - 1].d) < 0.002) first--;
    var list = fr.slice(first, i1), lastDur = fr[i1 - 1].d, startT = list[0].t;
    var data = muxFrames(aud, list);
    // A reset() while decoding makes this result stale (and drops the tail).
    var gen = this.gen, tail = this.tail, cont = tail && Math.abs(t - this.endT) < 1e-6;
    try {
      ctx.decodeAudioData(data.buffer, function (ab) {
        if (gen !== self.gen) { cb(null); return; }
        var R = ab.sampleRate, p = Math.round((t - startT) * R + self.delay * R);
        if (cont) {
          var al = alignTail(tail, ab.getChannelData(0), p);
          if (al !== null) { p = al; self.delay = p / R - (t - startT); }
        }
        var end = ab.length - (atEnd && i1 >= fr.length ? 0 : Math.round(lastDur * R));
        if (p < 0 || end - p < R * 0.2) { cb(null, 'kurz'); return; }
        var chs = [];
        for (var c = 0; c < ab.numberOfChannels; c++) chs.push(ab.getChannelData(c).subarray(p, end));
        self.endT = t + (end - p) / R;
        self.tail = new Float32Array(chs[0].subarray(chs[0].length - 1024));
        cb({ t0: t, chs: chs, rate: R });
      }, function () { cb(null, 'decode'); });
    } catch (e) {
      cb(null, 'decode');
    }
  };

  // Where in `pcm` the audio continuing `tail` starts (near `guess`), or null if unsure.
  function alignTail(tail, pcm, guess) {
    var L = tail.length, best = -2, bestQ = -1, et = 1e-9, i;
    for (i = 0; i < L; i += 2) et += tail[i] * tail[i];
    if (et < 1e-4) return null;
    for (var q = Math.max(0, guess - L - 700); q <= Math.min(pcm.length - L, guess - L + 700); q++) {
      var sum = 0, ep = 1e-9;
      for (i = 0; i < L; i += 2) { sum += tail[i] * pcm[q + i]; ep += pcm[q + i] * pcm[q + i]; }
      var sc = sum / Math.sqrt(et * ep);
      if (sc > best) { best = sc; bestQ = q; }
    }
    return best > 0.6 ? bestQ + L : null;
  }

  // Clips are short: fetch the MP4 once more (its smallest version) and decode its sound as a whole.
  var clipPcm = { url: null, buf: null, loading: false, failed: false };
  function ClipSound() {}
  ClipSound.prototype.reset = function () {};
  ClipSound.prototype.read = function (ctx, t, dur, cb) {
    var url = current && current.clipUrl;
    if (!url) { cb(null, 'clip'); return; }
    if (clipPcm.url !== url) {
      clipPcm = { url: url, buf: null, loading: true, failed: false };
      var mine = clipPcm, x = new XMLHttpRequest();
      x.open('GET', url);
      x.responseType = 'arraybuffer';
      x.onload = function () {
        if (x.status !== 200) { mine.failed = true; return; }
        try {
          ctx.decodeAudioData(x.response, function (ab) { mine.buf = ab; mine.loading = false; },
            function () { mine.failed = true; });
        } catch (e) { mine.failed = true; }
      };
      x.onerror = function () { mine.failed = true; };
      x.send();
    }
    if (clipPcm.failed) { cb(null, 'clip'); return; }
    var ab = clipPcm.buf;
    if (!ab) { cb(null); return; }
    var R = ab.sampleRate, s0 = Math.max(0, Math.round(t * R)), s1 = Math.min(ab.length, Math.round((t + dur) * R));
    if (s1 <= s0) { cb(null); return; }
    var chs = [];
    for (var c = 0; c < ab.numberOfChannels; c++) chs.push(ab.getChannelData(c).subarray(s0, s1));
    cb({ t0: s0 / R, chs: chs, rate: R });
  };

  var hlsSound = new HlsSound(), clipSound = new ClipSound();

  function soundContext() {
    if (sndCtx) return sndCtx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { sndCtx = new AC(); } catch (e) { return null; }
    sndBus = sndCtx.createGain();
    sndComp = sndCtx.createDynamicsCompressor();
    sndGain = sndCtx.createGain();
    sndComp.connect(sndGain);
    sndGain.connect(sndCtx.destination);
    return sndCtx;
  }

  function wireCompressor() {
    try { sndBus.disconnect(); } catch (e) { /* not connected */ }
    var p = TT.audio.preset();
    if (p) {
      sndComp.threshold.value = p.threshold;
      sndComp.ratio.value = p.ratio;
      sndComp.knee.value = p.knee;
      sndComp.attack.value = p.attack;
      sndComp.release.value = p.release;
      sndGain.gain.value = Math.pow(10, p.makeupDb / 20);
      sndBus.connect(sndComp);
    } else sndBus.connect(sndCtx.destination);
  }

  // Seconds the own sound plays ahead of the picture (lip sync; to be tuned on the TV).
  function soundOffset() { return +TT.store.get('audioOffset', 0) || 0; }

  function soundWanted() {
    return !!current && !sndFailed && (speed !== 1 || TT.audio.mode() !== 'off') && (!!hls || !!current.clip);
  }

  // Called whenever speed, compressor or playback changes.
  function soundUpdate() {
    if (!soundWanted()) { soundStop(); return; }
    if (!soundContext()) { soundFail(); return; }
    wireCompressor();
    if (!snd) snd = { seq: 0, timer: setInterval(soundTick, 150), blocks: [], errors: 0 };
    soundRestart();
  }

  function soundStop() {
    if (!snd) return;
    stopBlocks();
    clearInterval(snd.timer);
    snd = null;
  }

  function soundFail() {
    var tempo = speed !== 1;
    sndFailed = true;
    soundStop();
    TT.toast(tempo ? 'Bei diesem Tempo gibt es hier leider keinen Ton' : 'Der Kompressor geht hier leider nicht');
  }

  // Until the own sound starts again, the video's sound plays (at 1x; at other speeds the TV mutes it).
  function stopBlocks() {
    snd.blocks.forEach(function (b) { try { b.node.stop(0); } catch (e) { /* ended */ } });
    snd.blocks = [];
    snd.anchored = false;
    snd.schedEnd = 0;
    clearTimeout(snd.muteTimer);
    video.muted = false;
  }

  function soundRestart() {
    stopBlocks();
    snd.seq++;
    snd.src = current.clip ? clipSound : hlsSound;
    snd.src.reset();
    snd.speed = speed;
    snd.st = null;
    snd.feedT = null;
    snd.outT = 0;
    snd.busy = false;
  }

  // Media time the own sound plays at ctx time `now`, or null between blocks.
  function soundMediaAt(now) {
    for (var i = 0; i < snd.blocks.length; i++) {
      var b = snd.blocks[i];
      if (now >= b.c0 && now < b.c1) return b.m0 + (now - b.c0) / (b.c1 - b.c0) * (b.m1 - b.m0);
    }
    return null;
  }

  function soundTick() {
    if (!snd) return;
    var ctx = sndCtx;
    if (video.seeking) { if (!snd.seekWait) { snd.seekWait = true; stopBlocks(); } return; }
    if (snd.seekWait) { snd.seekWait = false; soundRestart(); }
    // Hold the sound while the picture doesn't move (paused, buffering). Not by readyState:
    // the TV reports odd states at other speeds.
    var vt = video.currentTime, ms = Date.now();
    if (vt !== snd.lastT || !snd.movedAt) { snd.lastT = vt; snd.movedAt = ms; }
    if (video.paused || ms - snd.movedAt > 500) {
      if (ctx.state === 'running' && ctx.suspend) ctx.suspend();
      return;
    }
    if (ctx.state === 'suspended') { ctx.resume(); return; }
    var now = ctx.currentTime;
    if (snd.anchored) {
      if (snd.schedEnd < now + 0.05) snd.anchored = false;   // ran dry: line up again
      else {
        var m = soundMediaAt(now);
        if (m !== null && Math.abs(m - (video.currentTime + soundOffset() * snd.speed)) > 0.15 * Math.max(1, snd.speed)) {
          soundRestart();
          return;
        }
      }
    }
    soundFeed();
  }

  function soundFeed() {
    if (snd.busy || (snd.anchored && snd.schedEnd - sndCtx.currentTime > SND_AHEAD)) return;
    // Not playing yet and the picture is past where we are: start over just ahead of it.
    if (snd.feedT === null || (!snd.anchored && snd.feedT < video.currentTime + 0.1 * snd.speed)) {
      snd.src.reset();
      snd.st = null;
      snd.feedT = snd.outT = video.currentTime + 0.6 * snd.speed;
    }
    var my = snd.seq;
    snd.busy = true;
    snd.src.read(sndCtx, snd.feedT, snd.anchored ? 3 : 1.2, function (chunk, err) {
      if (!snd || snd.seq !== my) return;
      snd.busy = false;
      if (err) {
        if (++snd.errors >= 3) soundFail();
        else snd.feedT = null;
        return;
      }
      if (!chunk) return;
      snd.errors = 0;
      if (Math.abs(chunk.t0 - snd.feedT) > 0.05) snd.outT = chunk.t0;
      snd.feedT = chunk.t0 + chunk.chs[0].length / chunk.rate;
      var out = chunk.chs;
      if (snd.speed !== 1) {
        if (!snd.st) snd.st = new TT.Stretcher(out.length, chunk.rate, snd.speed);
        out = snd.st.process(out);
      }
      if (out[0].length) soundSchedule(out, chunk.rate);
    });
  }

  function soundSchedule(chs, rate) {
    var ctx = sndCtx, n = chs[0].length, m0 = snd.outT, skip = 0, start;
    snd.outT += n * snd.speed / rate;
    if (!snd.anchored) {
      // Start when the picture reaches m0; drop what the picture has already passed.
      var now = ctx.currentTime, earliest = now + 0.08;
      start = now + (m0 - video.currentTime) / snd.speed - soundOffset();
      if (start < earliest) { skip = Math.ceil((earliest - start) * rate); start = earliest; }
      if (skip >= n) return;
      snd.anchored = true;
      clearTimeout(snd.muteTimer);
      snd.muteTimer = setTimeout(function () { if (snd) video.muted = true; }, Math.max(0, (start - now) * 1000));
    } else start = snd.schedEnd;
    var len = n - skip, buf = ctx.createBuffer(chs.length, len, rate);
    for (var c = 0; c < chs.length; c++) buf.getChannelData(c).set(skip ? chs[c].subarray(skip) : chs[c]);
    var node = ctx.createBufferSource();
    node.buffer = buf;
    node.connect(sndBus);
    node.start(start);
    snd.blocks.push({ node: node, c0: start, c1: start + len / rate, m0: m0 + skip * snd.speed / rate, m1: snd.outT });
    snd.schedEnd = start + len / rate;
    while (snd.blocks.length && snd.blocks[0].c1 < ctx.currentTime - 1) snd.blocks.shift();
  }

  function toggleStats() {
    var el = $('stats');
    if (statsTimer) { clearInterval(statsTimer); statsTimer = null; el.style.display = 'none'; return; }
    renderStats();
    el.style.display = 'block';
    statsTimer = setInterval(renderStats, 1000);
  }

  // ---- OSD with focusable control row -----------------------------------------
  // Rows: 'scrub' (VOD progress bar: ◀ ▶ seek) and 'buttons' (◀ ▶ choose, OK press).
  var osdVisible = false, row = 'buttons', btnIndex = 0, buttons = [];

  function defaultRow() { return current && current.vod ? 'scrub' : 'buttons'; }

  var ICONS = {
    play: 'M7 4l13 8-13 8z',
    pause: 'M6 4h4v16H6zM14 4h4v16h-4z',
    back: 'M11 6v12L2 12zM21 6v12l-9-6z',
    fwd: 'M13 6v12l9-6zM3 6v12l9-6z',
    chat: 'M4 5h16v11H8l-4 4z',
    write: 'M4 17v3h3l10-10-3-3zm15-9l-3-3 2-2 3 3z',
    more: 'M6 10a2 2 0 110 4 2 2 0 010-4zm6 0a2 2 0 110 4 2 2 0 010-4zm6 0a2 2 0 110 4 2 2 0 010-4z',
    reload: 'M17.65 6.35A8 8 0 1 0 19.73 14h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4z',
    comp: 'M3 9h4l5-5v16l-5-5H3zM15 9h2v6h-2zM19 7h2v10h-2z',
    up: 'M12 4l6 7h-4v9h-4v-9H6z',
    down: 'M12 20l-6-7h4V4h4v9h4z',
    user: 'M12 3a4 4 0 110 8 4 4 0 010-8zm0 10c4.4 0 8 2 8 4.5V21H4v-3.5C4 15 7.6 13 12 13z',
    hd: 'M3 5h18v14H3zM6 9v6h2v-2h2v2h2V9h-2v2H8V9zm8 0v6h3a2 2 0 002-2v-2a2 2 0 00-2-2zm2 2h1v2h-1z',
    heart: 'M12 21l-1.4-1.3C5.4 15 2 12 2 8.4 2 5.4 4.4 3 7.4 3c1.7 0 3.4.8 4.6 2.1C13.2 3.8 14.9 3 16.6 3 19.6 3 22 5.4 22 8.4c0 3.6-3.4 6.6-8.6 11.3z',
    start: 'M5 5h2v14H5zM9 12l10-7v14z',
    flag: 'M5 3h2v18H5zM8 4h11l-2 4 2 4H8z',
    fire: 'M12 2c1 4 6 6 6 12a6 6 0 01-12 0c0-3 2-5 3-6 0 2 1 3 2 3 0-4-1-6 1-9z',
    speed: 'M12 4a9 9 0 019 9h-2a7 7 0 10-14 0H3a9 9 0 019-9zm1 9l4-5-6 4a1.5 1.5 0 102 1z',
    next: 'M5 5l9 7-9 7zM16 5h3v14h-3z'
  };

  // Follow state of the channel on screen: null = unknown / signed out.
  var following = null, followBusy = false;

  function loadFollowState() {
    following = null;
    var owner = current && (current.stream ? current.stream.broadcaster : current.owner);
    if (!owner || !TT.api.auth.current()) return;
    var my = session;
    TT.api.isFollowing(owner.login).then(function (f) {
      if (my !== session) return;
      following = f;
      if (osdVisible) renderControls();
    }).catch(function () { /* button stays hidden */ });
  }

  function toggleFollow() {
    var owner = current && (current.stream ? current.stream.broadcaster : current.owner);
    if (!owner || following === null || followBusy) return;
    followBusy = true;
    TT.api.setFollow(owner.login, !following).then(function (f) {
      following = f;
      TT.toast(f ? 'Du folgst jetzt ' + (owner.displayName || owner.login) : 'Du folgst ' + (owner.displayName || owner.login) + ' nicht mehr');
      if (TT.player.onFollowChange) TT.player.onFollowChange();
    }, function (e) {
      TT.toast('Folgen hat nicht geklappt: ' + (e.message || e));
    }).then(function () { followBusy = false; if (osdVisible) renderControls(); });
  }

  function levelName(l) {
    if (!l) return '?';
    var fps = l.frameRate || (l.attrs && parseFloat(l.attrs['FRAME-RATE'])) || 0;
    return (l.height || '?') + 'p' + (fps >= 50 ? '60' : '');
  }

  // "Auto (1080p60)" while hls.js chooses, otherwise the fixed level.
  function qualityLabel() {
    if (!hls || !hls.levels || !hls.levels.length) return 'Auto';
    var cur = hls.levels[hls.currentLevel >= 0 ? hls.currentLevel : hls.loadLevel];
    return hls.autoLevelEnabled ? 'Auto' + (cur ? ' (' + levelName(cur) + ')' : '') : levelName(cur);
  }

  // ---- automatic quality drop -------------------------------------------------------------
  // After repeated failures or stalls the stream is capped one level lower (by bitrate; hls.js
  // keeps its levels sorted by bitrate, so the cap is an index). The cap survives reconnects
  // of the same stream and ends when the user picks a quality.
  var stalls = [];

  // Faster playback means more pictures for the TV's decoder (1080p60 at 1.5x is 90 a second, more
  // than it manages, and the own sound path needs the processor too). So at higher speeds the
  // pixels per second stay below 3/4 of 1080p60 at 1x: 720p60 up to 1.5x, 720p30 or 480p at 2x.
  function speedAllows(height, fps) {
    if (speed <= 1) return true;
    return height * height * 16 / 9 * (fps || 30) * speed <= 90e6;
  }

  function applyCap(flush) {
    if (!current || !hls || !hls.levels || !hls.levels.length) return;
    if (!current.capBitrate && speed <= 1) { hls.autoLevelCapping = -1; return; }
    var cap = -1, lowest = 0;
    hls.levels.forEach(function (l, i) {
      if ((l.bitrate || 0) < (hls.levels[lowest].bitrate || 0)) lowest = i;
      if (current.capBitrate && (l.bitrate || 0) > current.capBitrate) return;
      if (!speedAllows(l.height || 0, l.frameRate || 30)) return;
      if (cap < 0 || l.bitrate > hls.levels[cap].bitrate) cap = i;
    });
    if (cap < 0) cap = lowest;
    var lower = hls.autoLevelCapping < 0 || cap < hls.autoLevelCapping;
    hls.autoLevelCapping = cap;
    // A lower cap from a speed change should show at once, not after the buffered half minute.
    var sc = hls.streamController, playing = hls.levels[hls.currentLevel >= 0 ? hls.currentLevel : hls.loadLevel];
    if (flush && lower && hls.autoLevelEnabled && playing && playing.bitrate > hls.levels[cap].bitrate && sc && sc.nextLevelSwitch) {
      sc.nextLevelSwitch();
    }
    if (!hls.autoLevelEnabled && hls.levels[hls.currentLevel] &&
        hls.levels[hls.currentLevel].bitrate > hls.levels[cap].bitrate) hls.currentLevel = cap;
  }

  // Returns false if there is no lower level.
  function dropQuality() {
    if (!hls || !hls.levels || !hls.levels.length) return false;
    var l = hls.levels[hls.currentLevel >= 0 ? hls.currentLevel : hls.loadLevel];
    if (!l) return false;
    var next = null;
    hls.levels.forEach(function (x) {
      if ((x.bitrate || 0) < (l.bitrate || 0) && (!next || x.bitrate > next.bitrate)) next = x;
    });
    if (!next) return false;
    current.capBitrate = next.bitrate || 1;
    TT.toast('Der Stream hakt – Qualität auf ' + levelName(next) + ' gesenkt', 5000);
    applyCap();
    return true;
  }

  // 4 stalls within a minute while playing (not while starting or during blocked ads) -> one level lower.
  function noteStall() {
    var now = Date.now();
    if (video.paused || (ctrl && ctrl.adActive) || !current || current.clip || now - startedAt < 15000) return;
    stalls = stalls.filter(function (t) { return now - t < 60000; });
    stalls.push(now);
    if (stalls.length >= 4) {
      stalls = [];
      dropQuality();
    }
  }

  // ---- writing in the chat (live, signed in) -----------------------------------------------
  // On-screen keyboard over the video. Quick replies send at once; the last messages sent
  // come first. Shift works for one letter, like on a phone, and is on at the start.
  var compose = null;
  var QUICK = ['GG', 'LUL', 'Kappa', '<3', 'Hallo!', 'Hahaha'];
  var COMPOSE_ROWS = ['1234567890ß', 'qwertzuiopü', 'asdfghjklöä', 'yxcvbnm,.!?'];

  function upper(ch) { return ch === 'ß' ? ch : ch.toUpperCase(); }

  function composeUpdate() {
    compose.textEl.textContent = compose.text || 'Nachricht an den Chat';
    compose.textEl.className = 'search-text' + (compose.text ? '' : ' placeholder');
    compose.keys.forEach(function (k) { k.el.textContent = compose.shift ? upper(k.ch) : k.ch; });
    compose.shiftEl.classList.toggle('on', compose.shift);
  }

  function composeType(str) {
    if (compose.text.length + str.length > 500) return;
    compose.text += str;
    compose.shift = false;
    composeUpdate();
  }

  function composeDelete() {
    compose.text = compose.text.slice(0, -1);
    if (!compose.text) compose.shift = true;
    composeUpdate();
  }

  // Twitch's reasons for not delivering a message.
  function chatDropText(reason) {
    var r = String(reason || '');
    if (/FOLLOW/i.test(r)) return 'Hier dürfen gerade nur Follower schreiben';
    if (/SUB/i.test(r)) return 'Hier dürfen gerade nur Abonnenten schreiben';
    if (/EMOTE/i.test(r)) return 'Gerade sind nur Emotes erlaubt';
    if (/SLOW/i.test(r)) return 'Langsamer Modus: kurz warten und noch einmal senden';
    if (/DUPLICATE|R9K|UNIQUE/i.test(r)) return 'Dieselbe Nachricht geht nicht zweimal hintereinander';
    if (/BAN|TIMED|TIMEOUT/i.test(r)) return 'Du bist in diesem Chat gerade gesperrt';
    if (/VERIF|PHONE|EMAIL/i.test(r)) return 'Dieser Kanal verlangt ein bestätigtes Twitch-Konto';
    if (/AUTOMOD|HELD/i.test(r)) return 'AutoMod hat die Nachricht zurückgehalten';
    if (/RATE|LIMIT|FAST/i.test(r)) return 'Zu schnell – kurz warten';
    if (/unauthenticated|unauthorized/i.test(r)) return 'Bitte unter Einstellungen neu bei Twitch anmelden';
    return 'Nachricht nicht gesendet (' + r + ')';
  }

  function sendCompose(text) {
    var login = TT.player.currentLogin();
    text = String(text || '').replace(/^\s+|\s+$/g, '');
    if (!compose || compose.busy || !text || !login) return;
    compose.busy = true;
    compose.textEl.textContent = 'Wird gesendet …';
    TT.api.sendChat(login, text).then(function () {
      var recent = (TT.store.get('chatRecent', []) || []).filter(function (t) { return t !== text; });
      TT.store.set('chatRecent', [text].concat(recent).slice(0, 3));
      if (TT.chat.label() === 'Aus') TT.chat.cycle();
      TT.toast('Gesendet');
      closeCompose();
    }, function (e) {
      if (!compose) return;
      compose.busy = false;
      composeUpdate();
      TT.toast(chatDropText(e.message || e), 5000);
    });
  }

  function openCompose() {
    if (!TT.player.currentLogin()) return;
    if (!TT.api.auth.current()) { TT.toast('Zum Schreiben unter Einstellungen bei Twitch anmelden'); return; }
    closeCompose();
    hideOsd();
    var el = TT.el('div', '');
    el.id = 'compose';
    var box = TT.el('div', 'search-box');
    var textEl = TT.el('span', 'search-text');
    box.appendChild(textEl);
    box.appendChild(TT.el('span', 'caret'));
    el.appendChild(box);
    compose = { el: el, text: '', shift: true, textEl: textEl, keys: [], busy: false };

    var quick = TT.el('div', 'keyrow compose-quick');
    var recent = TT.store.get('chatRecent', []) || [];
    recent.concat(QUICK.filter(function (q) { return recent.indexOf(q) < 0; })).slice(0, 8).forEach(function (q) {
      quick.appendChild(TT.focusable(TT.el('div', 'key', q), function () { sendCompose(q); }));
    });
    el.appendChild(quick);

    // The channel's 7TV/BTTV/FFZ emotes, ten at a time ('›' shows the next ones).
    var emotes = TT.chat.channelEmotes();
    if (emotes.length) {
      var erow = TT.el('div', 'keyrow compose-emotes'), page = 0, PER = 10;
      var paintEmotes = function () {
        TT.clear(erow);
        emotes.slice(page * PER, page * PER + PER).forEach(function (e) {
          var k = TT.focusable(TT.el('div', 'key emote-key'), function () {
            composeType((compose.text && !/\s$/.test(compose.text) ? ' ' : '') + e.name + ' ');
          });
          var img = TT.el('img');
          img.src = e.url;
          img.alt = e.name;
          k.appendChild(img);
          erow.appendChild(k);
        });
        if (emotes.length > PER) {
          erow.appendChild(TT.focusable(TT.el('div', 'key', '›'), function () {
            page = (page + 1) % Math.ceil(emotes.length / PER);
            paintEmotes();
            TT.focus.set(erow.lastChild);
          }));
        }
      };
      paintEmotes();
      el.appendChild(erow);
    }

    var first = null;
    COMPOSE_ROWS.forEach(function (keys) {
      var r = TT.el('div', 'keyrow');
      keys.split('').forEach(function (ch) {
        var k = TT.focusable(TT.el('div', 'key', ch), function () { composeType(compose.shift ? upper(ch) : ch); });
        compose.keys.push({ ch: ch, el: k });
        if (!first && ch === 'q') first = k;
        r.appendChild(k);
      });
      el.appendChild(r);
    });
    var actions = TT.el('div', 'keyrow');
    compose.shiftEl = TT.focusable(TT.el('div', 'key mid', '⇧ Groß'), function () {
      compose.shift = !compose.shift;
      composeUpdate();
    });
    actions.appendChild(compose.shiftEl);
    actions.appendChild(TT.focusable(TT.el('div', 'key wide', 'Leerzeichen'), function () { composeType(' '); }));
    actions.appendChild(TT.focusable(TT.el('div', 'key mid', '⌫'), composeDelete));
    actions.appendChild(TT.focusable(TT.el('div', 'key wide send', 'Senden'), function () { sendCompose(compose.text); }));
    el.appendChild(actions);
    el.appendChild(TT.el('div', 'compose-hint', 'Oben: sofort senden  ·  Zurück: abbrechen'));
    // Writing on the phone is easier: the channel's chat as a QR code next to the keyboard.
    var wrap = TT.el('div', '');
    wrap.id = 'compose';
    el.id = '';
    el.className = 'compose-keys';
    wrap.appendChild(el);
    var side = TT.el('div', 'compose-qr');
    wrap.appendChild(side);
    TT.qrImage('https://www.twitch.tv/popout/' + TT.player.currentLogin() + '/chat').then(function (img) {
      side.appendChild(img);
      side.appendChild(TT.el('div', '', 'Lieber am Handy schreiben? Scannen öffnet den Chat dort.'));
    }).catch(function () { side.style.display = 'none'; });
    compose.el = wrap;
    $('player').appendChild(wrap);
    composeUpdate();
    TT.focus.set(first);
  }

  function closeCompose() {
    if (!compose) return;
    if (compose.el.parentNode) compose.el.parentNode.removeChild(compose.el);
    compose = null;
  }

  // Auto -> highest -> ... -> lowest -> Auto, for this stream only.
  function cycleQuality() {
    if (!hls || !hls.levels || !hls.levels.length) return;
    if (current) current.capBitrate = 0;
    hls.autoLevelCapping = -1;
    var order = hls.levels.map(function (l, i) { return i; }).sort(function (a, b) {
      var la = hls.levels[a], lb = hls.levels[b];
      return (lb.height - la.height) || ((lb.bitrate || 0) - (la.bitrate || 0));
    });
    var opts = [-1].concat(order);
    var now = hls.autoLevelEnabled ? -1 : hls.currentLevel;
    var next = opts[(opts.indexOf(now) + 1) % opts.length];
    hls.currentLevel = next;
    TT.toast('Qualität: ' + (next < 0 ? 'Automatisch' : levelName(hls.levels[next])));
  }

  // The control row holds the main actions; everything else (more: true) is in the
  // "Mehr" menu, a list opened above the row. stay: true keeps the menu open (toggles).
  function controlList() {
    var isVod = !!(current && current.vod), isClip = !!(current && current.clip);
    var list = [];
    if (current && current.ended) {
      var ended = current.ended;
      list.push({ icon: 'play', label: 'Aufzeichnung ansehen', fn: function () {
        TT.player.openVod(ended.vod, ended.owner, { fromStart: true });
      } });
    }
    list.push({ icon: video.paused ? 'play' : 'pause', label: video.paused ? 'Weiter' : 'Pause', fn: togglePause });
    if (isVod && !isClip) {
      list.push({ icon: 'back', label: '1 Min.', fn: function () { seekBy(-60); } });
      list.push({ icon: 'fwd', label: '1 Min.', fn: function () { seekBy(60); } });
      if (extras.chapters.length > 1) {
        var ch = currentChapter();
        list.push({ icon: 'flag', label: 'Kapitel' + (ch && ch.name ? ': ' + ch.name : ''), fn: nextChapter });
      }
      if (extras.hype.length) list.push({ icon: 'fire', label: 'Hype-Moment', fn: nextHype });
    }
    if (isClip && current.clips && current.clips.length > 1) {
      list.push({ icon: 'next', label: 'Nächster Clip', fn: function () { switchClip(1); } });
    }
    if (!isClip) list.push({ icon: 'chat', label: 'Chat: ' + TT.chat.label(), fn: function () { TT.chat.cycle(); } });
    if (!isVod && TT.api.auth.current()) list.push({ icon: 'write', label: 'Schreiben', fn: openCompose });
    if (following !== null) {
      list.push({ icon: 'heart', label: following ? 'Folge ich' : 'Folgen', fn: toggleFollow, more: isVod && !isClip, stay: true });
    }
    // "Mehr"
    if (!isClip) list.push({ icon: 'hd', label: 'Qualität: ' + qualityLabel(), fn: cycleQuality, more: true, stay: true });
    if (isVod) list.push({ icon: 'speed', label: 'Tempo: ' + fmtSpeed(speed), fn: cycleSpeed, more: true, stay: true });
    if (!isVod) list.push({ icon: 'start', label: 'Von Anfang an', fn: watchFromStart, more: true });
    list.push({ icon: 'reload', label: 'Neu laden', fn: function () { TT.toast('Wird neu geladen …'); restart(); }, more: true });
    var login = isVod ? current.owner && current.owner.login : current && current.stream.broadcaster.login;
    if (login && TT.player.onChannelPage) {
      list.push({ icon: 'user', label: 'Kanal & Videos', fn: function () { TT.player.onChannelPage(login); }, more: true });
    }
    list.push({ icon: 'comp', label: 'Kompressor: ' + TT.audio.label(), fn: cycleCompressor, more: true, stay: true });
    return list;
  }

  var moreOpen = false, moreIndex = 0, moreItems = [];

  function openMore() {
    moreOpen = true;
    moreIndex = 0;
  }

  function svgIcon(name) {
    var span = TT.el('span', 'ico');
    span.innerHTML = '<svg viewBox="0 0 24 24"><path d="' + ICONS[name] + '"/></svg>';
    return span;
  }

  // Colour-key legend, so the remote's buttons are discoverable.
  function renderKeys() {
    var isVod = !!(current && current.vod);
    var box = $('osd-keys');
    TT.clear(box);
    function key(cls, text) {
      var k = TT.el('span', 'key-hint');
      k.appendChild(TT.el('i', cls));
      k.appendChild(document.createTextNode(text));
      box.appendChild(k);
    }
    var isClip = !!(current && current.clip);
    if (!isClip) key('kc red', 'Chat');
    key('kc green', 'Kompressor');
    key('kc yellow', 'Kanal');
    var ch = TT.el('span', 'key-hint');
    ch.appendChild(TT.el('b', 'kc-ch', 'CH'));
    ch.appendChild(document.createTextNode(isClip ? 'Clip wechseln' : isVod ? '± 5 Min.' : 'Stream wechseln'));
    box.appendChild(ch);
    var info = TT.el('span', 'key-hint');
    info.appendChild(TT.el('b', 'kc-ch', 'INFO'));
    info.appendChild(document.createTextNode('Statistik'));
    box.appendChild(info);
  }

  function renderControls() {
    var all = controlList();
    buttons = all.filter(function (b) { return !b.more; });
    moreItems = all.filter(function (b) { return b.more; });
    if (moreItems.length) buttons.push({ icon: 'more', label: 'Mehr', fn: openMore, isMore: true });
    if (btnIndex >= buttons.length) btnIndex = buttons.length - 1;
    if (moreIndex >= moreItems.length) moreIndex = moreItems.length - 1;
    var box = $('osd-controls');
    TT.clear(box);
    var moreBtn = null;
    buttons.forEach(function (b, i) {
      var el = TT.el('div', 'ctl-btn' + (row === 'buttons' && i === btnIndex ? ' sel' : '') + (b.isMore && moreOpen ? ' open' : ''));
      el.appendChild(svgIcon(b.icon));
      el.appendChild(TT.el('span', '', b.label));
      box.appendChild(el);
      if (b.isMore) moreBtn = el;
    });
    // The "Mehr" list, right above its button.
    var menu = $('osd-more');
    if (!menu) {
      menu = TT.el('div', '');
      menu.id = 'osd-more';
      box.parentNode.parentNode.appendChild(menu);
    }
    TT.clear(menu);
    menu.style.display = moreOpen && moreBtn ? '' : 'none';
    if (moreOpen && moreBtn) {
      moreItems.forEach(function (b, i) {
        var el = TT.el('div', 'more-item' + (i === moreIndex ? ' sel' : ''));
        el.appendChild(svgIcon(b.icon));
        el.appendChild(TT.el('span', '', b.label));
        menu.appendChild(el);
      });
      menu.style.left = moreBtn.offsetLeft + 'px';
      menu.style.bottom = (menu.parentNode.clientHeight - moreBtn.offsetTop + 8) + 'px';
    }
    renderKeys();
    if (current && current.stream && current.stream.createdAt) {
      $('osd-uptime').textContent = 'seit ' + TT.fmtUptime(current.stream.createdAt);
    }
    var prog = $('osd-progress');
    prog.className = 'osd-progress vod-only' + (row === 'scrub' ? ' row-focused' : '') +
      (scrub.active ? ' scrubbing' : '');
  }

  function hideOsd() {
    osdVisible = false;
    moreOpen = false;
    clearTimeout(osdTimer);
    $('osd').className = 'osd';
  }

  function showOsd(ms) {
    if (!osdVisible) { row = defaultRow(); btnIndex = 0; }
    osdVisible = true;
    updateProgress();
    renderControls();
    $('osd').className = 'osd show';
    clearTimeout(osdTimer);
    osdTimer = setTimeout(function () {
      if (video.paused && current) return; // stay up while paused
      hideOsd();
    }, ms || 5000);
  }

  // ---- hold-to-seek (VOD) ------------------------------------------------------
  // While a direction is held, only a preview position moves (with growing steps);
  // the real seek happens once, on release, so the TV doesn't stall on every repeat.
  var scrub = { active: false, target: 0, dir: 0, startedAt: 0, lastAt: 0, step: 10, timer: null };

  function stepLabel(s) { return s >= 60 ? Math.round(s / 60) + ' min' : s + ' s'; }

  function stepFor(heldMs) {
    var dur = vodDuration();
    if (heldMs < 800) return 10;
    if (heldMs < 1800) return 30;
    if (heldMs < 2800) return 60;
    if (heldMs < 3800) return 120;
    return Math.max(300, Math.round(dur / 50 / 60) * 60); // ~2% of the video per step
  }

  function scrubKey(dir, repeat) {
    var now = Date.now();
    var continuing = scrub.active && scrub.dir === dir && (repeat || now - scrub.lastAt < 700);
    if (!scrub.active) scrub.target = video.currentTime;
    if (!continuing) { scrub.startedAt = now; scrub.dir = dir; }
    scrub.active = true;
    scrub.lastAt = now;
    scrub.step = stepFor(now - scrub.startedAt);
    var dur = vodDuration();
    scrub.target = Math.max(0, Math.min(dur ? dur - 2 : Infinity, scrub.target + dir * scrub.step));
    clearTimeout(scrub.timer);
    scrub.timer = setTimeout(commitScrub, 700); // fallback if no keyup arrives
    showOsd();
  }

  function commitScrub() {
    clearTimeout(scrub.timer);
    if (!scrub.active) return;
    scrub.active = false;
    video.currentTime = scrub.target;
    showOsd();
  }

  function cancelScrub() {
    clearTimeout(scrub.timer);
    scrub.active = false;
  }

  // ---- actions shared by keys and on-screen buttons ------------------------------
  function togglePause() {
    if (video.paused) TT.player.resume(); else TT.player.pause();
  }

  function cycleCompressor() {
    var label = TT.audio.cycle();
    TT.toast(label === null ? 'Der Kompressor wird von diesem Fernseher nicht unterstützt' : 'Kompressor: ' + label);
    updateBadges();
    if (sndCtx && snd) wireCompressor();
    soundUpdate();
  }

  function switchStream(delta) {
    if (playlist.length < 2) return;
    index = (index + delta + playlist.length) % playlist.length;
    TT.player.open(playlist[index], playlist);
  }

  function setStatus(text) {
    var s = $('player-status');
    s.textContent = text || '';
    s.style.display = text ? 'block' : 'none';
  }

  function updateBadges() {
    var b = $('badges');
    TT.clear(b);
    if (ctrl && ctrl.adActive) {
      b.appendChild(TT.el('span', 'badge badge-ad',
        ctrl.adHow === 'backup' ? 'Werbung blockiert' : 'Werbung blockiert – gleich geht es weiter'));
    }
    if (TT.audio.mode() !== 'off') b.appendChild(TT.el('span', 'badge', 'Kompressor: ' + TT.audio.label()));
  }

  function fillOsd(title, owner, meta) {
    owner = owner || {};
    $('osd-avatar').src = owner.profileImageURL || '';
    $('osd-name').textContent = owner.displayName || owner.login || '';
    $('osd-title').textContent = title || '';
    $('osd-meta').textContent = meta || '';
    $('osd-viewers').textContent = '';
    $('osd-uptime').textContent = '';
  }

  function fillLiveOsd(s) {
    fillOsd(s.title, s.broadcaster, s.game ? s.game.displayName : '');
    $('osd-viewers').textContent = s.viewersCount ? TT.fmtViewers(s.viewersCount) : '';
    $('osd-uptime').textContent = s.createdAt ? 'seit ' + TT.fmtUptime(s.createdAt) : '';
  }

  // Live: title, category, viewers and uptime in the OSD are refreshed every minute.
  var infoTimer = null;

  function refreshLiveInfo() {
    var s = current && current.stream;
    if (!s) return;
    TT.api.channel(s.broadcaster.login).then(function (u) {
      if (!current || current.stream !== s || !u || !u.stream) return;
      var oldGame = s.game ? s.game.displayName : '', game = u.stream.game ? u.stream.game.displayName : '';
      s.title = u.stream.title;
      s.game = u.stream.game;
      s.viewersCount = u.stream.viewersCount;
      if (u.stream.createdAt) s.createdAt = u.stream.createdAt;
      if (oldGame && game && game !== oldGame) {
        TT.toast((s.broadcaster.displayName || s.broadcaster.login) + ' ist jetzt in ' + game, 5000);
      }
      fillLiveOsd(s);
    }).catch(function () { /* keep what we have */ });
  }

  function stopInfoTimer() { clearInterval(infoTimer); infoTimer = null; }

  // ---- connection loss and readable errors -------------------------------------------------
  // A tiny image from Twitch's CDN tells "no internet" apart from a problem with the stream
  // (requests through the local service fail with 502 either way).
  function checkOnline(cb) {
    var img = new Image(), done = false;
    var timer = setTimeout(function () { finish(false); }, 4000);
    function finish(ok) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      img.onload = img.onerror = null;
      cb(ok);
    }
    img.onload = function () { finish(true); };
    img.onerror = function () { finish(false); };
    img.src = 'https://static-cdn.jtvnw.net/jtv-static/404_preview-10x10.png?' + Date.now();
  }

  // Waits (without giving up) until the internet is back, then calls then().
  function waitForNetwork(my, then) {
    setStatus('Keine Internetverbindung – warte auf Verbindung …');
    (function poll() {
      checkOnline(function (ok) {
        if (my !== session) return;
        if (!ok) { setTimeout(function () { if (my === session) poll(); }, 3000); return; }
        TT.toast('Verbindung ist wieder da');
        then();
      });
    })();
  }

  // Playlist answers Twitch uses for blocked content, e.g.
  // [{"error":"Content Restricted In Region","error_code":"content_geoblocked"}].
  function blockedReason(code, body) {
    var s = String(body || ''), what = current && current.vod ? 'Dieses Video' : 'Dieser Stream';
    if (/geoblock|restricted in region/i.test(s)) return what + ' ist in deinem Land nicht verfügbar';
    if (/vod_manifest_restricted|unauthorized_entitlements|subscri/i.test(s)) return what + ' ist nur für Abonnenten des Kanals';
    if (code === 404 && current && current.vod) return 'Dieses Video gibt es nicht mehr';
    return null;
  }

  function failText(details) {
    var what = /manifest|level/i.test(details || '') ? 'konnte nicht geladen werden'
      : /frag/i.test(details || '') ? 'kommt gerade nicht an' : 'ist fehlgeschlagen';
    return (current && current.vod ? 'Das Video ' : 'Der Stream ') + what +
      '. Mit Zurück schließen und noch einmal öffnen.';
  }

  function isNetworkError(err) {
    return !err.status ? /^(Network error|Timeout)$/.test(String(err.message)) : err.status >= 502;
  }

  // ---- watchdog for frozen playback ------------------------------------------------------
  // The picture can freeze without hls.js reporting an error (e.g. the TV's decoder hangs).
  // If the time stands still for 12 s while nothing explains it (paused, loading, waiting
  // for the internet, ad break), reload; if it freezes again soon after, one quality lower.
  var watch = { last: -1, since: 0, reloads: [] };

  function watchdog() {
    var now = Date.now();
    var explained = !current || video.paused || video.ended || pausedAt || scrub.active || compose ||
      now - startedAt < 15000 || $('player-status').textContent || (ctrl && ctrl.adActive);
    if (explained || video.currentTime !== watch.last) {
      watch.last = video.currentTime;
      watch.since = now;
      return;
    }
    if (now - watch.since < 12000) return;
    watch.since = now;
    watch.reloads = watch.reloads.filter(function (t) { return now - t < 120000; });
    watch.reloads.push(now);
    TT.log('watchdog: playback frozen, reloading');
    if (watch.reloads.length > 1) dropQuality();
    else TT.toast('Das Bild war eingefroren – wird neu geladen');
    restart();
  }

  // Reconnect; videos continue where they were.
  function restart() {
    if (current && current.vod && !current.clip && video.currentTime > 0) {
      savePos();
      current.startAt = Math.floor(video.currentTime);
      current.startDone = false;
    }
    play(true);
  }

  function destroyHls() {
    soundStop();
    if (hls) { try { hls.destroy(); } catch (e) { /* ignore */ } }
    hls = null;
  }

  // ---- VOD resume positions --------------------------------------------------
  function savedPos(id) { return (TT.store.get('vodPos', {}) || {})[id] || 0; }

  function savePos() {
    if (!current || !current.vod || current.clip || !video.currentTime) return;
    var all = TT.store.get('vodPos', {}) || {};
    var keys = Object.keys(all);
    if (keys.length > 50) delete all[keys[0]];
    var dur = video.duration || current.vod.lengthSeconds || 0;
    if (dur && video.currentTime > dur - 60) delete all[current.vod.id];
    else all[current.vod.id] = Math.floor(video.currentTime);
    TT.store.set('vodPos', all);
  }

  function startHls(my, loaderCtrl, src, isVod) {
    // fMP4 segments (Enhanced Broadcasting, live and VOD) are repackaged as TS, see fmp4ts.js.
    var conv = new TT.fmp4ts.Converter();
    if (isVod) vodMaps = {};
    var latency = TT.store.get('latency', 'low');
    var cfg = {
      pLoader: makePlaylistLoader(loaderCtrl),
      // Distance to the live edge in seconds. Not in segments: Twitch announces a target
      // duration of 6 s for its 2 s segments, so "2 segments" meant 12 s behind live.
      // 'low' ~6 s, 'normal' ~10 s (more buffer for slow TVs).
      liveSyncDuration: latency === 'normal' ? 10 : 6,
      // Videos (also recordings still in progress) must never be pulled to the live edge.
      liveMaxLatencyDuration: isVod ? Infinity : latency === 'normal' ? 20 : 14,
      maxBufferLength: isVod ? 30 : 20,
      startPosition: isVod ? (current.startAt || 0) : -1,
      backBufferLength: 10,
      enableWorker: true,
      lowLatencyMode: false
    };
    cfg.fLoader = TT.fmp4ts.makeFragLoader(Hls, function (url) {
      return loaderCtrl ? loaderCtrl.mapFor(url) : (vodMaps[url] || null);
    }, conv, function (e) { TT.log('fmp4->ts failed', e); });
    hls = new Hls(cfg);
    captureAudio(hls);
    lastConv = conv;
    hls.on(Hls.Events.MANIFEST_PARSED, function () {
      // Fixed quality from Settings: the best level at or below the chosen height.
      var q = TT.store.get('quality', 'auto');
      if (q !== 'auto' && hls.levels && hls.levels.length) {
        var pick = -1, lowest = 0;
        hls.levels.forEach(function (l, i) {
          if (l.height <= +q && (pick < 0 || l.height > hls.levels[pick].height)) pick = i;
          if (l.height < hls.levels[lowest].height) lowest = i;
        });
        hls.currentLevel = pick >= 0 ? pick : lowest;
      }
      applyCap();
      if (isVod && current.startAt > 30) TT.toast('Weiter bei ' + fmtTime(current.startAt));
      video.playbackRate = speed;
      var p = video.play();
      if (p && p.catch) p.catch(function () { /* autoplay blocked: user presses play */ });
      soundUpdate();
    });
    hls.on(Hls.Events.FRAG_BUFFERED, function () {
      if (my !== session) return;
      retries = 0;
      // Recordings still in progress load like live streams and ignore startPosition:
      // put the video where it should start once the first piece is there.
      if (isVod && !current.startDone) {
        current.startDone = true;
        if (Math.abs(video.currentTime - (current.startAt || 0)) > 15) video.currentTime = current.startAt || 0;
      }
      if (!video.paused || !pausedAt) setStatus('');
    });
    hls.on(Hls.Events.ERROR, function (ev, data) {
      if (my !== session) return;
      if (!data.fatal) {
        if (data.details === Hls.ErrorDetails.BUFFER_STALLED_ERROR) noteStall();
        return;
      }
      TT.log('hls fatal error', data.type, data.details);
      if (data.type === Hls.ErrorTypes.MEDIA_ERROR && retries < 3) {
        retries++;
        hls.recoverMediaError();
        return;
      }
      var code = data.response && data.response.code;
      if (!isVod && code === 404) {
        setStatus('Der Stream ist offline');
        destroyHls();
        checkRaid(true);
        offerRecording();
        return;
      }
      var reason = blockedReason(code, data.response && data.response.text);
      if (reason) {
        setStatus(reason);
        destroyHls();
        return;
      }
      // Without internet: wait for it, however long. Otherwise retry, from the second
      // attempt one quality level lower.
      checkOnline(function (ok) {
        if (my !== session) return;
        if (!ok) { waitForNetwork(my, restart); return; }
        if (retries < 4) {
          retries++;
          if (retries >= 2) dropQuality();
          setStatus('Verbinde neu …');
          setTimeout(function () { if (my === session) restart(); }, 2000 * retries);
        } else {
          setStatus(failText(data.details));
          destroyHls();
        }
      });
    });
    hls.attachMedia(video);
    hls.loadSource(src);
  }

  function playLive(my, stream) {
    var login = stream.broadcaster.login;
    setStatus((stream.broadcaster.displayName || login) + ' wird geladen …');
    ctrl = new TT.adblock.AdController({
      fetchText: fetchText,
      backupMasterUrl: function (type) {
        return TT.api.playbackToken(login, type, true).then(function (t) {
          return TT.api.usherUrl(login, t);
        });
      },
      onAdState: function (active, how) {
        TT.log('ad state', active, how);
        if (active) TT.toast(how === 'backup' ? 'Werbung blockiert' : 'Werbung blockiert – der Stream geht nach der Pause weiter');
        updateBadges();
      }
    });
    return TT.api.playbackToken(login, 'site', false).catch(function () {
      return TT.api.playbackToken(login, 'site', true);
    }).then(function (token) {
      if (my !== session) return;
      var info = {};
      try { info = JSON.parse(token.value); } catch (e) { /* ignore */ }
      if (info.authorization && info.authorization.forbidden) {
        throw new Error(blockedReason(0, info.authorization.reason) ||
          'Dieser Stream ist nicht verfügbar: ' + (info.authorization.reason || 'gesperrt'));
      }
      var src = TT.api.usherUrl(login, token);
      return TT.loadHls().then(function () { if (my === session) startHls(my, ctrl, src, false); });
    });
  }

  function playVod(my, vod) {
    setStatus('Video wird geladen …');
    ctrl = null;
    return TT.api.vodToken(vod.id).then(null, function (err) {
      if (isNetworkError(err)) throw err;
      throw new Error('Dieses Video ist nicht verfügbar (' + (err.message || err) + '). Vielleicht nur für Abonnenten.');
    }).then(function (token) {
      if (my !== session) return;
      return vodSource(vod.id, token).then(function (src) {
        if (my !== session) return;
        return TT.loadHls().then(function () { if (my === session) startHls(my, null, src, true); });
      });
    });
  }

  // Twitch's usher at times answers every VOD request with error 500 (seen in October 2026).
  // The playlists are also on the CDN without a token, under the path of the VOD's seek
  // previews; then the app writes the master playlist itself.
  var CDN_LEVELS = [['chunked', 1920, 1080, 60, 8000000], ['1080p60', 1920, 1080, 60, 6000000],
    ['1080p30', 1920, 1080, 30, 4500000], ['720p60', 1280, 720, 60, 3500000], ['720p30', 1280, 720, 30, 2500000],
    ['480p30', 852, 480, 30, 1400000], ['360p30', 640, 360, 30, 700000], ['160p30', 284, 160, 30, 250000]];

  function vodSource(id, token) {
    var usher = TT.api.vodUsherUrl(id, token);
    return TT.http('GET', usher, { proxy: true }).then(function (r) {
      knownPlaylists = {};
      knownPlaylists[usher] = r.text;
      return usher;
    }, function (err) {
      if (!err.status) throw err;
      TT.log('usher ' + err.status + ', VOD from the CDN');
      return vodCdnMaster(id).then(function (master) {
        if (!master) throw new Error('Twitch liefert dieses Video gerade nicht aus (Fehler ' + err.status + ').');
        var url = 'https://usher.ttvnw.net/vod/' + encodeURIComponent(id) + '.m3u8?twizen=cdn';
        knownPlaylists = {};
        knownPlaylists[url] = master;
        return url;
      });
    });
  }

  function vodCdnMaster(id) {
    return TT.api.vodCdnBase(id).then(function (base) {
      if (!base) return [];
      return Promise.all(CDN_LEVELS.map(function (l) {
        var url = base + '/' + l[0] + '/index-dvr.m3u8';
        return fetchText(url).then(function (text) { return { l: l, url: url, text: text }; }, function () { return null; });
      }));
    }).then(function (found) {
      found = found.filter(Boolean);
      var real1080 = found.some(function (f) { return f.l[0] !== 'chunked' && f.l[2] === 1080; });
      return Promise.all(found.map(function (f) {
        if (f.l[0] !== 'chunked') return f;
        if (real1080) return null;
        return isHevc(f).then(function (h) { return h ? null : f; });
      }));
    }).then(function (found) {
      found = found.filter(Boolean);
      if (!found.length) return null;
      return ['#EXTM3U'].concat(found.map(function (f) {
        var l = f.l;
        return '#EXT-X-STREAM-INF:BANDWIDTH=' + l[4] + ',RESOLUTION=' + l[1] + 'x' + l[2] + ',FRAME-RATE=' + l[3] + '.000\n' + f.url;
      })).join('\n');
    });
  }

  // The source rendition ("chunked") can be HEVC (Enhanced Broadcasting), which these TVs can't
  // play. MPEG-TS on Twitch is always H.264; fMP4 tells by its init segment.
  function isHevc(f) {
    var m = /#EXT-X-MAP:URI="([^"]+)"/.exec(f.text);
    if (!m) return Promise.resolve(false);
    return TT.http('GET', absolute(m[1], f.url), { proxy: true }).then(function (r) {
      return /hvc1|hev1/.test(r.text);
    }, function () { return false; });
  }

  function play(keepRetries) {
    var my = ++session;
    destroyHls();
    if (!keepRetries) { retries = 0; stalls = []; sndFailed = false; }
    startedAt = Date.now();
    var p = current.clip ? playClip(my) : current.vod ? playVod(my, current.vod) : playLive(my, current.stream);
    p.catch(function (err) {
      if (my !== session) return;
      if (!isNetworkError(err)) { setStatus(String(err.message || err)); return; }
      checkOnline(function (ok) {
        if (my !== session) return;
        if (ok) setStatus('Twitch ist gerade nicht erreichbar. Mit Zurück schließen und später noch einmal öffnen.');
        else waitForNetwork(my, restart);
      });
    });
  }

  function seekBy(sec) {
    if (!current || !current.vod) return;
    var dur = video.duration || current.vod.lengthSeconds || 0;
    video.currentTime = Math.max(0, Math.min(dur ? dur - 2 : Infinity, video.currentTime + sec));
    showOsd();
  }

  // ---- raids ---------------------------------------------------------------------
  // While a live stream plays, check every 20 s whether the channel is raiding. When the
  // stream then ends (or Twitch already took it offline), switch to the raid target.
  var raidTimer = null, raidTarget = null;

  function stopRaidWatch() { clearInterval(raidTimer); raidTimer = null; raidTarget = null; }

  function checkRaid(ended) {
    if (!current || !current.stream) return;
    var login = current.stream.broadcaster.login, my = session;
    TT.api.raidState(login).then(function (r) {
      if (my !== session) return;
      if (r.target && (!raidTarget || raidTarget.login !== r.target.login)) {
        raidTarget = r.target;
        TT.toast('Raid zu ' + (r.target.displayName || r.target.login) + ' …', 6000);
      }
      if ((ended || !r.live) && raidTarget) followRaid();
    }).catch(function () { /* try again next time */ });
  }

  function followRaid() {
    var t = raidTarget;
    stopRaidWatch();
    TT.api.channel(t.login).then(function (u) {
      if (!u || !u.stream) { setStatus('Der Stream ist offline'); return; }
      u.stream.broadcaster = { login: u.login, displayName: u.displayName, profileImageURL: u.profileImageURL };
      TT.toast('Raid: weiter zu ' + (u.displayName || u.login), 5000);
      TT.player.open(u.stream, [u.stream]);
    }).catch(function () { setStatus('Der Stream ist offline'); });
  }

  function startRaidWatch() {
    stopRaidWatch();
    raidTimer = setInterval(function () { checkRaid(false); }, 20000);
  }

  function setVodClass(isVod, isClip) {
    var p = $('player');
    p.className = p.className.replace(/\bis-(vod|clip)\b/g, '').trim() + (isVod ? ' is-vod' : '') + (isClip ? ' is-clip' : '');
  }

  // Video element events.
  function bindVideo() {
    video.addEventListener('timeupdate', updateProgress);
    video.addEventListener('playing', function () { if (current && current.clip) setStatus(''); });
    video.addEventListener('ended', function () {
      if (current && current.clip) {
        var list = current.clips || [], i = list.indexOf(current.clip);
        if (i >= 0 && i < list.length - 1) TT.player.openClip(list[i + 1], list);
      }
    });
    // Clips play as plain MP4, without hls.js and its error handling.
    video.addEventListener('error', function () {
      if (!current || !current.clip) return;
      var my = session;
      checkOnline(function (ok) {
        if (my !== session) return;
        if (ok) setStatus('Der Clip konnte nicht abgespielt werden');
        else waitForNetwork(my, restart);
      });
    });
  }

  TT.player = {
    init: function () {
      video = $('video');
      bindVideo();
      setInterval(watchdog, 2000);
      TT.chat.init();
    },

    open: function (stream, list) {
      hideOsd();
      closeCompose();
      cancelScrub();
      current = { stream: stream };
      speed = 1;
      extras = { chapters: [], seek: null, hype: [] };
      playlist = list || [stream];
      index = Math.max(0, playlist.indexOf(stream));
      setVodClass(false);
      fillLiveOsd(stream);
      showOsd();
      updateBadges();
      play();
      TT.chat.open(stream.broadcaster.login);
      TT.recent.add(stream.broadcaster);
      startRaidWatch();
      loadFollowState();
      stopInfoTimer();
      refreshLiveInfo();
      infoTimer = setInterval(refreshLiveInfo, 60000);
    },

    // vod: { id, title, lengthSeconds, publishedAt, game }; owner: { login, displayName, profileImageURL }
    // opts.fromStart: ignore the saved position (e.g. "Von Anfang an").
    openVod: function (vod, owner, opts) {
      hideOsd();
      closeCompose();
      cancelScrub();
      stopRaidWatch();
      stopInfoTimer();
      if (current && current.vod && !current.clip) savePos();
      var pos = opts && opts.fromStart ? 0 : TT.vodPos(vod.id);
      current = { vod: vod, owner: owner, startAt: pos > 30 ? pos : 0 };
      speed = 1;
      playlist = [];
      TT.recent.add(owner);
      TT.watched.add(vod, owner);
      TT.chat.openReplay(vod.id, owner.login);
      loadFollowState();
      setVodClass(true);
      fillOsd(vod.title, owner, [vod.game ? vod.game.displayName : '',
        vod.publishedAt ? new Date(vod.publishedAt).toLocaleDateString('de-DE') : ''].filter(Boolean).join('  ·  '));
      showOsd();
      updateBadges();
      play();
      loadExtras(vod, session);
      clearInterval(saveTimer);
      saveTimer = setInterval(savePos, 10000);
    },

    // Clip (MP4) from `list`; the next one follows automatically when it ends.
    openClip: function (clip, list) {
      hideOsd();
      closeCompose();
      cancelScrub();
      stopRaidWatch();
      stopInfoTimer();
      TT.chat.close();
      clearInterval(saveTimer);
      var owner = clip.broadcaster || {};
      current = { vod: { id: 'clip:' + clip.slug, title: clip.title, lengthSeconds: clip.durationSeconds, game: clip.game },
        owner: owner, clip: clip, clips: list || [clip] };
      extras = { chapters: [], seek: null, hype: [] };
      renderMarks();
      playlist = [];
      loadFollowState();
      setVodClass(true, true);
      var n = current.clips.length;
      fillOsd(clip.title, owner, [clip.game ? clip.game.displayName : '', TT.fmtCount(clip.viewCount) + ' Aufrufe',
        n > 1 ? 'Clip ' + (current.clips.indexOf(clip) + 1) + ' von ' + n : ''].filter(Boolean).join('  ·  '));
      showOsd();
      updateBadges();
      play();
    },

    close: function () {
      stopRaidWatch();
      closeCompose();
      stopInfoTimer();
      if (statsTimer) toggleStats();
      cancelScrub();
      hideOsd();
      savePos();
      clearInterval(saveTimer);
      session++;
      destroyHls();
      TT.chat.close();
      current = null;
      ctrl = null;
      extras = { chapters: [], seek: null, hype: [] };
      setVodClass(false);
      try { video.pause(); video.removeAttribute('src'); video.load(); } catch (e) { /* ignore */ }
      setStatus('');
    },

    currentLogin: function () { return current && current.stream ? current.stream.broadcaster.login : null; },
    // Seconds the live picture runs behind the playlist's live edge (0 when unknown).
    latency: function () { return hls && current && current.stream && hls.latency > 0 ? hls.latency : 0; },

    // Set by the views: opens a channel page from the player's "Channel" button.
    onChannelPage: null,
    // Set by the views: the followed list changed (follow / unfollow).
    onFollowChange: null,

    // Returns true if the key was handled. `repeat` is true while a key is held down.
    key: function (k, repeat) {
      if (compose) {
        if (k === 'back') closeCompose();
        else if (k === 'left' || k === 'right' || k === 'up' || k === 'down') TT.focus.move(k);
        else if (k === 'enter') TT.focus.activate();
        return true;
      }
      var isVod = !!(current && current.vod);
      // "Mehr" menu: up/down choose, OK runs (toggles keep the menu open), Back/left/right close it.
      if (moreOpen && osdVisible) {
        if (k === 'up' || k === 'down') {
          moreIndex = Math.max(0, Math.min(moreItems.length - 1, moreIndex + (k === 'down' ? 1 : -1)));
          showOsd();
          return true;
        }
        if (k === 'enter') {
          var item = moreItems[moreIndex];
          if (item && !item.stay) moreOpen = false;
          if (item) item.fn();
          if (current && !compose) showOsd();
          return true;
        }
        if (k === 'back' || k === 'left' || k === 'right') { moreOpen = false; showOsd(); return true; }
      }
      switch (k) {
        case 'back':
          // First Back hides the controls; the next one closes the player.
          if (osdVisible) { cancelScrub(); hideOsd(); return true; }
          return false;
        case 'left':
        case 'right': {
          var dir = k === 'left' ? -1 : 1;
          if (isVod && (!osdVisible || row === 'scrub')) { scrubKey(dir, repeat); return true; }
          if (!osdVisible) { showOsd(); return true; }
          btnIndex = Math.max(0, Math.min(buttons.length - 1, btnIndex + dir));
          showOsd();
          return true;
        }
        case 'up':
          if (osdVisible && isVod && row === 'buttons') row = 'scrub';
          showOsd();
          return true;
        case 'down':
          if (osdVisible && row === 'scrub') { commitScrub(); row = 'buttons'; }
          showOsd();
          return true;
        case 'enter':
          if (!osdVisible) { showOsd(); return true; }
          if (row === 'scrub') { if (scrub.active) commitScrub(); else togglePause(); return true; }
          if (buttons[btnIndex]) buttons[btnIndex].fn();
          if (current && !compose) showOsd();
          return true;
        case 'rewind':
        case 'ff':
          if (isVod) scrubKey(k === 'rewind' ? -1 : 1, true);
          return true;
        case 'playpause': togglePause(); return true;
        case 'play': TT.player.resume(); return true;
        case 'pause': TT.player.pause(); return true;
        case 'info':
          toggleStats();
          return true;
        case 'red':
          TT.toast(current && current.clip ? 'Bei Clips gibt es keinen Chat' : 'Chat: ' + TT.chat.cycle());
          if (osdVisible) showOsd();
          return true;
        case 'green':
          cycleCompressor();
          if (osdVisible) showOsd();
          return true;
        case 'yellow': {
          var owner = isVod ? current.owner : current && current.stream.broadcaster;
          if (owner && owner.login && TT.player.onChannelPage) TT.player.onChannelPage(owner.login);
          return true;
        }
        case 'chup':
        case 'chdown':
          if (current && current.clip) { switchClip(k === 'chup' ? -1 : 1); return true; }
          if (isVod) { seekBy(k === 'chup' ? 300 : -300); return true; }
          switchStream(k === 'chup' ? -1 : 1);
          return true;
      }
      return false;
    },

    // Physical keyboard (desktop testing / USB keyboards) while writing in the chat.
    typeKey: function (e) {
      if (!compose) return false;
      if (e.keyCode === 8) { composeDelete(); return true; }
      if (e.key && e.key.length === 1) { composeType(e.key); return true; }
      return false;
    },

    // Releasing a seek key commits the previewed position.
    keyUp: function (k) {
      if ((k === 'left' || k === 'right' || k === 'rewind' || k === 'ff') && scrub.active) commitScrub();
    },

    pause: function () {
      video.pause();
      pausedAt = Date.now();
      setStatus('Pausiert');
      showOsd(60000);
    },

    resume: function () {
      setStatus('');
      // Live: jump back to the live edge after a long pause.
      if (current && !current.vod && pausedAt && Date.now() - pausedAt > 8000 &&
          hls && hls.liveSyncPosition) video.currentTime = hls.liveSyncPosition;
      pausedAt = 0;
      var p = video.play();
      if (p && p.catch) p.catch(function () { /* ignore */ });
      showOsd();
    }
  };
})();

/* ---- focus.js ---- */
;// Spatial D-pad navigation between `.focusable` elements inside a scope element.
(function () {
  var current = null;
  var scopeFn = function () { return document.body; };

  function visible(el) {
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  // The scope can be one element or a list (sidebar + current page), so hidden pages
  // further down the stack aren't measured on every key press.
  function candidates() {
    var scope = scopeFn(), roots = scope instanceof Array ? scope : [scope], out = [];
    for (var r = 0; r < roots.length; r++) {
      if (!roots[r]) continue;
      var all = roots[r].querySelectorAll('.focusable');
      for (var i = 0; i < all.length; i++) if (visible(all[i])) out.push(all[i]);
    }
    return out;
  }

  function trackOf(el) {
    var p = el.parentNode;
    return p && p.classList && p.classList.contains('track') ? p : null;
  }

  // Scrolls just enough to show `el`: sideways inside a carousel, and vertically so the
  // focused row (with its heading) stays on screen. No jumping to the centre.
  function reveal(el) {
    var track = trackOf(el);
    if (track) {
      var pad = track.clientWidth * 0.03, left = el.offsetLeft, right = left + el.offsetWidth;
      if (left - track.scrollLeft < pad) track.scrollLeft = Math.max(0, left - pad);
      else if (right - track.scrollLeft > track.clientWidth - pad) track.scrollLeft = right - track.clientWidth + pad;
    }
    var box = el.closest('.view, .side-lists');
    if (!box) { if (el.scrollIntoViewIfNeeded) el.scrollIntoViewIfNeeded(false); return; }
    var anchor = el.closest('.row') || el;
    var b = box.getBoundingClientRect(), m = b.height * 0.06;
    var e = el.getBoundingClientRect();
    if (e.bottom > b.bottom - m) box.scrollTop += e.bottom - (b.bottom - m);
    var a = anchor.getBoundingClientRect();
    if (a.top < b.top + m) box.scrollTop -= (b.top + m) - a.top;
  }

  function set(el) {
    if (!el) return;
    if (current && current !== el) current.classList.remove('focused');
    current = el;
    el.classList.add('focused');
    reveal(el);
    TT.lazy();
    if (el.onfocusin2) el.onfocusin2();
  }

  // Pictures (img[data-src]) load only when they come near the screen. Tizen 3.0 has no
  // IntersectionObserver, but all scrolling here follows the focus, so checking after each
  // focus change (and after content is added) is enough.
  TT.lazy = function () {
    var imgs = document.querySelectorAll('img[data-src]');
    var H = window.innerHeight, W = window.innerWidth;
    for (var i = 0; i < imgs.length; i++) {
      var r = imgs[i].getBoundingClientRect();
      if (!r.width && !r.height) continue; // hidden page
      if (r.bottom > -H * 0.5 && r.top < H * 1.5 && r.right > -W * 0.3 && r.left < W * 1.3) {
        imgs[i].src = imgs[i].getAttribute('data-src');
        imgs[i].removeAttribute('data-src');
      }
    }
  };

  // Overlap of two 1-D ranges (0 if none).
  function overlap(a1, a2, b1, b2) {
    return Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));
  }

  function move(dir) {
    var list = candidates();
    if (!current || list.indexOf(current) < 0) { set(list[0]); return; }
    // Inside a carousel, left/right walk the cards; only the ends hand over to spatial
    // navigation (e.g. from the first card into the sidebar).
    var track = (dir === 'left' || dir === 'right') && trackOf(current);
    if (track) {
      var cards = [].slice.call(track.children).filter(function (c) { return c.classList.contains('focusable'); });
      var i = cards.indexOf(current) + (dir === 'right' ? 1 : -1);
      if (i >= 0 && i < cards.length) { set(cards[i]); return; }
      if (dir === 'right') return;
    }
    // In the sidebar's scrolling lists, up/down walk the entries in order: entries scrolled
    // out of view sit geometrically behind the fixed menu, so spatial search would jump
    // into the menu too early. Only the first entry hands over to the menu.
    var lists = (dir === 'up' || dir === 'down') && current.closest('.side-lists');
    if (lists) {
      var entries = [].filter.call(lists.querySelectorAll('.focusable'), visible);
      var j = entries.indexOf(current) + (dir === 'down' ? 1 : -1);
      if (j >= 0 && j < entries.length) {
        set(entries[j]);
        if (j === 0) lists.scrollTop = 0; // show the heading above the first entry too
        return;
      }
      if (dir === 'down') return;
    }
    var c = current.getBoundingClientRect();
    var best = null, bestScore = Infinity;
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      if (el === current) continue;
      var r = el.getBoundingClientRect();
      var primary, secondary, ov;
      if (dir === 'right' || dir === 'left') {
        primary = dir === 'right' ? r.left - c.right : c.left - r.right;
        if (primary < -c.width / 2) continue;
        ov = overlap(c.top, c.bottom, r.top, r.bottom);
        secondary = ov > 0 ? 0 : Math.abs((r.top + r.bottom) / 2 - (c.top + c.bottom) / 2);
      } else {
        primary = dir === 'down' ? r.top - c.bottom : c.top - r.bottom;
        if (primary < -c.height / 2) continue;
        ov = overlap(c.left, c.right, r.left, r.right);
        secondary = ov > 0 ? Math.abs(r.left - c.left) / 4 : Math.abs((r.left + r.right) / 2 - (c.left + c.right) / 2);
      }
      var score = Math.max(0, primary) + secondary * 3;
      if (score < bestScore) { bestScore = score; best = el; }
    }
    if (best) set(best);
  }

  TT.focus = {
    get: function () { return current; },
    set: set,
    move: move,
    setScope: function (fn) { scopeFn = fn; },
    first: function () { set(candidates()[0]); },
    activate: function () {
      if (current && current.onselect2) current.onselect2();
    }
  };

  // Makes `el` focusable; `onSelect` runs on OK/Enter (and mouse click on desktop).
  TT.focusable = function (el, onSelect) {
    el.classList.add('focusable');
    el.onselect2 = onSelect;
    el.addEventListener('click', function () { set(el); if (onSelect) onSelect(); });
    return el;
  };
})();

/* ---- views.js ---- */
;// Screens, sidebar and navigation stack (Twitch-style TV layout, German UI).
(function () {
  var main, stack = []; // entries: { name, el, lastFocus, onLeave }
  var sideItems = {};
  var followBox = null, followTimer = null, recBox = null, intlBox = null, prevLive = null;
  var favBox = null, favHead = null, prevFavLive = null;
  var focusContent = false; // set when a page is opened from the sidebar menu

  var NAV = [
    ['home', 'Startseite', 'M12 3l9 8h-3v9h-5v-6h-2v6H6v-9H3z'],
    ['live', 'Live-Kanäle', 'M3 6h13v12H3zM17.5 10.5L22 7v10l-4.5-3.5z'],
    ['following', 'Folge ich', 'M12 21l-1.4-1.3C5.4 15 2 12 2 8.4 2 5.4 4.4 3 7.4 3c1.7 0 3.4.8 4.6 2.1C13.2 3.8 14.9 3 16.6 3 19.6 3 22 5.4 22 8.4c0 3.6-3.4 6.6-8.6 11.3z'],
    ['categories', 'Kategorien', 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z'],
    ['program', 'TV-Programm', 'M4 5h16v15H4V5zm2 5v8h12v-8H6zM7 3h2v4H7zm8 0h2v4h-2zM8 12h4v3H8z'],
    ['search', 'Suche', 'M10 3a7 7 0 015.6 11.2l5.1 5.1-1.4 1.4-5.1-5.1A7 7 0 1110 3zm0 2a5 5 0 100 10 5 5 0 000-10z'],
    ['settings', 'Einstellungen', 'M19.4 13a7.6 7.6 0 000-2l2.1-1.6-2-3.5-2.5 1a7 7 0 00-1.7-1L15 3h-4l-.4 2.6a7 7 0 00-1.7 1l-2.5-1-2 3.5L6.6 11a7.6 7.6 0 000 2l-2.1 1.6 2 3.5 2.5-1a7 7 0 001.7 1L11 21h4l.4-2.6a7 7 0 001.7-1l2.5 1 2-3.5zM13 15.5a3.5 3.5 0 110-7 3.5 3.5 0 010 7z']
  ];

  // ---- navigation ---------------------------------------------------------
  function top() { return stack[stack.length - 1]; }

  function push(name, el, onLeave) {
    var t = top();
    if (t) { t.lastFocus = TT.focus.get(); t.el.style.display = 'none'; }
    el.className += ' view';
    main.appendChild(el);
    stack.push({ name: name, el: el, onLeave: onLeave });
    highlightSide();
  }

  // The home page is rebuilt when you come back to it after 5 minutes or more.
  var HOME_STALE_MS = 5 * 60 * 1000;
  function homeIsStale() {
    var t = top();
    return stack.length === 1 && t && t.name === 'home' && Date.now() - (t.loadedAt || 0) > HOME_STALE_MS;
  }
  function rebuildHome() {
    var t = stack.pop();
    if (t.onLeave) t.onLeave();
    main.removeChild(t.el);
    focusContent = true;
    views.home();
  }

  function pop() {
    if (stack.length <= 1) return false;
    var t = stack.pop();
    if (t.onLeave) t.onLeave();
    if (!t.player) main.removeChild(t.el);
    if (homeIsStale()) {
      highlightSide();
      if (t.player) { setZap(false); markPlaying(null); }
      rebuildHome();
      return true;
    }
    var prev = top();
    prev.el.style.display = '';
    highlightSide();
    if (t.player) { setZap(false); markPlaying(null); }
    var lf = prev.lastFocus;
    // The sidebar may have been re-rendered meanwhile: find the same channel again.
    if (lf && !document.body.contains(lf) && lf.getAttribute && lf.getAttribute('data-login')) {
      lf = document.querySelector('#sidebar [data-login="' + lf.getAttribute('data-login') + '"]');
    }
    if (lf && document.body.contains(lf)) TT.focus.set(lf);
    else focusFirstIn(prev.el);
    return true;
  }

  function resetTo(name, build) {
    while (stack.length) {
      var t = stack.pop();
      if (t.onLeave) t.onLeave();
      if (!t.player) main.removeChild(t.el);
    }
    build();
  }

  function focusFirstIn(el) {
    var f = el.querySelector('.focusable');
    if (f) TT.focus.set(f);
  }

  function inSidebar() {
    var f = TT.focus.get();
    return !!(f && document.body.contains(f) && f.closest('#sidebar'));
  }

  function highlightSide() {
    var root = stack.length ? stack[0].name : '';
    for (var k in sideItems) {
      if (sideItems.hasOwnProperty(k)) sideItems[k].classList.toggle('active', k === root);
    }
  }

  // ---- building blocks ------------------------------------------------------
  function section(title, sub) {
    var el = TT.el('section');
    if (title) el.appendChild(TT.el('h1', 'view-title', title));
    if (sub) el.appendChild(TT.el('div', 'view-sub', sub));
    return el;
  }

  function message(el, text) {
    var m = el.querySelector('.message');
    if (!m) { m = TT.el('div', 'message'); el.appendChild(m); }
    m.textContent = text;
    m.style.display = text ? '' : 'none';
  }

  function icon(path) {
    var s = TT.el('span', 'ico');
    s.innerHTML = '<svg viewBox="0 0 24 24"><path d="' + path + '"/></svg>';
    return s;
  }

  // Broken or missing pictures leave the grey placeholder instead of a broken-image icon.
  function hideBroken(img) { img.onerror = function () { img.style.visibility = 'hidden'; }; return img; }

  // Sets the picture lazily (see TT.lazy); call TT.lazy() after adding content.
  function lazySrc(img, url) { if (url) img.setAttribute('data-src', url); return img; }

  function avatar(url, cls) {
    return lazySrc(hideBroken(TT.el('img', 'av' + (cls ? ' ' + cls : ''))), url);
  }

  // Row heading with the first part in Twitch purple: heading('Live-Kanäle', ', denen du folgst').
  function heading(accent, rest) {
    var h = TT.el('h2', 'row-h');
    h.appendChild(TT.el('b', '', accent));
    if (rest) h.appendChild(document.createTextNode(rest));
    return h;
  }

  // Horizontal carousel (scrolls sideways as focus moves) or a wrapping grid.
  function carousel(accent, rest, cards) {
    var row = TT.el('div', 'row');
    row.appendChild(heading(accent, rest));
    var track = TT.el('div', 'track');
    cards.forEach(function (c) { track.appendChild(c); });
    row.appendChild(track);
    return row;
  }

  function grid(cards, cls) {
    var g = TT.el('div', 'grid' + (cls ? ' ' + cls : ''));
    cards.forEach(function (c) { g.appendChild(c); });
    return g;
  }

  function streamCard(s, list) {
    var b = s.broadcaster || {};
    var card = TT.el('div', 'card stream-card');
    var lift = TT.el('div', 'lift');
    var thumb = TT.el('div', 'thumb');
    var img = hideBroken(TT.el('img'));
    lazySrc(img, s.previewImageURL ? s.previewImageURL + '?t=' + Math.floor(Date.now() / 300000) : '');
    thumb.appendChild(img);
    thumb.appendChild(TT.el('span', 'pill live', 'Live'));
    thumb.appendChild(TT.el('span', 'pill viewers count', TT.fmtViewers(s.viewersCount)));
    lift.appendChild(thumb);
    card.appendChild(lift);
    var info = TT.el('div', 'card-info');
    info.appendChild(avatar(b.profileImageURL));
    var txt = TT.el('div', 'card-text');
    txt.appendChild(TT.el('div', 'card-title', s.title || ''));
    txt.appendChild(TT.el('div', 'card-sub', b.displayName || b.login));
    if (s.game) txt.appendChild(TT.el('div', 'card-sub', s.game.displayName));
    info.appendChild(txt);
    card.appendChild(info);
    TT.focusable(card, function () { openPlayer(s, list); });
    // Yellow on a stream card opens that channel's page (past broadcasts).
    card.onyellow = function () { views.channel(b.login); };
    return card;
  }

  function fmtDuration(s) {
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return (h ? h + ':' + (m < 10 ? '0' : '') : '') + m + ':' + (sec < 10 ? '0' : '') + sec;
  }

  function videoCard(v, owner) {
    var card = TT.el('div', 'card stream-card video-card');
    var lift = TT.el('div', 'lift');
    var thumb = TT.el('div', 'thumb');
    var img = hideBroken(TT.el('img'));
    lazySrc(img, v.previewThumbnailURL);
    thumb.appendChild(img);
    if (v.publishedAt) thumb.appendChild(TT.el('span', 'pill viewers', TT.fmtAgo(v.publishedAt)));
    thumb.appendChild(TT.el('span', 'pill dur', fmtDuration(v.lengthSeconds || 0)));
    if (v.status === 'RECORDING') thumb.appendChild(TT.el('span', 'pill live', 'Läuft'));
    // How far it has been watched.
    var pos = TT.vodPos(v.id);
    if (pos && v.lengthSeconds) {
      var bar = TT.el('div', 'watched');
      bar.appendChild(TT.el('i')).style.width = Math.min(100, pos / v.lengthSeconds * 100) + '%';
      thumb.appendChild(bar);
    }
    lift.appendChild(thumb);
    card.appendChild(lift);
    var txt = TT.el('div', 'card-text pad');
    txt.appendChild(TT.el('div', 'card-title', v.title || 'Ohne Titel'));
    txt.appendChild(TT.el('div', 'card-sub', [v.viewCount ? TT.fmtCount(v.viewCount) + ' Aufrufe' : '',
      v.game ? v.game.displayName : ''].filter(Boolean).join(' · ')));
    card.appendChild(txt);
    return TT.focusable(card, function () { openVodPlayer(v, owner); });
  }

  // Clip: plays as MP4; the rest of `list` follows automatically.
  function clipCard(c, list) {
    var b = c.broadcaster || {};
    var card = TT.el('div', 'card stream-card clip-card');
    var lift = TT.el('div', 'lift');
    var thumb = TT.el('div', 'thumb');
    thumb.appendChild(lazySrc(hideBroken(TT.el('img')), c.thumbnailURL));
    thumb.appendChild(TT.el('span', 'pill viewers', TT.fmtCount(c.viewCount) + ' Aufrufe'));
    thumb.appendChild(TT.el('span', 'pill dur', fmtDuration(Math.round(c.durationSeconds || 0))));
    lift.appendChild(thumb);
    card.appendChild(lift);
    var info = TT.el('div', 'card-info');
    info.appendChild(avatar(b.profileImageURL));
    var txt = TT.el('div', 'card-text');
    txt.appendChild(TT.el('div', 'card-title', c.title || 'Clip'));
    txt.appendChild(TT.el('div', 'card-sub', (b.displayName || b.login || '') + (c.createdAt ? ' · ' + TT.fmtAgo(c.createdAt) : '')));
    if (c.game) txt.appendChild(TT.el('div', 'card-sub', c.game.displayName));
    info.appendChild(txt);
    card.appendChild(info);
    TT.focusable(card, function () { showPlayer(); TT.player.openClip(c, list); });
    card.onyellow = function () { if (b.login) views.channel(b.login); };
    return card;
  }

  function categoryCard(g, onPick) {
    var card = TT.el('div', 'card cat-card');
    var lift = TT.el('div', 'lift');
    var box = TT.el('div', 'box');
    var img = hideBroken(TT.el('img'));
    lazySrc(img, g.boxArtURL);
    box.appendChild(img);
    lift.appendChild(box);
    card.appendChild(lift);
    card.appendChild(TT.el('div', 'card-title', g.displayName || g.name));
    if (g.viewersCount) card.appendChild(TT.el('div', 'card-sub', TT.fmtViewers(g.viewersCount)));
    return TT.focusable(card, function () { if (onPick) onPick(); else views.category(g); });
  }

  // Round channel tile (offline channels, search results). c: { login, displayName, profileImageURL, stream? }
  function channelTile(c, playIfLive) {
    var card = TT.el('div', 'card chan-tile' + (c.stream ? ' is-live' : ''));
    var ring = TT.el('div', 'ring');
    ring.appendChild(avatar(c.profileImageURL));
    card.appendChild(ring);
    card.appendChild(TT.el('div', 'card-title', c.displayName || c.login));
    card.appendChild(TT.el('div', 'card-sub' + (c.stream ? ' live-text' : ''),
      c.stream ? 'Live' + (c.stream.game ? ' · ' + c.stream.game.displayName : '') : 'Offline'));
    return TT.focusable(card, function () {
      if (playIfLive && c.stream) openPlayer(c.stream, [c.stream]); else views.channel(c.login);
    });
  }

  function hero(s, list) {
    var b = s.broadcaster || {};
    var card = TT.el('div', 'hero');
    var thumb = TT.el('div', 'thumb');
    var img = hideBroken(TT.el('img'));
    img.src = (s.previewImageURL || '').replace('356x200', '712x400') + '?t=' + Math.floor(Date.now() / 300000);
    thumb.appendChild(img);
    thumb.appendChild(TT.el('span', 'pill live', 'Live'));
    thumb.appendChild(TT.el('span', 'pill viewers count', TT.fmtViewers(s.viewersCount)));
    card.appendChild(thumb);
    var body = TT.el('div', 'hero-body');
    body.appendChild(TT.el('div', 'hero-kicker', 'Empfohlen für dich'));
    var who = TT.el('div', 'hero-who');
    who.appendChild(avatar(b.profileImageURL));
    var names = TT.el('div');
    names.appendChild(TT.el('div', 'hero-name', b.displayName || b.login));
    if (s.game) names.appendChild(TT.el('div', 'hero-game', s.game.displayName));
    who.appendChild(names);
    body.appendChild(who);
    body.appendChild(TT.el('div', 'hero-title', s.title || ''));
    body.appendChild(TT.el('div', 'hero-watch', '▶  Jetzt ansehen'));
    card.appendChild(body);
    TT.focusable(card, function () { openPlayer(s, list); });
    card.onyellow = function () { views.channel(b.login); };
    return card;
  }

  var DAYS = ['So.', 'Mo.', 'Di.', 'Mi.', 'Do.', 'Fr.', 'Sa.'];
  function two(n) { return (n < 10 ? '0' : '') + n; }

  // One schedule entry: "Heute · 13:30–20:00 Uhr", title, category.
  function scheduleItem(seg) {
    var a = new Date(seg.startAt), e = seg.endAt ? new Date(seg.endAt) : null;
    var today = new Date(), tomorrow = new Date(Date.now() + 86400000);
    function same(x, y) { return x.toDateString() === y.toDateString(); }
    var day = same(a, today) ? 'Heute' : same(a, tomorrow) ? 'Morgen' :
      DAYS[a.getDay()] + ' ' + two(a.getDate()) + '.' + two(a.getMonth() + 1) + '.';
    var item = TT.el('div', 'sched-item');
    item.appendChild(TT.el('div', 'sched-day', day));
    item.appendChild(TT.el('div', 'sched-time', two(a.getHours()) + ':' + two(a.getMinutes()) +
      (e ? '–' + two(e.getHours()) + ':' + two(e.getMinutes()) : '') + ' Uhr'));
    if (seg.title) item.appendChild(TT.el('div', 'sched-title', seg.title));
    var cat = seg.categories && seg.categories[0];
    if (cat) item.appendChild(TT.el('div', 'sched-cat', cat.displayName || cat.name));
    return item;
  }

  // One day of the TV-Programm: a row per channel with its streams as blocks on a timeline
  // (at least 12–24 Uhr, widened to cover all streams of that day).
  function renderEpg(box, chans, dayOffset) {
    TT.clear(box);
    var day = new Date(Date.now() + dayOffset * 86400000);
    day.setHours(0, 0, 0, 0);
    var d0 = day.getTime(), d1 = d0 + 86400000;
    var rows = [], from = 12, to = 24;
    chans.forEach(function (c) {
      var segs = c.segments.map(function (seg) {
        var a = Date.parse(seg.startAt), e = seg.endAt ? Date.parse(seg.endAt) : a + 3 * 3600000;
        return { seg: seg, a: Math.max(a, d0), e: Math.min(e, d1) };
      }).filter(function (x) { return x.e > x.a && x.a < d1 && x.e > d0; });
      if (!segs.length) return;
      segs.forEach(function (x) {
        from = Math.min(from, Math.floor((x.a - d0) / 3600000));
        to = Math.max(to, Math.ceil((x.e - d0) / 3600000));
      });
      rows.push({ c: c, segs: segs });
    });
    if (!rows.length) { box.appendChild(TT.el('div', 'message', 'An diesem Tag ist nichts geplant.')); return; }
    var span = (to - from) * 3600000, t0 = d0 + from * 3600000;
    function pct(t) { return ((t - t0) / span * 100) + '%'; }
    var head = TT.el('div', 'epg-row epg-head');
    head.appendChild(TT.el('div', 'epg-chan'));
    var hours = TT.el('div', 'epg-line');
    for (var h = from; h < to; h += 2) {
      var lab = TT.el('span', 'epg-hour', two(h % 24) + ':00');
      lab.style.left = pct(d0 + h * 3600000);
      hours.appendChild(lab);
    }
    head.appendChild(hours);
    box.appendChild(head);
    var now = Date.now();
    rows.forEach(function (r) {
      var row = TT.el('div', 'epg-row');
      var ch = TT.el('div', 'epg-chan');
      ch.appendChild(avatar(r.c.profileImageURL));
      ch.appendChild(TT.el('span', '', r.c.displayName || r.c.login));
      row.appendChild(ch);
      var line = TT.el('div', 'epg-line');
      if (now > t0 && now < t0 + span) {
        var nowMark = TT.el('i', 'epg-now');
        nowMark.style.left = pct(now);
        line.appendChild(nowMark);
      }
      r.segs.forEach(function (x) {
        var a = new Date(x.a), e = new Date(x.e);
        var live = r.c.live && x.a <= now && x.e >= now;
        var blk = TT.el('div', 'epg-block' + (live ? ' live' : ''));
        blk.style.left = pct(x.a);
        blk.style.width = 'calc(' + ((x.e - x.a) / span * 100) + '% - 0.3rem)';
        blk.appendChild(TT.el('div', 'epg-time', two(a.getHours()) + ':' + two(a.getMinutes()) + '–' +
          two(e.getHours()) + ':' + two(e.getMinutes())));
        var cat = x.seg.categories && x.seg.categories[0];
        blk.appendChild(TT.el('div', 'epg-title', (x.seg.title || '') + (cat ? ' · ' + (cat.displayName || cat.name) : '')));
        line.appendChild(TT.focusable(blk, function () { views.channel(r.c.login); }));
      });
      row.appendChild(line);
      box.appendChild(row);
    });
  }

  // "Live-Kanäle" filter, remembered: { lang, sort, game, size, mature }.
  function liveFilter() {
    var f = TT.store.get('liveFilter', null) || {};
    return { lang: f.lang || TT.store.get('lang', 'de'), sort: f.sort || 'RELEVANCE', game: f.game || null,
      size: f.size || 'all', mature: f.mature || 'all' };
  }
  function saveFilter(f) { TT.store.set('liveFilter', f); }

  function button(label, onSelect, cls) {
    return TT.focusable(TT.el('div', 'btn' + (cls ? ' ' + cls : ''), label), onSelect);
  }

  // How long this launch took, and each app file's download time on this TV.
  function startupReport() {
    var box = TT.el('div', 'startup-report');
    function sec(ms) { return (ms / 1000).toFixed(1).replace('.', ',') + ' s'; }
    box.appendChild(TT.el('div', '', 'Start: ' + (TT.startupMs ? sec(TT.startupMs) : 'unbekannt') + ' bis zum Menü'));
    var res = performance.getEntriesByType ? performance.getEntriesByType('resource') : [];
    res.forEach(function (r) {
      var name = r.name.split('?')[0].split('/').pop();
      if (!/\.(js|css)$/.test(name)) return;
      box.appendChild(TT.el('div', '', name + ': ' + sec(r.duration) + (name === 'hls.min.js' ? ' (im Hintergrund)' : '')));
    });
    return box;
  }

  // Loads data into a section; shows errors in place. render() may return an element to focus.
  function load(el, promise, render, emptyText) {
    message(el, 'Wird geladen …');
    return promise.then(function (data) {
      var empty = !data || data.length === 0;
      message(el, empty ? (emptyText || 'Hier gibt es nichts') : '');
      var target = empty ? null : render(data);
      TT.lazy();
      // Move focus into the new content unless the user is browsing the sidebar.
      if (top() && top().el === el && (focusContent || !inSidebar())) {
        focusContent = false;
        if (target) TT.focus.set(target); else focusFirstIn(el);
      }
    }, function (err) {
      message(el, 'Fehler: ' + (err.message || err));
    });
  }

  // ---- player ----------------------------------------------------------------
  function showPlayer() {
    var p = document.getElementById('player');
    p.style.display = '';
    stack.push({
      name: 'player', el: p, player: true,
      onLeave: function () { TT.player.close(); p.style.display = 'none'; }
    });
    stack[stack.length - 2].lastFocus = TT.focus.get();
  }

  // Zapping: a stream opened from the sidebar plays next to it; ▲▼ + OK switch channels,
  // → or Back folds the sidebar away (then it's the normal full-screen player).
  var zap = false;
  function setZap(on) {
    zap = on;
    document.body.className = document.body.className.replace(/\bzap\b/g, '').trim() + (on ? ' zap' : '');
  }

  function markPlaying(login) {
    [].forEach.call(document.querySelectorAll('#sidebar .fol'), function (e) {
      e.classList.toggle('playing', e.getAttribute('data-login') === login);
    });
  }

  function openPlayer(stream, list, fromSidebar) {
    var from = TT.focus.get();
    showPlayer();
    setZap(!!fromSidebar);
    TT.player.open(stream, list);
    if (fromSidebar) { markPlaying(stream.broadcaster.login); TT.focus.set(from); }
  }

  function openVodPlayer(vod, owner) {
    showPlayer();
    TT.player.openVod(vod, owner);
  }

  // ---- sidebar: followed channels ---------------------------------------------
  function followEntry(c, live, list) {
    var item = TT.el('div', 'fol' + (live ? '' : ' off'));
    item.setAttribute('data-login', c.login);
    item.appendChild(avatar(c.profileImageURL));
    var t = TT.el('div', 'fol-text');
    t.appendChild(TT.el('div', 'fol-name', c.displayName || c.login));
    t.appendChild(TT.el('div', 'fol-game', live ? (live.game ? live.game.displayName : 'Live') : 'Offline'));
    item.appendChild(t);
    if (live) item.appendChild(TT.el('div', 'fol-viewers', TT.fmtCount(live.viewersCount)));
    return TT.focusable(item, function () {
      if (live && zap && top() && top().player) {
        TT.player.open(live, list);
        markPlaying(c.login);
        stack[stack.length - 2].lastFocus = item; // closing the player returns here
        return;
      }
      if (live) { openPlayer(live, list, true); return; }
      if (top() && top().player) pop();
      views.channel(c.login);
    });
  }

  // Focus the entry of `login` in a re-rendered sidebar list (else its first entry).
  function refocus(box, login) {
    var el = login && box.querySelector('[data-login="' + login + '"]');
    if (el) TT.focus.set(el); else focusFirstIn(box);
    if (zap) markPlaying(TT.player.currentLogin());
  }

  // Favourites at the top of the sidebar (live first). With favourites set, only they get
  // "ist jetzt live" notices.
  function refreshFavorites() {
    if (!favBox) return Promise.resolve({});
    var favs = TT.favorites.list();
    favHead.style.display = favs.length ? '' : 'none';
    if (!favs.length) { TT.clear(favBox); prevFavLive = null; return Promise.resolve({}); }
    var had = favBox.contains(TT.focus.get());
    var focusedLogin = had ? TT.focus.get().getAttribute('data-login') : null;
    return TT.api.usersByLogin(favs).then(function (users) {
      var live = users.filter(function (u) { return u.stream; })
        .sort(function (a, b) { return b.stream.viewersCount - a.stream.viewersCount; });
      var off = users.filter(function (u) { return !u.stream; });
      var liveStreams = live.map(function (u) { return u.stream; });
      var liveLogins = {};
      live.forEach(function (u) { liveLogins[u.login] = 1; });
      TT.clear(favBox);
      live.forEach(function (u) { favBox.appendChild(followEntry(u, u.stream, liveStreams)); });
      off.forEach(function (u) { favBox.appendChild(followEntry(u, null)); });
      if (had) refocus(favBox, focusedLogin);
      if (prevFavLive) {
        var fresh = live.filter(function (u) { return !prevFavLive[u.login]; }).map(function (u) { return u.displayName || u.login; });
        if (fresh.length) TT.toast('★ ' + fresh.join(', ') + (fresh.length > 1 ? ' sind' : ' ist') + ' jetzt live', 6000);
      }
      prevFavLive = liveLogins;
      TT.lazy();
      return liveLogins;
    }).catch(function () { return {}; });
  }

  // Live followed channels (and up to 15 offline ones) in the sidebar, refreshed every 3 min.
  function refreshFollows() {
    if (!followBox) return;
    clearTimeout(followTimer);
    followTimer = setTimeout(refreshFollows, 180000);
    refreshFavorites();
    var hadFocus = followBox.contains(TT.focus.get());
    var focusedLogin = hadFocus ? TT.focus.get().getAttribute('data-login') : null;
    if (!TT.api.auth.current()) {
      TT.clear(followBox);
      var hint = TT.el('div', 'fol-login', 'Melde dich an, um deine Kanäle hier zu sehen');
      followBox.appendChild(TT.focusable(hint, function () { resetTo('settings', views.settings); }));
      refreshRecommended({});
      return;
    }
    var failed = false;
    var liveP = TT.api.followedLive().catch(function () { failed = true; return []; });
    var allP = TT.api.followedChannels().catch(function () { failed = true; return []; });
    Promise.all([liveP, allP]).then(function (r) {
      var live = r[0].slice().sort(function (a, b) { return b.viewersCount - a.viewersCount; });
      var liveLogins = {};
      live.forEach(function (s) { liveLogins[s.broadcaster.login] = 1; });
      var offline = r[1].filter(function (c) { return !liveLogins[c.login]; }).slice(0, 15);
      TT.clear(followBox);
      var isFav = {};
      TT.favorites.list().forEach(function (l) { isFav[l] = 1; });
      live.forEach(function (s) { if (!isFav[s.broadcaster.login]) followBox.appendChild(followEntry(s.broadcaster, s, live)); });
      offline.forEach(function (c) { if (!isFav[c.login]) followBox.appendChild(followEntry(c, null)); });
      if (failed) {
        var retry = TT.el('div', 'fol-login', 'Gefolgte Kanäle konnten nicht geladen werden. OK = nochmal versuchen');
        followBox.appendChild(TT.focusable(retry, refreshFollows));
      } else if (!live.length && !offline.length) {
        followBox.appendChild(TT.el('div', 'fol-login', 'Keine gefolgten Kanäle'));
      }
      if (hadFocus) refocus(followBox, focusedLogin);
      // "X ist jetzt live" for channels that went live since the last check (not on start-up).
      if (prevLive && !TT.favorites.list().length) {
        var fresh = live.filter(function (s) { return !prevLive[s.broadcaster.login]; })
          .map(function (s) { return s.broadcaster.displayName || s.broadcaster.login; });
        if (fresh.length) TT.toast(fresh.join(', ') + (fresh.length > 1 ? ' sind' : ' ist') + ' jetzt live', 6000);
      }
      prevLive = liveLogins;
      TT.lazy();
      refreshRecommended(liveLogins);
    });
  }

  // "Empfohlene Kanäle": the most-watched live channels in the chosen language (like the
  // browser sidebar), without the followed ones already listed above.
  function refreshRecommended(skip) {
    if (!recBox) return;
    skip = skip || {};
    TT.favorites.list().forEach(function (l) { skip[l] = 1; }); // already pinned at the top
    // Twitch's own recommended order per language. (The browser's personal list isn't
    // available to apps like this one, not even signed in.)
    function fill(box, lang) {
      var had = box.contains(TT.focus.get());
      var login = had ? TT.focus.get().getAttribute('data-login') : null;
      return TT.api.topStreams(lang).then(function (top) {
        var list = top.filter(function (s) { return !skip[s.broadcaster.login]; }).slice(0, 10);
        TT.clear(box);
        list.forEach(function (s) { box.appendChild(followEntry(s.broadcaster, s, list)); });
        if (had) refocus(box, login);
        TT.lazy();
      }).catch(function () { /* keep the old list */ });
    }
    fill(recBox);
    // English-language channels worldwide, by viewers.
    if (intlBox) fill(intlBox, 'en');
  }

  // ---- screens ---------------------------------------------------------------
  var views = {
    home: function () {
      var el = section('');
      push('home', el);
      top().loadedAt = Date.now();
      if (followBox && followBox.firstChild) refreshFollows();
      var signedIn = !!TT.api.auth.current();
      var followedP = signedIn ? TT.api.followedLive().catch(function () { return []; }) : Promise.resolve([]);
      load(el, Promise.all([followedP, TT.api.topStreams()]), function (r) {
        var followed = r[0].slice().sort(function (a, b) { return b.viewersCount - a.viewersCount; });
        var top = r[1];
        var featured = followed[0] || top[0];
        var first = null;
        if (featured) {
          first = hero(featured, followed[0] ? followed : top);
          el.appendChild(first);
        }
        if (followed.length) {
          el.appendChild(carousel('Live-Kanäle', ', denen du folgst',
            followed.map(function (s) { return streamCard(s, followed); })));
        }
        // Videos started but not finished.
        var cont = TT.watched.list().filter(function (w) { return TT.vodPos(w.vod.id) > 30; });
        if (cont.length) {
          el.appendChild(carousel('Weiter', 'schauen', cont.map(function (w) { return videoCard(w.vod, w.owner); })));
        }
        // "Was habe ich verpasst?": top clips of the last 24 h from your channels.
        var missedSlot = TT.el('div');
        el.appendChild(missedSlot);
        var chanP = signedIn ? TT.api.followedChannels().then(function (l) { return l.map(function (c) { return c.login; }); })
          .catch(function () { return []; }) : Promise.resolve([]);
        chanP.then(function (logins) {
          var all = TT.favorites.list().concat(logins, TT.recent.list().map(function (c) { return c.login; }));
          var uniq = all.filter(function (l, i) { return all.indexOf(l) === i; });
          return TT.api.clipsOfChannels(uniq);
        }).then(function (clips) {
          clips = clips.slice(0, 30);
          if (clips.length) {
            missedSlot.appendChild(carousel('Was habe ich verpasst?', ' Die besten Clips der letzten 24 Stunden',
              clips.map(function (c) { return clipCard(c, clips); })));
          }
          TT.lazy();
        }).catch(function () { /* optional row */ });
        // Recently watched channels (live ones play directly), loaded alongside.
        var recentSlot = TT.el('div');
        el.appendChild(recentSlot);
        var logins = TT.recent.list().map(function (c) { return c.login; });
        if (logins.length) {
          TT.api.usersByLogin(logins).then(function (users) {
            var byLogin = {};
            users.forEach(function (u) { byLogin[u.login] = u; });
            var tiles = logins.map(function (l) { return byLogin[l]; }).filter(Boolean)
              .map(function (u) { return channelTile(u, true); });
            if (tiles.length) recentSlot.appendChild(carousel('Zuletzt', ' gesehen', tiles));
            TT.lazy();
          }).catch(function () { /* optional row */ });
        }
        var rec = top.filter(function (s) { return s !== featured; });
        if (rec.length) {
          el.appendChild(carousel('Empfohlene', ' Live-Kanäle', rec.map(function (s) { return streamCard(s, rec); })));
        }
        var cats = TT.el('div');
        el.appendChild(cats);
        TT.api.topCategories().then(function (games) {
          if (games.length) cats.appendChild(carousel('Kategorien', ', die dir gefallen könnten', games.slice(0, 20).map(categoryCard)));
          TT.lazy();
        }).catch(function () { /* the rest of the page still works */ });
        // Categories you follow that are live right now, as the last row.
        if (signedIn) {
          var catSlot = TT.el('div');
          el.appendChild(catSlot);
          TT.api.followedGames().then(function (games) {
            if (games.length) catSlot.appendChild(carousel('Deine', ' Kategorien', games.map(function (g) { return categoryCard(g); })));
            TT.lazy();
          }).catch(function () { /* optional row */ });
        }
        return first;
      }, 'Gerade ist niemand live');
    },

    following: function () {
      var el = section('Folge ich');
      push('following', el);
      if (!TT.api.auth.current()) {
        el.appendChild(TT.el('p', 'view-sub', 'Melde dich an, um die Kanäle zu sehen, denen du folgst.'));
        renderLogin(el, function () { resetTo('following', views.following); });
        return;
      }
      var allP = TT.api.followedChannels().catch(function () { return []; });
      load(el, Promise.all([TT.api.followedLive(), allP]), function (r) {
        var live = r[0].slice().sort(function (a, b) { return b.viewersCount - a.viewersCount; });
        var liveLogins = {};
        live.forEach(function (s) { liveLogins[s.broadcaster.login] = 1; });
        var offline = r[1].filter(function (c) { return !liveLogins[c.login]; });
        el.appendChild(heading('Live', ' (' + live.length + ')'));
        if (live.length) el.appendChild(grid(live.map(function (s) { return streamCard(s, live); })));
        else el.appendChild(TT.el('div', 'message', 'Gerade ist keiner deiner Kanäle live.'));
        if (offline.length) {
          el.appendChild(heading('Offline', ''));
          el.appendChild(grid(offline.map(channelTile), 'tiles'));
        }
        return el.querySelector('.focusable');
      }, 'Du folgst noch keinen Kanälen');
    },

    // All live channels as a grid; more load automatically near the end of the list.
    // All live channels as a grid with filters (language, sort, category, size, 18+);
    // more load automatically near the end of the list.
    live: function () {
      var el = section('Live-Kanäle');
      push('live', el);
      var f = liveFilter();
      var bar = TT.el('div', 'toolbar filters');
      var note = TT.el('div', 'view-sub filter-note');
      var body = TT.el('div');
      el.appendChild(bar);
      el.appendChild(note);
      el.appendChild(body);

      function option(key, opts) {
        var b = button('', function () {
          var i = 0;
          opts.forEach(function (o, k) { if (o[0] === f[key]) i = k; });
          f[key] = opts[(i + 1) % opts.length][0];
          paint();
          saveFilter(f);
          reload();
        });
        function paint() {
          var o = opts.filter(function (x) { return x[0] === f[key]; })[0] || opts[0];
          b.textContent = o[1];
        }
        paint();
        bar.appendChild(b);
        return b;
      }
      var firstBtn = option('lang', [['de', 'Sprache: Deutsch'], ['en', 'Sprache: International'], ['all', 'Sprache: Alle']]);
      option('sort', [['RELEVANCE', 'Sortierung: Empfohlen'], ['VIEWER_COUNT', 'Sortierung: Zuschauer ↓'],
        ['VIEWER_COUNT_ASC', 'Sortierung: Zuschauer ↑'], ['RECENT', 'Sortierung: Neu gestartet']]);
      var catBtn = button('', function () {
        views.categories(function (g) {
          f.game = g ? { name: g.name, displayName: g.displayName || g.name } : null;
          paintCat();
          saveFilter(f);
          reload();
        });
      });
      function paintCat() { catBtn.textContent = 'Kategorie: ' + (f.game ? f.game.displayName : 'Alle'); }
      paintCat();
      bar.appendChild(catBtn);
      option('size', [['all', 'Größe: Alle'], ['s', 'Größe: Klein (unter 100)'], ['m', 'Größe: Mittel (100–1.000)'],
        ['l', 'Größe: Groß (über 1.000)']]);
      option('mature', [['all', '18+: Alle'], ['hide', '18+: Ausblenden'], ['only', '18+: Nur 18+']]);

      var gen = 0;
      function reload() {
        var my = ++gen, pager = TT.api.livePager(f), loading = false, done = false, seen = {}, all = [], checked = 0;
        var g = grid([]);
        TT.clear(body);
        body.appendChild(g);
        note.textContent = 'Wird geladen …';
        function matches(st) {
          var v = st.viewersCount || 0;
          if (f.size === 's' && v >= 100) return false;
          if (f.size === 'm' && (v < 100 || v > 1000)) return false;
          if (f.size === 'l' && v <= 1000) return false;
          var mature = st.isMature || (st.contentClassificationLabels && st.contentClassificationLabels.length > 0);
          if (f.mature === 'hide' && mature) return false;
          if (f.mature === 'only' && !mature) return false;
          return true;
        }
        // Loads pages until about 24 more matching channels are there (filters can skip many).
        function more() {
          if (loading || done) return;
          loading = true;
          var found = 0, pages = 0;
          (function step() {
            pager.next().then(function (r) {
              if (my !== gen) return;
              done = r.done;
              pages++;
              r.items.forEach(function (st) {
                if (seen[st.id] || !matches(st)) return;
                seen[st.id] = 1;
                all.push(st);
                found++;
                var card = streamCard(st, all);
                card.onfocusin2 = function () { if (all.length - all.indexOf(st) <= 8) more(); };
                g.appendChild(card);
              });
              TT.lazy();
              // Strict filters can skip many pages: search further while nothing matched yet,
              // and say how far the search got.
              checked += r.items.length;
              if (!done && found < 24 && pages < (all.length ? 15 : 60)) {
                if (!all.length) note.textContent = 'Suche passende Kanäle … (' + checked + ' geprüft)';
                return step();
              }
              loading = false;
              note.textContent = all.length ? all.length + ' Kanäle' + (done ? '' : ' (weitere laden beim Runterscrollen)') +
                (done && !TT.api.auth.current() && !f.game ? ' · Ohne Anmeldung zeigt Twitch höchstens 30' : '') :
                (done ? 'Keine Kanäle für diese Auswahl' : 'Unter den ersten ' + checked + ' Kanälen passt keiner zu dieser Auswahl');
            }, function (e) {
              if (my !== gen) return;
              loading = false;
              note.textContent = 'Fehler: ' + (e.message || e);
            });
          })();
        }
        more();
      }
      reload();
      TT.focus.set(firstBtn);
    },

    // EPG-style week view of the schedules of your channels (favourites, followed, recently watched).
    program: function () {
      var el = section('TV-Programm', 'Geplante Streams deiner Kanäle');
      push('program', el);
      var signedIn = !!TT.api.auth.current();
      var chanP = signedIn ? TT.api.followedChannels().then(function (l) { return l.map(function (c) { return c.login; }); })
        .catch(function () { return []; }) : Promise.resolve([]);
      // Only channels you follow.
      var data = chanP.then(function (logins) { return TT.api.schedules(logins); })
        .then(function (chans) { return chans.filter(function (c) { return c.segments.length; }); });
      load(el, data, function (chans) {
        var days = TT.el('div', 'toolbar days');
        var gridBox = TT.el('div', 'epg');
        el.appendChild(days);
        el.appendChild(gridBox);
        var first = null, dayBtns = [];
        for (var d = 0; d < 7; d++) {
          (function (d) {
            var date = new Date(Date.now() + d * 86400000);
            var label = d === 0 ? 'Heute' : d === 1 ? 'Morgen' : DAYS[date.getDay()] + ' ' + two(date.getDate()) + '.' + two(date.getMonth() + 1) + '.';
            var b = button(label, function () { showDay(d); });
            dayBtns.push(b);
            days.appendChild(b);
            if (!first) first = b;
          })(d);
        }
        function showDay(d) {
          dayBtns.forEach(function (b, i) { b.classList.toggle('primary', i === d); });
          renderEpg(gridBox, chans, d);
          TT.lazy();
        }
        showDay(0);
        return first;
      }, signedIn ? 'Keiner der Kanäle, denen du folgst, hat einen Zeitplan.'
        : 'Melde dich unter Einstellungen → Twitch-Konto an, dann erscheinen hier die Zeitpläne deiner Kanäle.');
    },

    // pick(g): choose a category for a filter instead of opening it (g = null: all categories).
    categories: function (pick) {
      var el = section(pick ? 'Kategorie wählen' : 'Kategorien');
      push('categories', el);
      if (pick) {
        var bar = TT.el('div', 'toolbar');
        bar.appendChild(button('Alle Kategorien', function () { pop(); pick(null); }, 'primary'));
        el.appendChild(bar);
      }
      load(el, TT.api.topCategories(), function (games) {
        el.appendChild(grid(games.map(function (g) {
          return categoryCard(g, pick ? function () { pop(); pick(g); } : null);
        }), 'cats'));
        return pick ? el.querySelector('.toolbar .btn') : null;
      });
    },

    category: function (g) {
      var el = section(g.displayName || g.name, g.viewersCount ? TT.fmtViewers(g.viewersCount) : '');
      push('category', el);
      // Follow / unfollow the category (signed in).
      if (TT.api.auth.current()) {
        var bar = TT.el('div', 'toolbar');
        el.appendChild(bar);
        TT.api.gameFollow(g.name).then(function (f) {
          var busy = false;
          var btn = button(f.following ? '♥  Folge ich' : '♡  Folgen', function () {
            if (busy) return;
            busy = true;
            TT.api.setGameFollow(f.id, !f.following).then(function (on) {
              f.following = on;
              btn.textContent = on ? '♥  Folge ich' : '♡  Folgen';
              TT.toast(on ? 'Du folgst jetzt ' + (g.displayName || g.name) : 'Du folgst ' + (g.displayName || g.name) + ' nicht mehr');
            }, function (e) {
              TT.toast('Hat nicht geklappt: ' + (e.message || e));
            }).then(function () { busy = false; });
          }, f.following ? '' : 'primary');
          bar.appendChild(btn);
        }).catch(function () { /* no button */ });
      }
      var clipsSlot = TT.el('div');
      load(el, TT.api.categoryStreams(g.name), function (streams) {
        el.appendChild(clipsSlot);
        TT.api.gameClips(g.name).then(function (clips) {
          if (clips.length) clipsSlot.appendChild(carousel('Clips', ' der Woche', clips.map(function (c) { return clipCard(c, clips); })));
          TT.lazy();
        }).catch(function () {});
        el.appendChild(heading('Live', ' (' + streams.length + ')'));
        el.appendChild(grid(streams.map(function (s) { return streamCard(s, streams); })));
      }, 'Gerade ist in dieser Kategorie niemand live');
    },

    channel: function (login) {
      var el = section('');
      push('channel', el);
      top().login = login;
      load(el, TT.api.channelPage(login), function (u) {
        var owner = { login: u.login, displayName: u.displayName, profileImageURL: u.profileImageURL };
        var head = TT.el('div', 'chan-head' + (u.stream ? ' is-live' : ''));
        head.appendChild(avatar(u.profileImageURL));
        var info = TT.el('div');
        info.appendChild(TT.el('h1', '', u.displayName));
        var status = TT.el('div', 'chan-status');
        if (u.stream) {
          status.appendChild(TT.el('b', '', 'LIVE'));
          status.appendChild(document.createTextNode(' · ' + TT.fmtViewers(u.stream.viewersCount) +
            (u.stream.game ? ' · ' + u.stream.game.displayName : '')));
          status.appendChild(TT.el('div', 'chan-title', u.stream.title || ''));
        } else {
          status.textContent = 'Offline';
        }
        info.appendChild(status);
        head.appendChild(info);
        el.appendChild(head);
        var watch = null;
        var bar = TT.el('div', 'toolbar');
        if (u.stream) {
          watch = button('▶  Live ansehen', function () { openPlayer(u.stream, [u.stream]); }, 'primary');
          bar.appendChild(watch);
        }
        el.appendChild(bar);
        // Favourite (local, works without an account).
        var fav = button(TT.favorites.has(u.login) ? '★  Favorit' : '☆  Favorit', function () {
          var on = TT.favorites.toggle(u.login);
          fav.textContent = on ? '★  Favorit' : '☆  Favorit';
          TT.toast(on ? u.displayName + ' ist jetzt ein Favorit' : u.displayName + ' ist kein Favorit mehr');
          prevFavLive = null;
          refreshFavorites();
        });
        bar.appendChild(fav);
        if (!watch) watch = fav;
        // Follow / unfollow (signed in only).
        if (TT.api.auth.current()) {
          TT.api.isFollowing(u.login).then(function (f) {
            var busy = false;
            var fb = button(f ? '♥  Folge ich' : '♡  Folgen', function () {
              if (busy) return;
              busy = true;
              TT.api.setFollow(u.login, !f).then(function (now) {
                f = now;
                fb.textContent = f ? '♥  Folge ich' : '♡  Folgen';
                TT.toast(f ? 'Du folgst jetzt ' + u.displayName : 'Du folgst ' + u.displayName + ' nicht mehr');
                refreshFollows();
              }, function (e) {
                TT.toast('Folgen hat nicht geklappt: ' + (e.message || e));
              }).then(function () { busy = false; });
            });
            bar.insertBefore(fb, fav);
          }).catch(function () { /* no button */ });
        }
        // Stream schedule (if the channel has one), loaded alongside.
        var sched = TT.el('div');
        el.appendChild(sched);
        TT.api.schedule(login).then(function (segs) {
          if (!segs.length) return;
          sched.appendChild(heading('Zeitplan', ''));
          var list = TT.el('div', 'schedule');
          segs.forEach(function (seg) { list.appendChild(scheduleItem(seg)); });
          sched.appendChild(list);
        }).catch(function () { /* no schedule */ });
        // Popular clips of the week, loaded alongside.
        var clipsSlot = TT.el('div');
        el.appendChild(clipsSlot);
        TT.api.channelClips(login).then(function (clips) {
          if (clips.length) clipsSlot.appendChild(carousel('Beliebte', ' Clips der Woche', clips.map(function (c) { return clipCard(c, clips); })));
          TT.lazy();
        }).catch(function () {});
        el.appendChild(heading('Vergangene', ' Übertragungen'));
        if (!u.videoList.length) el.appendChild(TT.el('div', 'message', 'Keine Videos vorhanden'));
        else el.appendChild(grid(u.videoList.map(function (v) { return videoCard(v, owner); })));
        return watch || el.querySelector('.grid .focusable');
      });
    },

    settings: function () {
      var el = section('Einstellungen');
      push('settings', el);
      function row(title, hint, value, onSelect) {
        var r = TT.el('div', 'setting');
        var text = TT.el('div', 'setting-text', title);
        text.appendChild(TT.el('span', 'hint', hint));
        var val = TT.el('span', 'value');
        function paint() { val.textContent = value(); }
        r.appendChild(text);
        r.appendChild(val);
        paint();
        el.appendChild(TT.focusable(r, function () { onSelect(); paint(); }));
        return r;
      }
      var a = TT.api.auth.current();
      var loginBox = TT.el('div', 'login-panel');
      row('Twitch-Konto', a ? 'OK drücken zum Abmelden' : 'Für „Folge ich“, deine Kanäle in der Seitenleiste und zum Schreiben im Chat',
        function () { return a ? 'Angemeldet als ' + (a.displayName || a.login) : 'Nicht angemeldet'; },
        function () {
          if (a) {
            TT.api.auth.logout();
            TT.toast('Abgemeldet');
            refreshFollows();
            resetTo('settings', views.settings);
          } else if (!loginBox.firstChild) {
            renderLogin(loginBox, function () { refreshFollows(); resetTo('settings', views.settings); });
          }
        });
      el.appendChild(loginBox);
      row('Chat', 'Wie der Chat neben dem Stream erscheint (rote Taste im Player)',
        function () { return TT.chat.label(); }, function () { TT.chat.cycle(); });
      row('Lautstärke-Ausgleich', 'Gleicht laute und leise Stellen aus (grüne Taste im Player)',
        function () { return TT.audio.label(); },
        function () { if (TT.audio.cycle() === null) TT.toast('Der Kompressor wird von diesem Fernseher nicht unterstützt'); });
      row('Sprache der Streams', 'Welche Streams auf der Startseite und in Kategorien empfohlen werden',
        function () { return TT.store.get('lang', 'de') === 'de' ? 'Deutsch' : 'Alle Sprachen'; },
        function () { TT.store.set('lang', TT.store.get('lang', 'de') === 'de' ? 'all' : 'de'); });
      var Q = ['auto', '1080', '720', '480'];
      row('Bildqualität', 'Automatisch passt sich der Internetverbindung an',
        function () { var q = TT.store.get('quality', 'auto'); return q === 'auto' ? 'Automatisch' : q + 'p'; },
        function () {
          var q = TT.store.get('quality', 'auto');
          TT.store.set('quality', Q[(Q.indexOf(q) + 1) % Q.length]);
        });
      row('Verzögerung', 'Gering: etwa 6 s hinter live. Normal: etwa 10 s, mehr Puffer, falls es ruckelt',
        function () { return TT.store.get('latency', 'low') === 'normal' ? 'Normal' : 'Gering'; },
        function () { TT.store.set('latency', TT.store.get('latency', 'low') === 'normal' ? 'low' : 'normal'); });
      row('Chat passend zum Bild', 'Zeigt Nachrichten erst, wenn das Bild so weit ist – keine Spoiler',
        function () { return TT.chat.syncEnabled() ? 'An' : 'Aus'; },
        function () { TT.chat.setSync(!TT.chat.syncEnabled()); });
      row('Schriftgröße im Chat', 'Für den Abstand vom Sofa',
        function () { return TT.chat.sizeLabel(); }, function () { TT.chat.cycleSize(); });
      row('QR-Code unter dem Chat', 'Öffnet den Chat des Kanals auf dem Handy, zum Mitschreiben',
        function () { return TT.chat.qrEnabled() ? 'An' : 'Aus'; },
        function () { TT.chat.setQr(!TT.chat.qrEnabled()); });
      row('Emotes im Chat', '7TV, BTTV und FFZ. Ausschalten, falls der Chat die Wiedergabe ruckeln lässt',
        function () { return TT.chat.sevenTvEnabled() ? 'An' : 'Aus'; },
        function () { TT.chat.setSevenTv(!TT.chat.sevenTvEnabled()); });
      el.appendChild(TT.el('div', 'about', 'Twizen ' + TT.VERSION + ' · Werbeblocker aktiv · fMP4→TS für ältere Fernseher'));
      el.appendChild(startupReport());
    },

    search: function () {
      var el = section('Suche');
      push('search', el);
      var query = '';
      var timer = null;
      var input = TT.el('div', 'search-box');
      input.appendChild(icon(NAV[5][2]));
      var text = TT.el('span', 'search-text');
      input.appendChild(text);
      input.appendChild(TT.el('span', 'caret'));
      el.appendChild(input);
      var kb = TT.el('div', 'keyboard');
      var results = TT.el('div', 'search-results');
      el.appendChild(kb);
      el.appendChild(results);

      function update() {
        text.textContent = query || 'Kanäle oder Kategorien suchen';
        text.className = 'search-text' + (query ? '' : ' placeholder');
        clearTimeout(timer);
        if (query.length >= 2) timer = setTimeout(run, 600);
        else { TT.clear(results); if (query.length === 1) message(results, 'Noch ein Zeichen …'); }
      }

      function run() {
        var q = query;
        TT.clear(results);
        message(results, 'Suche läuft …');
        TT.api.search(q).then(function (r) {
          if (q !== query) return;
          TT.clear(results);
          var chans = r.channels.slice().sort(function (a, b) { return (b.stream ? 1 : 0) - (a.stream ? 1 : 0); });
          if (chans.length) results.appendChild(carousel('Kanäle', '', chans.map(channelTile)));
          if (r.games.length) results.appendChild(carousel('Kategorien', '', r.games.map(categoryCard)));
          if (!chans.length && !r.games.length) message(results, 'Keine Treffer für „' + q + '“');
          TT.lazy();
        }, function (err) {
          message(results, 'Fehler: ' + (err.message || err));
        });
      }

      ['abcdefghij', 'klmnopqrst', 'uvwxyz0123', '456789_'].forEach(function (keys) {
        var r = TT.el('div', 'keyrow');
        keys.split('').forEach(function (ch) {
          r.appendChild(TT.focusable(TT.el('div', 'key', ch.toUpperCase()), function () { query += ch; update(); }));
        });
        kb.appendChild(r);
      });
      var actions = TT.el('div', 'keyrow');
      actions.appendChild(TT.focusable(TT.el('div', 'key wide', 'Leerzeichen'), function () { query += ' '; update(); }));
      actions.appendChild(TT.focusable(TT.el('div', 'key wide', '⌫  Löschen'), function () {
        query = query.slice(0, -1); update();
      }));
      actions.appendChild(TT.focusable(TT.el('div', 'key wide', 'Alles löschen'), function () {
        query = ''; update();
      }));
      kb.appendChild(actions);

      // Physical keyboard typing (desktop testing / USB keyboards).
      el.typeKey = function (e) {
        if (e.key && e.key.length === 1 && /[\w ]/.test(e.key)) { query += e.key.toLowerCase(); update(); return true; }
        if (e.keyCode === 8 && query) { query = query.slice(0, -1); update(); return true; }
        return false;
      };
      update();
      focusFirstIn(kb);
    }
  };

  // Device-code sign-in into `box`; onDone runs after a successful login.
  function renderLogin(box, onDone) {
    var status = TT.el('div', 'login-status');
    var btn = button('Mit Twitch anmelden', start, 'primary');
    box.appendChild(btn);
    box.appendChild(status);
    var polling = null;
    var entry = top();
    var prevLeave = entry.onLeave;
    entry.onLeave = function () { clearTimeout(polling); if (prevLeave) prevLeave(); };
    TT.focus.set(btn);

    function start() {
      TT.clear(status);
      status.appendChild(TT.el('p', '', 'Code wird angefordert …'));
      TT.api.auth.startDeviceFlow().then(function (d) {
        TT.clear(status);
        var p = TT.el('p', '', 'Öffne auf dem Handy oder PC ');
        p.appendChild(TT.el('span', 'login-url', d.verification_uri.replace(/^https?:\/\//, '').replace(/\?.*$/, '')));
        p.appendChild(document.createTextNode(' und gib diesen Code ein:'));
        status.appendChild(p);
        status.appendChild(TT.el('div', 'login-code', d.user_code));
        // Or scan: Twitch's link already carries the code.
        var qrSlot = TT.el('div', 'login-qr');
        status.appendChild(qrSlot);
        TT.qrImage(d.verification_uri).then(function (img) {
          qrSlot.appendChild(img);
          qrSlot.appendChild(TT.el('div', '', 'Oder mit dem Handy scannen – der Code ist dann schon eingetragen.'));
        }).catch(function () { /* code above is enough */ });
        status.appendChild(TT.el('p', 'dim', 'Wartet auf Bestätigung …'));
        var deadline = Date.now() + d.expires_in * 1000;
        var interval = Math.max(d.interval || 5, 3) * 1000;
        (function poll() {
          polling = setTimeout(function () {
            if (Date.now() > deadline) { TT.clear(status); status.appendChild(TT.el('p', '', 'Der Code ist abgelaufen, bitte nochmal versuchen.')); return; }
            TT.api.auth.pollDeviceFlow(d.device_code).then(function (a) {
              if (!a) return poll();
              TT.toast('Angemeldet als ' + (a.displayName || a.login));
              refreshFollows();
              if (onDone) onDone();
            }, function (err) {
              TT.clear(status);
              status.appendChild(TT.el('p', '', 'Anmeldung fehlgeschlagen: ' + err.message));
            });
          }, interval);
        })();
      }, function (err) {
        TT.clear(status);
        status.appendChild(TT.el('p', '', 'Anmeldung konnte nicht gestartet werden: ' + err.message +
          ' (läuft der Twizen-Dienst?)'));
      });
    }
  }

  // ---- public ------------------------------------------------------------------
  TT.views = views;
  TT.nav = {
    init: function () {
      main = document.getElementById('main');
      var side = document.getElementById('sidebar');
      var nav = TT.el('div', 'side-nav');
      NAV.forEach(function (it) {
        var item = TT.el('div', 'side-item');
        item.appendChild(icon(it[2]));
        item.appendChild(document.createTextNode(it[1]));
        sideItems[it[0]] = item;
        nav.appendChild(TT.focusable(item, function () {
          focusContent = true;
          resetTo(it[0], views[it[0]]);
          // Pages without async content get the focus right away.
          var t = top();
          if (focusContent && t && t.name === it[0] && !t.el.querySelector('.message')) {
            focusContent = false;
            if (!t.el.contains(TT.focus.get())) focusFirstIn(t.el);
          }
        }));
      });
      side.appendChild(nav);
      var lists = TT.el('div', 'side-lists');
      favHead = TT.el('div', 'side-h', '★ Favoriten');
      lists.appendChild(favHead);
      favBox = TT.el('div', 'side-follows');
      lists.appendChild(favBox);
      lists.appendChild(TT.el('div', 'side-h', 'Gefolgte Kanäle'));
      followBox = TT.el('div', 'side-follows');
      lists.appendChild(followBox);
      lists.appendChild(TT.el('div', 'side-h', TT.store.get('lang', 'de') === 'de' ? 'Empfohlen auf Deutsch' : 'Empfohlene Kanäle'));
      recBox = TT.el('div', 'side-follows');
      lists.appendChild(recBox);
      lists.appendChild(TT.el('div', 'side-h', 'Beliebt international'));
      intlBox = TT.el('div', 'side-follows');
      lists.appendChild(intlBox);
      side.appendChild(lists);
      refreshFollows();
      TT.player.onFollowChange = refreshFollows;
      document.addEventListener('visibilitychange', function () {
        if (document.hidden) return;
        refreshFollows();
        if (homeIsStale()) rebuildHome();
      });
      // Player's 'Channel' button: leave the player and show that channel's page
      // (or go back to it if we came from there).
      TT.player.onChannelPage = function (login) {
        pop();
        var t = top();
        if (!(t && t.name === 'channel' && t.login === login)) views.channel(login);
      };
      TT.focus.setScope(function () {
        var t = top();
        if (t && t.player) return zap ? [side] : t.el;
        return [side, t ? t.el : null];
      });
      views.home();
    },
    // Back: close sub-pages first, then jump from the content to the sidebar menu.
    back: function () {
      if (pop()) return true;
      if (!inSidebar()) {
        var root = stack.length ? stack[0].name : 'home';
        if (sideItems[root]) { TT.focus.set(sideItems[root]); return true; }
      }
      return false;
    },
    inPlayer: function () { var t = top(); return !!(t && t.player); },
    // Keys while zapping with the sidebar open; returns true if handled.
    zapKey: function (k) {
      if (!zap || !TT.nav.inPlayer()) return false;
      if (k === 'up' || k === 'down') { TT.focus.move(k); return true; }
      if (k === 'enter') { TT.focus.activate(); return true; }
      if (k === 'right' || k === 'back') { setZap(false); TT.toast('Seitenleiste eingeklappt · Zurück schließt den Stream', 2500); return true; }
      if (k === 'left') return true;
      return false;
    },
    current: top
  };
})();

/* ---- main.js ---- */
;// Entry point: remote key handling and startup.
(function () {
  var KEYS = {
    37: 'left', 38: 'up', 39: 'right', 40: 'down', 13: 'enter',
    10009: 'back', 27: 'back', 8: 'back',
    403: 'red', 404: 'green', 405: 'yellow', 406: 'blue',
    10252: 'playpause', 32: 'playpause', 415: 'play', 19: 'pause', 413: 'stop',
    427: 'chup', 428: 'chdown', 33: 'chup', 34: 'chdown',
    412: 'rewind', 417: 'ff', 457: 'info'
  };
  // Letter shortcuts for desktop testing, only while the player is open.
  var PLAYER_LETTERS = { 82: 'red', 71: 'green', 73: 'info' };
  var TIZEN_KEYS = ['MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaStop',
    'ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue', 'ChannelUp', 'ChannelDown',
    'MediaRewind', 'MediaFastForward', 'Info'];
  var lastRootBack = 0;

  function registerTizenKeys() {
    try {
      if (window.tizen && tizen.tvinputdevice) {
        TIZEN_KEYS.forEach(function (k) {
          try { tizen.tvinputdevice.registerKey(k); } catch (e) { /* key not available */ }
        });
      }
    } catch (e) { /* not on a TV */ }
  }

  function exitApp() {
    try { tizen.application.getCurrentApplication().exit(); } catch (e) { window.history.back(); }
  }

  function onKey(e) {
    var inPlayer = TT.nav.inPlayer();
    var view = TT.nav.current();

    // Search screen: physical keyboard typing (Backspace deletes there).
    if (!inPlayer && view && view.el.typeKey && view.el.typeKey(e)) { e.preventDefault(); return; }

    if (inPlayer && TT.player.typeKey(e)) { e.preventDefault(); return; }

    var k = KEYS[e.keyCode] || (inPlayer ? PLAYER_LETTERS[e.keyCode] : null);
    if (!k) return;
    e.preventDefault();

    if (inPlayer && TT.nav.zapKey(k)) return;
    if (inPlayer && TT.player.key(k, !!e.repeat)) return;
    if (k === 'back' || k === 'stop') {
      if (TT.nav.back()) return;
      if (k === 'back') {
        if (Date.now() - lastRootBack < 2000) exitApp();
        else { lastRootBack = Date.now(); TT.toast('Zum Beenden nochmal Zurück drücken'); }
      }
      return;
    }
    if (inPlayer) return;
    if (k === 'enter') TT.focus.activate();
    else if (k === 'yellow') {
      var f = TT.focus.get();
      if (f && f.onyellow) f.onyellow();
    } else if (k === 'left' || k === 'right' || k === 'up' || k === 'down') TT.focus.move(k);
  }

  // Runs one startup step; a failure is shown on screen instead of stopping the app.
  function step(name, fn) {
    try { fn(); } catch (e) {
      if (window.twzError) twzError(name + ' failed: ' + (e && e.message ? e.message : e));
    }
  }

  function start() {
    TT.started = true;
    step('keys', registerTizenKeys);
    document.addEventListener('keydown', onKey);
    document.addEventListener('keyup', function (e) {
      var k = KEYS[e.keyCode];
      if (k && TT.nav.inPlayer()) TT.player.keyUp(k);
    });
    step('player', TT.player.init);
    step('navigation', TT.nav.init);
    var boot = document.getElementById('boot');
    if (boot) boot.parentNode.removeChild(boot);
    TT.startupMs = window.twzT0 ? Date.now() - twzT0 : 0;
    // Fetch the video library in the background so it's ready by the time a stream is picked.
    setTimeout(function () {
      TT.loadHls().then(function (H) {
        if (!H.isSupported()) TT.toast('Dieser Fernseher unterstützt keine Media-Source-Wiedergabe', 8000);
      }, function (e) { if (window.twzError) twzError(e.message); });
    }, 1000);
    // Installed as Dicti93/twizen-fix@0, new versions arrive on their own: say so once.
    step('update notice', function () {
      var last = TT.store.get('lastVersion', null);
      if (last && last !== TT.VERSION) TT.toast('Twizen wurde auf ' + TT.VERSION + ' aktualisiert', 5000);
      TT.store.set('lastVersion', TT.VERSION);
    });
    TT.checkService().then(function (ok) {
      if (!ok) TT.toast('Der Twizen-Dienst läuft nicht. Stöbern geht, Abspielen nicht.', 8000);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
