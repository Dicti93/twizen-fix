/* Twizen 0.4.0 (fork of Twizen 0.3.3; app/js sources are not published, edit this file). */
/* ---- core.js ---- */
;// Shared helpers. All app code is ES5 (no build step) so it runs on older Tizen browsers.
var TT = window.TT = window.TT || {};

TT.VERSION = '0.4.0';
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
    'id title viewersCount createdAt previewImageURL(width:440,height:248) ' +
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

  function helixFollowedLive() {
    return myUserId().then(function (id) {
      return helix('streams/followed?first=100&user_id=' + id);
    }).then(function (d) {
      var streams = d.data || [];
      if (!streams.length) return [];
      return helixPictures(streams.map(function (s) { return s.user_id; })).then(function (pics) {
        return streams.map(function (s) {
          return {
            id: s.id,
            title: s.title,
            viewersCount: s.viewer_count,
            createdAt: s.started_at,
            previewImageURL: (s.thumbnail_url || '').replace('{width}', '440').replace('{height}', '248'),
            game: s.game_name ? { name: s.game_name, displayName: s.game_name } : null,
            broadcaster: { login: s.user_login, displayName: s.user_name, profileImageURL: pics[s.user_id] || '' }
          };
        });
      });
    });
  }

  function gqlFollowedLive() {
    return gql('query{ currentUser{ followedLiveUsers(first:30){ edges{ node{ login displayName ' +
      'profileImageURL(width:70) stream{ id title viewersCount createdAt ' +
      'previewImageURL(width:440,height:248) game{ name displayName } } } } } } }')
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

    // Language from Settings ('de' by default); 'all' means no filter.
    topStreams: function () {
      var de = TT.store.get('lang', 'de') === 'de';
      return gql('query{ streams(first:30' + (de ? ', options:{languages:[DE]}' : '') + '){ edges{ node{ ' +
        STREAM_FIELDS + ' } } } }')
        .then(function (d) { return edgesToNodes(d.streams); });
    },

    topCategories: function () {
      return gql('query{ games(first:30){ edges{ node{ name displayName ' +
        'boxArtURL(width:285,height:380) viewersCount } } } }')
        .then(function (d) { return edgesToNodes(d.games); });
    },

    // German streams first if that's the setting; falls back to all languages when there are none.
    categoryStreams: function (name) {
      function query(de) {
        return gql('query($name:String!){ game(name:$name){ streams(first:30' + (de ? ', options:{languages:["DE"]}' : '') +
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

    // Channel page: profile, live stream (if any) and recent videos.
    channelPage: function (login) {
      return gql('query($login:String!){ user(login:$login){ id login displayName ' +
        'profileImageURL(width:150) description stream{ id title viewersCount createdAt ' +
        'previewImageURL(width:440,height:248) game{ name displayName } } ' +
        'videos(first:30, sort:TIME){ edges{ node{ id title lengthSeconds viewCount publishedAt ' +
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
        'stream{ id title viewersCount createdAt previewImageURL(width:440,height:248) game{ name displayName } } } } ' +
        'games{ items{ name displayName boxArtURL(width:285,height:380) viewersCount } } } }', { q: q })
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
        'previewImageURL(width:440,height:248) game{ name displayName } } } }', { login: login })
        .then(function (d) { return d.user; });
    },

    playbackToken: function (login, playerType, anonymous) {
      var platform = playerType === 'autoplay' ? 'android' : 'web';
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
//      playerType ("embed", "popout", "autoplay"), which often comes without ads,
//   3. if every backup has ads too, strip the ad segments (picture freezes, no ad).
// Output playlists are renumbered by PROGRAM-DATE-TIME so hls.js sees one continuous
// sequence even when we switch between the main and backup playlists.
(function (root) {
  var AD_MARKER = /stitched-ad|X-TV-TWITCH-AD|CLASS="twitch-ad/i;
  var BACKUP_TYPES = ['embed', 'popout', 'autoplay'];

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
;// Toggleable dynamic range compressor:
// video -> MediaElementSource -> DynamicsCompressor -> makeup Gain -> destination.
// The Web Audio graph is only created the first time the user turns it on, because once a
// <video> is routed into Web Audio its sound only comes out through the graph. If the TV's
// Web Audio doesn't get samples from hardware-decoded video, we detect silence, report it
// as unsupported, and the player swaps in a fresh <video> element.
(function () {
  var PRESETS = {
    off: null,
    light: { label: 'Leicht', threshold: -24, ratio: 3, knee: 12, attack: 0.01, release: 0.25, makeupDb: 3 },
    night: { label: 'Nacht', threshold: -40, ratio: 12, knee: 6, attack: 0.003, release: 0.25, makeupDb: 8 }
  };
  var ORDER = ['off', 'light', 'night'];

  var ctx = null, source = null, comp = null, gain = null, analyser = null, boundVideo = null;
  var mode = TT.store.get('compressor', 'off');
  if (!PRESETS.hasOwnProperty(mode)) mode = 'off';
  // Session-only: a stored flag once disabled the compressor forever after one quiet stream.
  var unsupported = false;
  TT.store.set('compressorUnsupported', false);

  function supported() {
    return !unsupported && !!(window.AudioContext || window.webkitAudioContext);
  }

  function ensureGraph(video) {
    if (ctx && boundVideo === video) return true;
    try {
      if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
      source = ctx.createMediaElementSource(video);
      comp = ctx.createDynamicsCompressor();
      gain = ctx.createGain();
      analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      comp.connect(gain);
      boundVideo = video;
      return true;
    } catch (e) {
      TT.log('compressor: graph setup failed', e);
      markUnsupported();
      return false;
    }
  }

  function markUnsupported() {
    unsupported = true;
  }

  function wire() {
    if (!source) return;
    try { source.disconnect(); } catch (e) { /* not connected */ }
    try { gain.disconnect(); } catch (e2) { /* not connected */ }
    var p = PRESETS[mode];
    if (p) {
      comp.threshold.value = p.threshold;
      comp.ratio.value = p.ratio;
      comp.knee.value = p.knee;
      comp.attack.value = p.attack;
      comp.release.value = p.release;
      gain.gain.value = Math.pow(10, p.makeupDb / 20);
      source.connect(comp);
      gain.connect(analyser);
      gain.connect(ctx.destination);
    } else {
      source.connect(analyser);
      source.connect(ctx.destination);
    }
  }

  // Checks over ~10 s of actual playback that real samples flow through the graph; calls
  // onFail() if silent. Buffering, pauses and a suspended context don't count as playback.
  function verify(video, onFail) {
    var buf = new Uint8Array(analyser.fftSize);
    var my = analyser, checks = 0, heard = false, lastTime = -1;
    var timer = setInterval(function () {
      if (analyser !== my) { clearInterval(timer); return; }
      var t = video.currentTime, advancing = t !== lastTime;
      lastTime = t;
      if (!advancing || video.paused || video.muted || video.volume === 0 ||
          video.readyState < 3 || ctx.state !== 'running') {
        if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
        return;
      }
      analyser.getByteTimeDomainData(buf);
      for (var i = 0; i < buf.length; i++) if (Math.abs(buf[i] - 128) > 2) { heard = true; break; }
      checks++;
      if (heard) { clearInterval(timer); return; }
      if (checks >= 40) {
        clearInterval(timer);
        TT.log('compressor: no audio through Web Audio, disabling');
        markUnsupported();
        onFail();
      }
    }, 250);
  }

  TT.audio = {
    mode: function () { return mode; },
    label: function () { return PRESETS[mode] ? PRESETS[mode].label : 'Aus'; },
    supported: supported,
    // True when `video` is routed through Web Audio (it must keep the graph).
    isBound: function (video) { return boundVideo === video; },

    // Called by the player once playback starts.
    attach: function (video, onFail) {
      if (mode === 'off' && boundVideo !== video) return;
      if (!supported()) return;
      var fresh = boundVideo !== video;
      if (!ensureGraph(video)) return;
      if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
      wire();
      if (fresh) verify(video, onFail);
    },

    // Cycles Off -> Light -> Night. Returns the new label, or null if unsupported.
    cycle: function (video, onFail) {
      if (!supported()) return null;
      mode = ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length];
      TT.store.set('compressor', mode);
      if (video && (mode !== 'off' || boundVideo === video)) {
        var fresh = boundVideo !== video;
        if (!ensureGraph(video)) { onFail(); return null; }
        if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
        wire();
        if (fresh) verify(video, onFail);
      }
      return TT.audio.label();
    },

    // The player replaced its <video>; the old graph is useless.
    reset: function () {
      source = comp = gain = analyser = boundVideo = null;
      if (ctx && ctx.close) { try { ctx.close(); } catch (e) { /* ignore */ } }
      ctx = null;
    }
  };
})();

/* ---- chat.js ---- */
;// Read-only Twitch chat over anonymous IRC WebSocket.
(function () {
  var MAX_LINES = 60;
  var MODES = ['off', 'side', 'overlay'];
  var ws = null, channel = null, box = null, list = null, reconnectTimer = null;
  var mode = TT.store.get('chatMode', 'side');
  if (MODES.indexOf(mode) < 0) mode = 'side';

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

  function loadSevenTv(login) {
    var my = ++stvLoadId;
    stvChannel = {};
    if (!sevenTvOn) return;
    if (!stvGlobal) {
      TT.http('GET', 'https://7tv.io/v3/emote-sets/global').then(function (r) {
        stvGlobal = stvMap(r.json().emotes);
      }).catch(function (e) { TT.log('7TV global emotes failed', e.message); });
    }
    TT.api.userId(login).then(function (id) {
      if (!id || my !== stvLoadId) return null;
      return TT.http('GET', 'https://7tv.io/v3/users/twitch/' + id);
    }).then(function (r) {
      if (!r || my !== stvLoadId) return;
      var set = r.json().emote_set;
      stvChannel = stvMap(set && set.emotes);
    }).catch(function () { /* channel has no 7TV set */ });
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
    while (list.childNodes.length > MAX_LINES) list.removeChild(list.firstChild);
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
      if (m) addLine(tags, m[1], m[2]);
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

  function applyMode() {
    var root = document.getElementById('player');
    root.className = root.className.replace(/\bchat-\w+\b/g, '').trim() + ' chat-' + mode;
  }

  TT.chat = {
    init: function () {
      box = document.getElementById('chat');
      list = document.getElementById('chat-list');
      applyMode();
    },
    open: function (login) {
      TT.chat.close();
      channel = login.toLowerCase();
      TT.clear(list);
      loadSevenTv(channel);
      if (mode !== 'off') connect();
    },
    sevenTvEnabled: function () { return sevenTvOn; },
    setSevenTv: function (on) {
      sevenTvOn = !!on;
      TT.store.set('sevenTv', sevenTvOn);
      if (!on) { stvChannel = {}; stvGlobal = null; }
    },
    close: function () {
      clearTimeout(reconnectTimer);
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
  var current = null;        // { stream } for live, or { vod, owner } for videos
  var playlist = [];         // live streams for channel up/down
  var index = 0;
  var retries = 0, osdTimer = null, pausedAt = 0, saveTimer = null;

  function $(id) { return document.getElementById(id); }

  function fetchText(url) {
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
        callbacks.onError({ code: err.status || 0, text: String(err.message || err) }, context, null, self.stats);
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
    var dur = vodDuration();
    var pos = scrub.active ? scrub.target : video.currentTime;
    $('osd-bar').style.width = (dur ? Math.min(100, pos / dur * 100) : 0) + '%';
    $('osd-time').textContent = (scrub.active ? (scrub.dir < 0 ? '◀◀ ' : '▶▶ ') : '') +
      fmtTime(pos) + ' / ' + fmtTime(dur) + (scrub.active ? '   (' + stepLabel(scrub.step) + '-Schritte)' : '');
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
    comp: 'M3 9h4l5-5v16l-5-5H3zM15 9h2v6h-2zM19 7h2v10h-2z',
    up: 'M12 4l6 7h-4v9h-4v-9H6z',
    down: 'M12 20l-6-7h4V4h4v9h4z',
    user: 'M12 3a4 4 0 110 8 4 4 0 010-8zm0 10c4.4 0 8 2 8 4.5V21H4v-3.5C4 15 7.6 13 12 13z'
  };

  function controlList() {
    var isVod = !!(current && current.vod);
    var list = [{ icon: video.paused ? 'play' : 'pause', label: video.paused ? 'Weiter' : 'Pause', fn: togglePause }];
    if (isVod) {
      list.push({ icon: 'back', label: '1 Min.', fn: function () { seekBy(-60); } });
      list.push({ icon: 'fwd', label: '1 Min.', fn: function () { seekBy(60); } });
    } else {
      list.push({ icon: 'chat', label: 'Chat: ' + TT.chat.label(), fn: function () { TT.chat.cycle(); } });
    }
    list.push({ icon: 'comp', label: 'Kompressor: ' + TT.audio.label(), fn: cycleCompressor });
    if (!isVod && playlist.length > 1) {
      list.push({ icon: 'up', label: 'Vorheriger', fn: function () { switchStream(-1); } });
      list.push({ icon: 'down', label: 'Nächster', fn: function () { switchStream(1); } });
    }
    var login = isVod ? current.owner && current.owner.login : current && current.stream.broadcaster.login;
    if (login && TT.player.onChannelPage) {
      list.push({ icon: 'user', label: 'Kanal & Videos', fn: function () {
        TT.player.onChannelPage(login);
      } });
    }
    return list;
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
    if (!isVod) key('kc red', 'Chat');
    key('kc green', 'Kompressor');
    key('kc yellow', 'Kanal');
    var ch = TT.el('span', 'key-hint');
    ch.appendChild(TT.el('b', 'kc-ch', 'CH'));
    ch.appendChild(document.createTextNode(isVod ? '± 5 Min.' : 'Stream wechseln'));
    box.appendChild(ch);
  }

  function renderControls() {
    buttons = controlList();
    if (btnIndex >= buttons.length) btnIndex = buttons.length - 1;
    var box = $('osd-controls');
    TT.clear(box);
    buttons.forEach(function (b, i) {
      var el = TT.el('div', 'ctl-btn' + (row === 'buttons' && i === btnIndex ? ' sel' : ''));
      el.appendChild(svgIcon(b.icon));
      el.appendChild(TT.el('span', '', b.label));
      box.appendChild(el);
    });
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
    var label = TT.audio.cycle(video, onCompressorFail);
    TT.toast(label === null ? 'Der Kompressor wird von diesem Fernseher nicht unterstützt' : 'Kompressor: ' + label);
    updateBadges();
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

  // Replaces the <video> element (needed if Web Audio captured it and turned out silent).
  function replaceVideo() {
    var fresh = document.createElement('video');
    fresh.id = 'video';
    video.parentNode.replaceChild(fresh, video);
    video = fresh;
    video.addEventListener('timeupdate', updateProgress);
    TT.audio.reset();
    if (current) play(true);
  }

  function onCompressorFail() {
    TT.toast('Der Kompressor wird von diesem Fernseher nicht unterstützt');
    replaceVideo();
    updateBadges();
  }

  function destroyHls() {
    if (hls) { try { hls.destroy(); } catch (e) { /* ignore */ } }
    hls = null;
  }

  // ---- VOD resume positions --------------------------------------------------
  function savedPos(id) { return (TT.store.get('vodPos', {}) || {})[id] || 0; }

  function savePos() {
    if (!current || !current.vod || !video.currentTime) return;
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
    var cfg = {
      pLoader: makePlaylistLoader(loaderCtrl),
      liveSyncDurationCount: 3,
      liveMaxLatencyDurationCount: 10,
      maxBufferLength: isVod ? 30 : 20,
      backBufferLength: 10,
      enableWorker: true,
      lowLatencyMode: false
    };
    cfg.fLoader = TT.fmp4ts.makeFragLoader(Hls, function (url) {
      return loaderCtrl ? loaderCtrl.mapFor(url) : (vodMaps[url] || null);
    }, conv, function (e) { TT.log('fmp4->ts failed', e); });
    hls = new Hls(cfg);
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
      if (isVod) {
        var pos = savedPos(current.vod.id);
        if (pos > 30) { video.currentTime = pos; TT.toast('Weiter bei ' + fmtTime(pos)); }
      }
      var p = video.play();
      if (p && p.catch) p.catch(function () { /* autoplay blocked: user presses play */ });
    });
    hls.on(Hls.Events.FRAG_BUFFERED, function () {
      if (my !== session) return;
      retries = 0;
      if (!video.paused || !pausedAt) setStatus('');
    });
    hls.on(Hls.Events.ERROR, function (ev, data) {
      if (!data.fatal || my !== session) return;
      TT.log('hls fatal error', data.type, data.details);
      if (data.type === Hls.ErrorTypes.MEDIA_ERROR && retries < 3) {
        retries++;
        hls.recoverMediaError();
        return;
      }
      var offline = !isVod && data.response && data.response.code === 404;
      if (offline) { setStatus('Der Stream ist offline'); destroyHls(); return; }
      if (retries < 4) {
        retries++;
        setStatus('Verbinde neu …');
        if (isVod) savePos();
        setTimeout(function () { if (my === session) play(true); }, 2000 * retries);
      } else {
        setStatus('Wiedergabe fehlgeschlagen (' + data.details + ')');
        destroyHls();
      }
    });
    hls.attachMedia(video);
    hls.loadSource(src);
    TT.audio.attach(video, onCompressorFail);
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
        throw new Error('Dieser Stream ist nicht verfügbar: ' + (info.authorization.reason || 'gesperrt'));
      }
      var src = TT.api.usherUrl(login, token);
      return TT.loadHls().then(function () { if (my === session) startHls(my, ctrl, src, false); });
    });
  }

  function playVod(my, vod) {
    setStatus('Video wird geladen …');
    ctrl = null;
    return TT.api.vodToken(vod.id).then(function (token) {
      if (my !== session) return;
      var src = TT.api.vodUsherUrl(vod.id, token);
      return TT.loadHls().then(function () { if (my === session) startHls(my, null, src, true); });
    }, function (err) {
      throw new Error('Dieses Video ist nicht verfügbar (' + (err.message || err) + '). Vielleicht nur für Abonnenten.');
    });
  }

  function play(keepRetries) {
    var my = ++session;
    destroyHls();
    if (!keepRetries) retries = 0;
    var p = current.vod ? playVod(my, current.vod) : playLive(my, current.stream);
    p.catch(function (err) {
      if (my !== session) return;
      setStatus(String(err.message || err));
    });
  }

  function seekBy(sec) {
    if (!current || !current.vod) return;
    var dur = video.duration || current.vod.lengthSeconds || 0;
    video.currentTime = Math.max(0, Math.min(dur ? dur - 2 : Infinity, video.currentTime + sec));
    showOsd();
  }

  function setVodClass(isVod) {
    var p = $('player');
    p.className = p.className.replace(/\bis-vod\b/g, '').trim() + (isVod ? ' is-vod' : '');
  }

  TT.player = {
    init: function () {
      video = $('video');
      video.addEventListener('timeupdate', updateProgress);
      TT.chat.init();
    },

    open: function (stream, list) {
      hideOsd();
      cancelScrub();
      current = { stream: stream };
      playlist = list || [stream];
      index = Math.max(0, playlist.indexOf(stream));
      setVodClass(false);
      fillLiveOsd(stream);
      showOsd();
      updateBadges();
      play();
      TT.chat.open(stream.broadcaster.login);
      // Refresh title/viewers in the OSD.
      TT.api.channel(stream.broadcaster.login).then(function (u) {
        if (!current || current.stream !== stream || !u || !u.stream) return;
        u.stream.broadcaster = { login: u.login, displayName: u.displayName, profileImageURL: u.profileImageURL };
        if (u.stream.createdAt) stream.createdAt = u.stream.createdAt;
        fillLiveOsd(u.stream);
      }).catch(function () { /* keep what we have */ });
    },

    // vod: { id, title, lengthSeconds, publishedAt, game }; owner: { login, displayName, profileImageURL }
    openVod: function (vod, owner) {
      hideOsd();
      cancelScrub();
      TT.chat.close();
      current = { vod: vod, owner: owner };
      playlist = [];
      setVodClass(true);
      fillOsd(vod.title, owner, [vod.game ? vod.game.displayName : '',
        vod.publishedAt ? new Date(vod.publishedAt).toLocaleDateString('de-DE') : ''].filter(Boolean).join('  ·  '));
      showOsd();
      updateBadges();
      play();
      clearInterval(saveTimer);
      saveTimer = setInterval(savePos, 10000);
    },

    close: function () {
      cancelScrub();
      hideOsd();
      savePos();
      clearInterval(saveTimer);
      session++;
      destroyHls();
      TT.chat.close();
      current = null;
      ctrl = null;
      setVodClass(false);
      try { video.pause(); video.removeAttribute('src'); video.load(); } catch (e) { /* ignore */ }
      setStatus('');
    },

    // Set by the views: opens a channel page from the player's "Channel" button.
    onChannelPage: null,

    // Returns true if the key was handled. `repeat` is true while a key is held down.
    key: function (k, repeat) {
      var isVod = !!(current && current.vod);
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
          if (current) showOsd();
          return true;
        case 'rewind':
        case 'ff':
          if (isVod) scrubKey(k === 'rewind' ? -1 : 1, true);
          return true;
        case 'playpause': togglePause(); return true;
        case 'play': TT.player.resume(); return true;
        case 'pause': TT.player.pause(); return true;
        case 'red':
          TT.toast(isVod ? 'Bei Videos gibt es keinen Chat' : 'Chat: ' + TT.chat.cycle());
          if (osdVisible) showOsd();
          return true;
        case 'green':
          cycleCompressor();
          if (osdVisible) showOsd();
          return true;
        case 'chup':
        case 'chdown':
          if (isVod) { seekBy(k === 'chup' ? 300 : -300); return true; }
          switchStream(k === 'chup' ? -1 : 1);
          return true;
      }
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

  function candidates() {
    var all = scopeFn().querySelectorAll('.focusable');
    var out = [];
    for (var i = 0; i < all.length; i++) if (visible(all[i])) out.push(all[i]);
    return out;
  }

  function set(el) {
    if (!el) return;
    if (current && current !== el) current.classList.remove('focused');
    current = el;
    el.classList.add('focused');
    if (el.scrollIntoViewIfNeeded) el.scrollIntoViewIfNeeded(true);
    else el.scrollIntoView(false);
    if (el.onfocusin2) el.onfocusin2();
  }

  // Overlap of two 1-D ranges (0 if none).
  function overlap(a1, a2, b1, b2) {
    return Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));
  }

  function move(dir) {
    var list = candidates();
    if (!current || list.indexOf(current) < 0) { set(list[0]); return; }
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
  var followBox = null, followTimer = null;
  var focusContent = false; // set when a page is opened from the sidebar menu

  var NAV = [
    ['home', 'Startseite', 'M12 3l9 8h-3v9h-5v-6h-2v6H6v-9H3z'],
    ['following', 'Folge ich', 'M12 21l-1.4-1.3C5.4 15 2 12 2 8.4 2 5.4 4.4 3 7.4 3c1.7 0 3.4.8 4.6 2.1C13.2 3.8 14.9 3 16.6 3 19.6 3 22 5.4 22 8.4c0 3.6-3.4 6.6-8.6 11.3z'],
    ['categories', 'Kategorien', 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z'],
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

  function pop() {
    if (stack.length <= 1) return false;
    var t = stack.pop();
    if (t.onLeave) t.onLeave();
    if (!t.player) main.removeChild(t.el);
    var prev = top();
    prev.el.style.display = '';
    highlightSide();
    if (prev.lastFocus && prev.el.contains(prev.lastFocus)) TT.focus.set(prev.lastFocus);
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

  function avatar(url, cls) {
    var img = hideBroken(TT.el('img', 'av' + (cls ? ' ' + cls : '')));
    if (url) img.src = url;
    return img;
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
    img.src = (s.previewImageURL || '') + (s.previewImageURL ? '?t=' + Math.floor(Date.now() / 300000) : '');
    thumb.appendChild(img);
    thumb.appendChild(TT.el('span', 'pill live', 'Live'));
    thumb.appendChild(TT.el('span', 'pill viewers', TT.fmtViewers(s.viewersCount)));
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
    img.src = v.previewThumbnailURL || '';
    thumb.appendChild(img);
    if (v.publishedAt) thumb.appendChild(TT.el('span', 'pill viewers', TT.fmtAgo(v.publishedAt)));
    thumb.appendChild(TT.el('span', 'pill dur', fmtDuration(v.lengthSeconds || 0)));
    lift.appendChild(thumb);
    card.appendChild(lift);
    var txt = TT.el('div', 'card-text pad');
    txt.appendChild(TT.el('div', 'card-title', v.title || 'Ohne Titel'));
    txt.appendChild(TT.el('div', 'card-sub', [v.viewCount ? TT.fmtCount(v.viewCount) + ' Aufrufe' : '',
      v.game ? v.game.displayName : ''].filter(Boolean).join(' · ')));
    card.appendChild(txt);
    return TT.focusable(card, function () { openVodPlayer(v, owner); });
  }

  function categoryCard(g) {
    var card = TT.el('div', 'card cat-card');
    var lift = TT.el('div', 'lift');
    var box = TT.el('div', 'box');
    var img = hideBroken(TT.el('img'));
    img.src = g.boxArtURL || '';
    box.appendChild(img);
    lift.appendChild(box);
    card.appendChild(lift);
    card.appendChild(TT.el('div', 'card-title', g.displayName || g.name));
    if (g.viewersCount) card.appendChild(TT.el('div', 'card-sub', TT.fmtViewers(g.viewersCount)));
    return TT.focusable(card, function () { views.category(g); });
  }

  // Round channel tile (offline channels, search results). c: { login, displayName, profileImageURL, stream? }
  function channelTile(c) {
    var card = TT.el('div', 'card chan-tile' + (c.stream ? ' is-live' : ''));
    var ring = TT.el('div', 'ring');
    ring.appendChild(avatar(c.profileImageURL));
    card.appendChild(ring);
    card.appendChild(TT.el('div', 'card-title', c.displayName || c.login));
    card.appendChild(TT.el('div', 'card-sub' + (c.stream ? ' live-text' : ''),
      c.stream ? 'Live · ' + (c.stream.game ? c.stream.game.displayName : TT.fmtViewers(c.stream.viewersCount)) : 'Offline'));
    return TT.focusable(card, function () { views.channel(c.login); });
  }

  function hero(s, list) {
    var b = s.broadcaster || {};
    var card = TT.el('div', 'hero');
    var thumb = TT.el('div', 'thumb');
    var img = hideBroken(TT.el('img'));
    img.src = (s.previewImageURL || '').replace('440x248', '880x496') + '?t=' + Math.floor(Date.now() / 300000);
    thumb.appendChild(img);
    thumb.appendChild(TT.el('span', 'pill live', 'Live'));
    thumb.appendChild(TT.el('span', 'pill viewers', TT.fmtViewers(s.viewersCount)));
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

  function openPlayer(stream, list) {
    showPlayer();
    TT.player.open(stream, list);
  }

  function openVodPlayer(vod, owner) {
    showPlayer();
    TT.player.openVod(vod, owner);
  }

  // ---- sidebar: followed channels ---------------------------------------------
  function followEntry(c, live, list) {
    var item = TT.el('div', 'fol' + (live ? '' : ' off'));
    item.appendChild(avatar(c.profileImageURL));
    var t = TT.el('div', 'fol-text');
    t.appendChild(TT.el('div', 'fol-name', c.displayName || c.login));
    t.appendChild(TT.el('div', 'fol-game', live ? (live.game ? live.game.displayName : 'Live') : 'Offline'));
    item.appendChild(t);
    if (live) item.appendChild(TT.el('div', 'fol-viewers', TT.fmtCount(live.viewersCount)));
    return TT.focusable(item, function () {
      if (live) openPlayer(live, list); else views.channel(c.login);
    });
  }

  // Live followed channels (and up to 15 offline ones) in the sidebar, refreshed every 3 min.
  function refreshFollows() {
    if (!followBox) return;
    clearTimeout(followTimer);
    followTimer = setTimeout(refreshFollows, 180000);
    var hadFocus = followBox.contains(TT.focus.get());
    if (!TT.api.auth.current()) {
      TT.clear(followBox);
      var hint = TT.el('div', 'fol-login', 'Melde dich an, um deine Kanäle hier zu sehen');
      followBox.appendChild(TT.focusable(hint, function () { resetTo('settings', views.settings); }));
      return;
    }
    var liveP = TT.api.followedLive().catch(function () { return []; });
    var allP = TT.api.followedChannels().catch(function () { return []; });
    Promise.all([liveP, allP]).then(function (r) {
      var live = r[0].slice().sort(function (a, b) { return b.viewersCount - a.viewersCount; });
      var liveLogins = {};
      live.forEach(function (s) { liveLogins[s.broadcaster.login] = 1; });
      var offline = r[1].filter(function (c) { return !liveLogins[c.login]; }).slice(0, 15);
      TT.clear(followBox);
      live.forEach(function (s) { followBox.appendChild(followEntry(s.broadcaster, s, live)); });
      offline.forEach(function (c) { followBox.appendChild(followEntry(c, null)); });
      if (!live.length && !offline.length) followBox.appendChild(TT.el('div', 'fol-login', 'Keine gefolgten Kanäle'));
      if (hadFocus) focusFirstIn(followBox);
    });
  }

  // ---- screens ---------------------------------------------------------------
  var views = {
    home: function () {
      var el = section('');
      push('home', el);
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
        var rec = top.filter(function (s) { return s !== featured; });
        if (rec.length) {
          el.appendChild(carousel('Empfohlene', ' Live-Kanäle', rec.map(function (s) { return streamCard(s, rec); })));
        }
        var cats = TT.el('div');
        el.appendChild(cats);
        TT.api.topCategories().then(function (games) {
          if (games.length) cats.appendChild(carousel('Kategorien', ', die dir gefallen könnten', games.slice(0, 20).map(categoryCard)));
        }).catch(function () { /* the rest of the page still works */ });
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

    categories: function () {
      var el = section('Kategorien');
      push('categories', el);
      load(el, TT.api.topCategories(), function (games) {
        el.appendChild(grid(games.map(categoryCard), 'cats'));
      });
    },

    category: function (g) {
      var el = section(g.displayName || g.name, g.viewersCount ? TT.fmtViewers(g.viewersCount) : '');
      push('category', el);
      load(el, TT.api.categoryStreams(g.name), function (streams) {
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
        if (u.stream) {
          var bar = TT.el('div', 'toolbar');
          watch = button('▶  Live ansehen', function () { openPlayer(u.stream, [u.stream]); }, 'primary');
          bar.appendChild(watch);
          el.appendChild(bar);
        }
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
      row('Twitch-Konto', a ? 'OK drücken zum Abmelden' : 'Für „Folge ich“ und deine Kanäle in der Seitenleiste',
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
        function () { if (TT.audio.cycle(null) === null) TT.toast('Der Kompressor wird von diesem Fernseher nicht unterstützt'); });
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
      row('7TV-Emotes im Chat', 'Ausschalten, falls der Chat die Wiedergabe ruckeln lässt',
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
      input.appendChild(icon(NAV[3][2]));
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
        p.appendChild(TT.el('span', 'login-url', d.verification_uri.replace(/^https?:\/\//, '')));
        p.appendChild(document.createTextNode(' und gib diesen Code ein:'));
        status.appendChild(p);
        status.appendChild(TT.el('div', 'login-code', d.user_code));
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
      side.appendChild(TT.el('div', 'side-h', 'Gefolgte Kanäle'));
      followBox = TT.el('div', 'side-follows');
      side.appendChild(followBox);
      refreshFollows();
      // Player's 'Channel' button: leave the player and show that channel's page
      // (or go back to it if we came from there).
      TT.player.onChannelPage = function (login) {
        pop();
        var t = top();
        if (!(t && t.name === 'channel' && t.login === login)) views.channel(login);
      };
      TT.focus.setScope(function () {
        var t = top();
        return t && t.player ? t.el : document.getElementById('app');
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
    412: 'rewind', 417: 'ff'
  };
  // Letter shortcuts for desktop testing, only while the player is open.
  var PLAYER_LETTERS = { 82: 'red', 71: 'green' };
  var TIZEN_KEYS = ['MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaStop',
    'ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue', 'ChannelUp', 'ChannelDown',
    'MediaRewind', 'MediaFastForward'];
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

    var k = KEYS[e.keyCode] || (inPlayer ? PLAYER_LETTERS[e.keyCode] : null);
    if (!k) return;
    e.preventDefault();

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
    TT.checkService().then(function (ok) {
      if (!ok) TT.toast('Der Twizen-Dienst läuft nicht. Stöbern geht, Abspielen nicht.', 8000);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
