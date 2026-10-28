/* Twizen 0.3.3 - built from app/js by tools/build.js. Do not edit. */
/* ---- core.js ---- */
;// Shared helpers. All app code is ES5 (no build step) so it runs on older Tizen browsers.
var TT = window.TT = window.TT || {};

TT.VERSION = '0.3.3';
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

TT.fmtCount = function (n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n || 0);
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
    'id title viewersCount previewImageURL(width:440,height:248) ' +
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

  function helixFollowedLive() {
    var a = auth.current();
    var idP = a && a.userId ? Promise.resolve(a.userId) : helix('users').then(function (d) {
      var id = d.data[0].id;
      var cur = auth.current();
      if (cur) { cur.userId = id; auth.save(cur); }
      return id;
    });
    return idP.then(function (id) {
      return helix('streams/followed?first=100&user_id=' + id);
    }).then(function (d) {
      var streams = d.data || [];
      if (!streams.length) return [];
      var q = streams.map(function (s) { return 'id=' + s.user_id; }).join('&');
      return helix('users?' + q).then(function (u) {
        var pics = {};
        (u.data || []).forEach(function (x) { pics[x.id] = x.profile_image_url; });
        return pics;
      }, function () { return {}; }).then(function (pics) {
        return streams.map(function (s) {
          return {
            id: s.id,
            title: s.title,
            viewersCount: s.viewer_count,
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
      'profileImageURL(width:70) stream{ id title viewersCount ' +
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

    topStreams: function () {
      return gql('query{ streams(first:30){ edges{ node{ ' + STREAM_FIELDS + ' } } } }')
        .then(function (d) { return edgesToNodes(d.streams); });
    },

    topCategories: function () {
      return gql('query{ games(first:30){ edges{ node{ name displayName ' +
        'boxArtURL(width:285,height:380) viewersCount } } } }')
        .then(function (d) { return edgesToNodes(d.games); });
    },

    categoryStreams: function (name) {
      return gql('query($name:String!){ game(name:$name){ streams(first:30){ edges{ node{ ' +
        STREAM_FIELDS + ' } } } } }', { name: name })
        .then(function (d) { return d.game ? edgesToNodes(d.game.streams) : []; });
    },

    // Official Helix endpoint first; GQL's followedLiveUsers as a fallback.
    followedLive: function () {
      return helixFollowedLive().catch(function (helixErr) {
        TT.log('helix followed failed, trying GQL:', helixErr && helixErr.message);
        return gqlFollowedLive().catch(function (gqlErr) {
          throw new Error('Could not load followed channels (' + (helixErr.message || helixErr) + '; ' +
            (gqlErr.message || gqlErr) + '). Try signing out and in again.');
        });
      });
    },

    // Channel page: profile, live stream (if any) and recent videos.
    channelPage: function (login) {
      return gql('query($login:String!){ user(login:$login){ id login displayName ' +
        'profileImageURL(width:150) description stream{ id title viewersCount ' +
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
        'stream{ id title viewersCount previewImageURL(width:440,height:248) game{ name displayName } } } } ' +
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
        'profileImageURL(width:70) stream{ id title viewersCount ' +
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
  }

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
    var hasMap = false;
    for (i = start; i < segs.length; i++) if (segs[i].map) hasMap = true;
    var out = ['#EXTM3U', '#EXT-X-VERSION:' + (hasMap ? 6 : 3), '#EXT-X-TARGETDURATION:' + target,
      '#EXT-X-MEDIA-SEQUENCE:' + sns[start]];
    var lastMap = null;
    for (i = start; i < segs.length; i++) {
      if (segs[i].map && segs[i].map !== lastMap) { out.push(segs[i].map); lastMap = segs[i].map; }
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
    light: { label: 'Light', threshold: -24, ratio: 3, knee: 12, attack: 0.01, release: 0.25, makeupDb: 3 },
    night: { label: 'Night', threshold: -40, ratio: 12, knee: 6, attack: 0.003, release: 0.25, makeupDb: 8 }
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
    label: function () { return PRESETS[mode] ? PRESETS[mode].label : 'Off'; },
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
      else if (/ JOIN #/.test(raw) && raw.indexOf(':justinfan') === 0) system('Connected to chat');
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
      return { off: 'Off', side: 'Beside video', overlay: 'Over video' }[mode];
    }
  };
})();

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
  function rewriteVodMedia(url, text) {
    return text.split(/\r?\n/).map(function (line) {
      var l = line.trim();
      if (!l || l.charAt(0) === '#') return line;
      return proxied(absolute(l, url));
    }).join('\n');
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
      fmtTime(pos) + ' / ' + fmtTime(dur) + (scrub.active ? '   (' + stepLabel(scrub.step) + ' steps)' : '');
  }

  // ---- OSD with focusable control row -----------------------------------------
  // Rows: 'scrub' (VOD progress bar: ◀ ▶ seek) and 'buttons' (◀ ▶ choose, OK press).
  var osdVisible = false, row = 'buttons', btnIndex = 0, buttons = [];

  function defaultRow() { return current && current.vod ? 'scrub' : 'buttons'; }

  function controlList() {
    var isVod = !!(current && current.vod);
    var list = [{ label: video.paused ? '▶  Play' : '❚❚  Pause', fn: togglePause }];
    if (isVod) {
      list.push({ label: '◀◀ 1 min', fn: function () { seekBy(-60); } });
      list.push({ label: '1 min ▶▶', fn: function () { seekBy(60); } });
    } else {
      list.push({ label: 'Chat: ' + TT.chat.label(), fn: function () { TT.chat.cycle(); } });
    }
    list.push({ label: 'Compressor: ' + TT.audio.label(), fn: cycleCompressor });
    if (!isVod && playlist.length > 1) {
      list.push({ label: '▲ Prev stream', fn: function () { switchStream(-1); } });
      list.push({ label: 'Next stream ▼', fn: function () { switchStream(1); } });
    }
    var login = isVod ? current.owner && current.owner.login : current && current.stream.broadcaster.login;
    if (login && TT.player.onChannelPage) {
      list.push({ label: isVod ? 'Channel & videos' : 'Channel & past broadcasts', fn: function () {
        TT.player.onChannelPage(login);
      } });
    }
    return list;
  }

  function renderControls() {
    buttons = controlList();
    if (btnIndex >= buttons.length) btnIndex = buttons.length - 1;
    var box = $('osd-controls');
    TT.clear(box);
    buttons.forEach(function (b, i) {
      box.appendChild(TT.el('div', 'ctl-btn' + (row === 'buttons' && i === btnIndex ? ' sel' : ''), b.label));
    });
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
    TT.toast(label === null ? 'Audio compressor is not supported on this TV' : 'Compressor: ' + label);
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
        ctrl.adHow === 'backup' ? 'Ad blocked (backup stream)' : 'Ad blocked (waiting)'));
    }
    if (TT.audio.mode() !== 'off') b.appendChild(TT.el('span', 'badge', 'COMP: ' + TT.audio.label()));
  }

  function fillOsd(title, owner, meta) {
    owner = owner || {};
    $('osd-avatar').src = owner.profileImageURL || '';
    $('osd-name').textContent = owner.displayName || owner.login || '';
    $('osd-title').textContent = title || '';
    $('osd-meta').textContent = meta || '';
  }

  function fillLiveOsd(s) {
    fillOsd(s.title, s.broadcaster, [s.game ? s.game.displayName : '',
      s.viewersCount ? TT.fmtCount(s.viewersCount) + ' viewers' : ''].filter(Boolean).join('  ·  '));
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
    TT.toast('Audio compressor is not supported on this TV');
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
    hls = new Hls({
      pLoader: makePlaylistLoader(loaderCtrl),
      liveSyncDurationCount: 3,
      liveMaxLatencyDurationCount: 10,
      maxBufferLength: isVod ? 30 : 20,
      backBufferLength: 10,
      enableWorker: true,
      lowLatencyMode: false
    });
    hls.on(Hls.Events.MANIFEST_PARSED, function () {
      if (isVod) {
        var pos = savedPos(current.vod.id);
        if (pos > 30) { video.currentTime = pos; TT.toast('Resuming at ' + fmtTime(pos)); }
      }
      var p = video.play();
      if (p && p.catch) p.catch(function () { /* autoplay blocked: user presses play */ });
    });
    hls.on(Hls.Events.FRAG_BUFFERED, function () {
      if (my !== session) return;
      retries = 0;
      if (diagShown && video.currentTime === 0) return; // keep the diagnostics visible
      if (!video.paused || !pausedAt) setStatus('');
    });
    // Diagnostics: if nothing plays after 15 s, show what the stream contains and the
    // last player error, so a black screen can be reported with details.
    var lastErr = '';
    var diagShown = false;
    setTimeout(function () {
      if (my !== session || !hls || video.currentTime > 0) return;
      diagShown = true;
      var lv = (hls.levels || []).map(function (l) {
        return (l.height || '?') + 'p ' + (l.videoCodec || l.codecSet || '?');
      }).join(', ');
      var cur = hls.levels && hls.levels[hls.currentLevel];
      setStatus('No playback after 15 s. Levels: ' + (lv || 'none') +
        ' | playing: ' + (cur ? cur.height + 'p' : '?') +
        ' | last error: ' + (lastErr || 'none'));
    }, 15000);
    hls.on(Hls.Events.ERROR, function (ev, data) {
      if (my === session) lastErr = data.details + (data.reason ? ' (' + data.reason + ')' : '');
      if (!data.fatal || my !== session) return;
      TT.log('hls fatal error', data.type, data.details);
      if (data.type === Hls.ErrorTypes.MEDIA_ERROR && retries < 3) {
        retries++;
        hls.recoverMediaError();
        return;
      }
      var offline = !isVod && data.response && data.response.code === 404;
      if (offline) { setStatus('Stream is offline'); destroyHls(); return; }
      if (retries < 4) {
        retries++;
        setStatus('Reconnecting…');
        if (isVod) savePos();
        setTimeout(function () { if (my === session) play(true); }, 2000 * retries);
      } else {
        setStatus('Playback failed (' + data.details + ')');
        destroyHls();
      }
    });
    hls.attachMedia(video);
    hls.loadSource(src);
    TT.audio.attach(video, onCompressorFail);
  }

  function playLive(my, stream) {
    var login = stream.broadcaster.login;
    setStatus('Loading ' + (stream.broadcaster.displayName || login) + '…');
    ctrl = new TT.adblock.AdController({
      fetchText: fetchText,
      backupMasterUrl: function (type) {
        return TT.api.playbackToken(login, type, true).then(function (t) {
          return TT.api.usherUrl(login, t);
        });
      },
      onAdState: function (active, how) {
        TT.log('ad state', active, how);
        if (active) TT.toast(how === 'backup' ? 'Ad blocked' : 'Ad blocked, stream resumes after the break');
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
        throw new Error('This stream is not available: ' + (info.authorization.reason || 'forbidden'));
      }
      var src = TT.api.usherUrl(login, token);
      return TT.loadHls().then(function () { if (my === session) startHls(my, ctrl, src, false); });
    });
  }

  function playVod(my, vod) {
    setStatus('Loading video…');
    ctrl = null;
    return TT.api.vodToken(vod.id).then(function (token) {
      if (my !== session) return;
      var src = TT.api.vodUsherUrl(vod.id, token);
      return TT.loadHls().then(function () { if (my === session) startHls(my, null, src, true); });
    }, function (err) {
      throw new Error('This video is not available (' + (err.message || err) + '). It may be subscriber-only.');
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
        vod.publishedAt ? new Date(vod.publishedAt).toLocaleDateString() : ''].filter(Boolean).join('  ·  '));
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
          TT.toast(isVod ? 'Chat is not available for videos' : 'Chat: ' + TT.chat.cycle());
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
      setStatus('Paused');
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
;// Screens and navigation stack.
(function () {
  var main, stack = []; // entries: { name, el, lastFocus, onLeave }
  var sideItems = {};

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

  function highlightSide() {
    var root = stack.length ? stack[0].name : '';
    for (var k in sideItems) {
      if (sideItems.hasOwnProperty(k)) sideItems[k].classList.toggle('active', k === root);
    }
  }

  // ---- building blocks ------------------------------------------------------
  function section(title) {
    var el = TT.el('section');
    if (title) el.appendChild(TT.el('h1', 'view-title', title));
    return el;
  }

  function message(el, text) {
    var m = el.querySelector('.message');
    if (!m) { m = TT.el('div', 'message'); el.appendChild(m); }
    m.textContent = text;
    m.style.display = text ? '' : 'none';
  }

  function streamCard(s, list) {
    var b = s.broadcaster || {};
    var card = TT.el('div', 'card stream-card');
    var thumbWrap = TT.el('div', 'thumb');
    var img = TT.el('img');
    img.src = (s.previewImageURL || '') + (s.previewImageURL ? '?t=' + Math.floor(Date.now() / 300000) : '');
    thumbWrap.appendChild(img);
    thumbWrap.appendChild(TT.el('span', 'live-pill', 'LIVE'));
    thumbWrap.appendChild(TT.el('span', 'viewers-pill', TT.fmtCount(s.viewersCount) + ' viewers'));
    card.appendChild(thumbWrap);
    var info = TT.el('div', 'card-info');
    var av = TT.el('img', 'avatar');
    av.src = b.profileImageURL || '';
    info.appendChild(av);
    var txt = TT.el('div', 'card-text');
    txt.appendChild(TT.el('div', 'card-title', s.title || ''));
    txt.appendChild(TT.el('div', 'card-sub', b.displayName || b.login));
    if (s.game) txt.appendChild(TT.el('div', 'card-sub dim', s.game.displayName));
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
    var thumbWrap = TT.el('div', 'thumb');
    var img = TT.el('img');
    img.src = v.previewThumbnailURL || '';
    thumbWrap.appendChild(img);
    thumbWrap.appendChild(TT.el('span', 'duration-pill', fmtDuration(v.lengthSeconds || 0)));
    card.appendChild(thumbWrap);
    var txt = TT.el('div', 'card-text');
    txt.style.paddingTop = '0.6rem';
    txt.appendChild(TT.el('div', 'card-title', v.title || 'Untitled'));
    var when = v.publishedAt ? new Date(v.publishedAt).toLocaleDateString() : '';
    txt.appendChild(TT.el('div', 'card-sub dim', [when, v.viewCount ? TT.fmtCount(v.viewCount) + ' views' : '',
      v.game ? v.game.displayName : ''].filter(Boolean).join(' · ')));
    card.appendChild(txt);
    return TT.focusable(card, function () { openVodPlayer(v, owner); });
  }

  function categoryCard(g) {
    var card = TT.el('div', 'card cat-card');
    var img = TT.el('img');
    img.src = g.boxArtURL || '';
    card.appendChild(img);
    card.appendChild(TT.el('div', 'card-title', g.displayName || g.name));
    if (g.viewersCount) card.appendChild(TT.el('div', 'card-sub dim', TT.fmtCount(g.viewersCount) + ' viewers'));
    return TT.focusable(card, function () { views.category(g); });
  }

  function streamGrid(streams) {
    var grid = TT.el('div', 'grid streams');
    for (var i = 0; i < streams.length; i++) grid.appendChild(streamCard(streams[i], streams));
    return grid;
  }

  // How long this launch took, and each app file's download time on this TV.
  function startupReport() {
    var box = TT.el('div', 'startup-report dim');
    function sec(ms) { return (ms / 1000).toFixed(1) + ' s'; }
    box.appendChild(TT.el('div', '', 'Startup: ' + (TT.startupMs ? sec(TT.startupMs) : 'unknown') +
      ' from page load to menus'));
    var nav = performance.getEntriesByType ? performance.getEntriesByType('navigation')[0] : null;
    if (nav) box.appendChild(TT.el('div', '', 'index.html: ' + sec(nav.responseEnd - nav.startTime)));
    var res = performance.getEntriesByType ? performance.getEntriesByType('resource') : [];
    res.forEach(function (r) {
      var name = r.name.split('?')[0].split('/').pop();
      if (!/\.(js|css)$/.test(name)) return;
      box.appendChild(TT.el('div', '', name + ': ' + sec(r.duration) +
        (name === 'hls.min.js' ? ' (loaded in the background)' : '')));
    });
    return box;
  }

  function yellowHint() {
    var h = TT.el('div', 'hint-line dim');
    h.appendChild(TT.el('i', 'dot yellow'));
    h.appendChild(document.createTextNode('Channel page & past broadcasts'));
    return h;
  }

  function button(label, onSelect) {
    return TT.focusable(TT.el('div', 'btn', label), onSelect);
  }

  // Loads data into a section; shows errors in place.
  function load(el, promise, render, emptyText) {
    message(el, 'Loading…');
    return promise.then(function (data) {
      message(el, (!data || data.length === 0) ? (emptyText || 'Nothing here') : '');
      var target = (data && data.length !== 0) ? render(data) : null;
      // Move focus into the new content unless the user is browsing the sidebar.
      var f = TT.focus.get();
      var inSidebar = f && document.body.contains(f) && f.closest('#sidebar');
      if (top() && top().el === el && !inSidebar) {
        if (target) TT.focus.set(target); else focusFirstIn(el.querySelector('.grid') || el);
      }
    }, function (err) {
      message(el, 'Error: ' + (err.message || err));
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

  // ---- screens ---------------------------------------------------------------
  var views = {
    home: function () {
      var el = section('Live now');
      push('home', el);
      load(el, TT.api.topStreams(), function (streams) { el.appendChild(yellowHint()); el.appendChild(streamGrid(streams)); });
    },

    categories: function () {
      var el = section('Categories');
      push('categories', el);
      load(el, TT.api.topCategories(), function (games) {
        var grid = TT.el('div', 'grid cats');
        for (var i = 0; i < games.length; i++) grid.appendChild(categoryCard(games[i]));
        el.appendChild(grid);
      });
    },

    category: function (g) {
      var el = section(g.displayName || g.name);
      push('category', el);
      load(el, TT.api.categoryStreams(g.name), function (streams) { el.appendChild(yellowHint()); el.appendChild(streamGrid(streams)); },
        'No live streams in this category');
    },

    channel: function (login) {
      var el = section('');
      push('channel', el);
      top().login = login;
      load(el, TT.api.channelPage(login), function (u) {
        var owner = { login: u.login, displayName: u.displayName, profileImageURL: u.profileImageURL };
        var head = TT.el('div', 'channel-head');
        var av = TT.el('img', 'avatar-lg');
        av.src = u.profileImageURL || '';
        head.appendChild(av);
        var info = TT.el('div');
        info.appendChild(TT.el('h1', '', u.displayName));
        info.appendChild(TT.el('div', u.stream ? 'live-text' : 'dim', u.stream
          ? 'LIVE · ' + TT.fmtCount(u.stream.viewersCount) + ' viewers · ' + (u.stream.title || '')
          : 'Offline'));
        head.appendChild(info);
        el.appendChild(head);
        if (u.stream) {
          var bar = TT.el('div', 'toolbar');
          bar.appendChild(button('Watch live', function () { openPlayer(u.stream, [u.stream]); }));
          el.appendChild(bar);
        }
        el.appendChild(TT.el('h2', '', 'Past broadcasts & videos'));
        if (!u.videoList.length) {
          el.appendChild(TT.el('div', 'message', 'No videos available'));
        } else {
          var grid = TT.el('div', 'grid streams');
          u.videoList.forEach(function (v) { grid.appendChild(videoCard(v, owner)); });
          el.appendChild(grid);
        }
        return el.querySelector('.toolbar .btn') || el.querySelector('.grid .focusable');
      });
    },

    settings: function () {
      var el = section('Settings');
      push('settings', el);
      function toggleRow(label, hint, get, set) {
        var row = TT.el('div', 'setting');
        var text = TT.el('div', '', label);
        text.appendChild(TT.el('span', 'hint', hint));
        var val = TT.el('span', 'value');
        function paint() { val.textContent = get() ? 'On' : 'Off'; }
        row.appendChild(text);
        row.appendChild(val);
        paint();
        el.appendChild(TT.focusable(row, function () { set(!get()); paint(); }));
      }
      toggleRow('7TV emotes in chat',
        'Turn off if chat makes playback stutter on your TV. Applies to the next stream you open.',
        TT.chat.sevenTvEnabled, TT.chat.setSevenTv);
      el.appendChild(TT.el('p', 'dim', 'Twizen v' + TT.VERSION));
      el.appendChild(startupReport());
    },

    following: function () {
      var el = section('Following');
      var a = TT.api.auth.current();
      if (!a) {
        push('following', el);
        renderLogin(el);
        return;
      }
      var bar = TT.el('div', 'toolbar');
      bar.appendChild(TT.el('span', 'dim', 'Signed in as ' + (a.displayName || a.login || '?')));
      bar.appendChild(button('Refresh', function () { resetTo('following', views.following); }));
      bar.appendChild(button('Sign out', function () {
        TT.api.auth.logout();
        resetTo('following', views.following);
      }));
      el.appendChild(bar);
      push('following', el);
      load(el, TT.api.followedLive(), function (streams) { el.appendChild(yellowHint()); el.appendChild(streamGrid(streams)); },
        'None of the channels you follow are live');
    },

    search: function () {
      var el = section('Search');
      push('search', el);
      var query = '';
      var timer = null;
      var input = TT.el('div', 'search-input', '');
      el.appendChild(input);
      var layout = TT.el('div', 'search-layout');
      var kb = TT.el('div', 'keyboard');
      var results = TT.el('div', 'search-results');
      layout.appendChild(kb);
      layout.appendChild(results);
      el.appendChild(layout);

      function update() {
        input.textContent = query || 'Type a channel or category…';
        input.classList.toggle('placeholder', !query);
        clearTimeout(timer);
        if (query.length >= 2) timer = setTimeout(run, 600);
      }

      function run() {
        var q = query;
        TT.clear(results);
        message(results, 'Searching…');
        TT.api.search(q).then(function (r) {
          if (q !== query) return;
          message(results, '');
          var chans = r.channels.slice().sort(function (a, b) { return (b.stream ? 1 : 0) - (a.stream ? 1 : 0); });
          if (chans.length) {
            results.appendChild(TT.el('h2', '', 'Channels'));
            var row = TT.el('div', 'row');
            chans.forEach(function (c) {
              var card = TT.el('div', 'card chan-card' + (c.stream ? ' is-live' : ''));
              var img = TT.el('img', 'avatar-lg');
              img.src = c.profileImageURL || '';
              card.appendChild(img);
              card.appendChild(TT.el('div', 'card-title', c.displayName));
              card.appendChild(TT.el('div', 'card-sub ' + (c.stream ? 'live-text' : 'dim'),
                c.stream ? 'LIVE · ' + TT.fmtCount(c.stream.viewersCount) : 'Offline'));
              row.appendChild(TT.focusable(card, function () { views.channel(c.login); }));
            });
            results.appendChild(row);
          }
          if (r.games.length) {
            results.appendChild(TT.el('h2', '', 'Categories'));
            var row2 = TT.el('div', 'row');
            r.games.forEach(function (g) { row2.appendChild(categoryCard(g)); });
            results.appendChild(row2);
          }
          if (!chans.length && !r.games.length) message(results, 'No results');
        }, function (err) {
          message(results, 'Error: ' + (err.message || err));
        });
      }

      var keys = 'abcdefghijklmnopqrstuvwxyz0123456789_'.split('');
      keys.forEach(function (ch) {
        kb.appendChild(TT.focusable(TT.el('div', 'key', ch), function () { query += ch; update(); }));
      });
      kb.appendChild(TT.focusable(TT.el('div', 'key wide', 'Space'), function () { query += ' '; update(); }));
      kb.appendChild(TT.focusable(TT.el('div', 'key wide', 'Delete'), function () {
        query = query.slice(0, -1); update();
      }));
      kb.appendChild(TT.focusable(TT.el('div', 'key wide', 'Clear'), function () {
        query = ''; TT.clear(results); update();
      }));

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

  function renderLogin(el) {
    var box = TT.el('div', 'login-box');
    box.appendChild(TT.el('p', '', 'Sign in to see the channels you follow.'));
    var status = TT.el('div', 'login-status');
    var btn = button('Sign in with Twitch', start);
    box.appendChild(btn);
    box.appendChild(status);
    el.appendChild(box);
    var polling = null;
    var entry = top();
    entry.onLeave = function () { clearTimeout(polling); };
    TT.focus.set(btn);

    function start() {
      TT.clear(status);
      status.appendChild(TT.el('p', '', 'Requesting code…'));
      TT.api.auth.startDeviceFlow().then(function (d) {
        TT.clear(status);
        status.appendChild(TT.el('p', '', 'On your phone or computer, go to'));
        status.appendChild(TT.el('div', 'login-url', d.verification_uri.replace(/^https?:\/\//, '')));
        status.appendChild(TT.el('p', '', 'and enter this code:'));
        status.appendChild(TT.el('div', 'login-code', d.user_code));
        status.appendChild(TT.el('p', 'dim', 'Waiting for you to approve…'));
        var deadline = Date.now() + d.expires_in * 1000;
        var interval = Math.max(d.interval || 5, 3) * 1000;
        (function poll() {
          polling = setTimeout(function () {
            if (Date.now() > deadline) { TT.clear(status); status.appendChild(TT.el('p', '', 'Code expired, try again.')); return; }
            TT.api.auth.pollDeviceFlow(d.device_code).then(function (a) {
              if (!a) return poll();
              TT.toast('Signed in as ' + (a.displayName || a.login));
              resetTo('following', views.following);
            }, function (err) {
              TT.clear(status);
              status.appendChild(TT.el('p', '', 'Sign-in failed: ' + err.message));
            });
          }, interval);
        })();
      }, function (err) {
        TT.clear(status);
        status.appendChild(TT.el('p', '', 'Could not start sign-in: ' + err.message +
          ' (is the Twizen service running?)'));
      });
    }
  }

  // ---- public ------------------------------------------------------------------
  TT.views = views;
  TT.nav = {
    init: function () {
      main = document.getElementById('main');
      var side = document.getElementById('sidebar');
      [['home', 'Live'], ['categories', 'Categories'], ['following', 'Following'], ['search', 'Search'],
        ['settings', 'Settings']]
        .forEach(function (it) {
          var item = TT.el('div', 'side-item', it[1]);
          sideItems[it[0]] = item;
          side.appendChild(TT.focusable(item, function () { resetTo(it[0], views[it[0]]); }));
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
        return t && t.player ? t.el : document.getElementById('app');
      });
      views.home();
    },
    back: pop,
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
        else { lastRootBack = Date.now(); TT.toast('Press Back again to exit'); }
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
    step('version label', function () {
      document.getElementById('sidebar').appendChild(TT.el('div', 'version', 'v' + TT.VERSION));
    });
    step('player', TT.player.init);
    step('navigation', TT.nav.init);
    var boot = document.getElementById('boot');
    if (boot) boot.parentNode.removeChild(boot);
    TT.startupMs = window.twzT0 ? Date.now() - twzT0 : 0;
    // Fetch the video library in the background so it's ready by the time a stream is picked.
    setTimeout(function () {
      TT.loadHls().then(function (H) {
        if (!H.isSupported()) TT.toast('This TV does not support Media Source playback', 8000);
      }, function (e) { if (window.twzError) twzError(e.message); });
    }, 1000);
    TT.checkService().then(function (ok) {
      if (!ok) TT.toast('Twizen service is not running. Browsing works, playback will not.', 8000);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
