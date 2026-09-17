/* remote-sync.js - PouchTasker incremental sync client
   Depends on localDB (PouchDB) and localStorage.
   No build, vanilla JS. Async non-blocking with timeout + console.warn.
 */
(function (global) {
    'use strict';

    var SYNC_TIMEOUT_MS = 7000;
    var LS_ENDPOINT = 'syncEndpoint';
    var LS_TOKEN = 'syncToken';
    var LS_ENC = 'syncEncPassword';
    var LS_LAST_SYNC = 'syncLastSync';

    function getEndpoint() { return (localStorage.getItem(LS_ENDPOINT) || '').trim(); }
    function getToken()    { return (localStorage.getItem(LS_TOKEN) || '').trim(); }
    function getEncPassword() { return (localStorage.getItem(LS_ENC) || ''); }
    function getLastSync() { return localStorage.getItem(LS_LAST_SYNC) || null; }
    function setLastSync(iso) { if (iso) localStorage.setItem(LS_LAST_SYNC, iso); }

    function isValidUrl(s) {
        if (!s) return false;
        try {
            var u = new URL(s, (typeof window !== 'undefined' && window.location) ? window.location.href : 'http://localhost/');
            return u.protocol === 'http:' || u.protocol === 'https:';
        } catch(e){ return false; }
    }
    function isEnabled() {
        var ep = getEndpoint();
        return ep && isValidUrl(ep);
    }

    function buildHeaders() {
        var h = { 'Content-Type': 'application/json' };
        var tok = getToken();
        if (tok) h['Authorization'] = 'Bearer ' + tok;
        var enc = getEncPassword();
        if (enc) h['X-Enc-Password'] = enc;
        // multi-user openness: send owner as X-User if needed
        h['X-User'] = 'admin';
        return h;
    }

    function fetchWithTimeout(url, opts, timeout) {
        timeout = timeout || SYNC_TIMEOUT_MS;
        var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        var timer = null;
        if (controller) {
            opts = Object.assign({}, opts, { signal: controller.signal });
            timer = setTimeout(function(){ controller.abort(); }, timeout);
        }
        var p = fetch(url, opts);
        // if no AbortController, race with timeout
        if (!controller) {
            var timeoutP = new Promise(function(_, rej){
                setTimeout(function(){ rej(new Error('sync timeout after '+timeout+'ms')); }, timeout);
            });
            p = Promise.race([p, timeoutP]);
        }
        return p.then(function(res){
            if (timer) clearTimeout(timer);
            return res;
        }).catch(function(err){
            if (timer) clearTimeout(timer);
            throw err;
        });
    }

    function warn(msg, err) {
        console.warn('[sync] ' + msg, err || '');
    }

    function getDB() {
        if (global.localDB) return global.localDB;
        if (typeof window !== 'undefined' && window.localDB) return window.localDB;
        try { if (typeof localDB !== 'undefined' && localDB) return localDB; } catch(e) {}
        if (typeof globalThis !== 'undefined' && globalThis.localDB) return globalThis.localDB;
        return null;
    }

    function apiUrl(action, extraParams) {
        var ep = getEndpoint();
        if (!ep) return null;
        try {
            var base = new URL(ep, (typeof window !== 'undefined' && window.location) ? window.location.href : 'http://localhost/');
            base.searchParams.set('action', action);
            if (extraParams) {
                Object.keys(extraParams).forEach(function(k){
                    if (extraParams[k] != null && extraParams[k] !== '') base.searchParams.set(k, extraParams[k]);
                    else if (extraParams[k] === '') base.searchParams.set(k, '');
                });
            }
            return base.toString();
        } catch(e) {
            // fallback to old string concat
            var u = ep;
            var sep = u.indexOf('?') === -1 ? '?' : '&';
            u += sep + 'action=' + encodeURIComponent(action);
            if (extraParams) {
                Object.keys(extraParams).forEach(function(k){
                    if (extraParams[k] != null) u += '&' + encodeURIComponent(k) + '=' + encodeURIComponent(extraParams[k]);
                });
            }
            return u;
        }
    }

    // --- Pull ---
    function pull(since) {
        if (!isEnabled()) return Promise.resolve({ tasks:[], serverTime: new Date().toISOString() });
        if (since === undefined) since = getLastSync();
        var url = apiUrl('pull', since ? { since: since } : null);
        return fetchWithTimeout(url, { method: 'GET', headers: buildHeaders() })
            .then(function(res){
                if (!res.ok) throw new Error('pull HTTP '+res.status);
                return res.json();
            })
            .then(function(data){
                if (!data.tasks) data.tasks = [];
                if (data.serverTime) setLastSync(data.serverTime);
                return data;
            })
            .catch(function(err){ warn('pull failed (non-blocking)', err); throw err; });
    }

    function search(query, since) {
        if (!isEnabled()) return Promise.resolve({tasks:[]});
        var url = apiUrl('search', { q: query, since: since || '' });
        return fetchWithTimeout(url, { method:'GET', headers: buildHeaders() })
            .then(function(r){ if(!r.ok) throw new Error('search '+r.status); return r.json(); })
            .catch(function(err){ warn('search failed', err); throw err; });
    }

    function getTask(luid) {
        if (!isEnabled()) return Promise.resolve(null);
        var url = apiUrl('get', { luid: luid });
        return fetchWithTimeout(url, { method:'GET', headers: buildHeaders() })
            .then(function(r){ if(!r.ok) throw new Error('get '+r.status); return r.json(); })
            .catch(function(err){ warn('get failed', err); throw err; });
    }

    function updateTask(task) {
        if (!isEnabled()) return Promise.resolve(false);
        var url = apiUrl('update');
        return fetchWithTimeout(url, { method:'POST', headers: buildHeaders(), body: JSON.stringify(task) })
            .then(function(r){ if(!r.ok) throw new Error('update '+r.status); return r.json(); })
            .catch(function(err){ warn('update failed', err); throw err; });
    }

    // --- Push ---
    function push(tasks, tombstones) {
        if (!isEnabled()) return Promise.resolve({ accepted:[] });
        if (!tasks || !tasks.length) tasks = [];
        if (!tombstones) tombstones = [];
        if (!tasks.length && !tombstones.length) return Promise.resolve({ accepted:[] });
        var url = apiUrl('push');
        var body = JSON.stringify({ tasks: tasks, tombstones: tombstones });
        return fetchWithTimeout(url, { method:'POST', headers: buildHeaders(), body: body })
            .then(function(res){
                if (!res.ok) throw new Error('push HTTP '+res.status);
                return res.json();
            })
            .then(function(data){
                if (data.serverTime) setLastSync(data.serverTime);
                return data;
            })
            .catch(function(err){ warn('push failed (non-blocking)', err); throw err; });
    }

    function syncIncremental(changes, tombstones, since) {
        if (!isEnabled()) return Promise.resolve(null);
        if (since === undefined) since = getLastSync();
        var url = apiUrl('sync');
        var body = JSON.stringify({ since: since, tasks: changes || [], tombstones: tombstones || [] });
        return fetchWithTimeout(url, { method:'POST', headers: buildHeaders(), body: body })
            .then(function(res){ if(!res.ok) throw new Error('sync HTTP '+res.status); return res.json(); })
            .then(function(data){
                if (data.serverTime) setLastSync(data.serverTime);
                return data;
            })
            .catch(function(err){ warn('sync failed', err); throw err; });
    }

    // Merge remote tasks into local PouchDB (newer wins)
    function mergeRemoteTasks(remoteTasks) {
        if (!remoteTasks || !remoteTasks.length) return Promise.resolve(0);
        // need db access - use db_getAllDocs if available, otherwise getDB()
        var getAll = (typeof db_getAllDocs === 'function') ? db_getAllDocs : function(){
            var db = getDB();
            if (!db) return Promise.reject(new Error('localDB not available for merge'));
            return db.allDocs({include_docs:true}).then(function(r){ return r.rows.map(function(x){return x.doc;}); });
        };
        return getAll().then(function(localDocs){
            var byLuid = {};
            localDocs.forEach(function(d){ if(d.luid!=null) byLuid[String(d.luid)] = d; });
            var ops = [];
            var count = 0;
            remoteTasks.forEach(function(rt){
                // normalize alias
                if (!rt.lastEdit && rt.lastWrite) rt.lastEdit = rt.lastWrite;
                if (!rt.lastWrite && rt.lastEdit) rt.lastWrite = rt.lastEdit;
                var luidStr = String(rt.luid);
                var local = byLuid[luidStr];
                if (!local) {
                    // new task - strip _rev/_id if present to allow insert, keep luid
                    var nd = Object.assign({}, rt);
                    delete nd._id; delete nd._rev;
                    var db = getDB();
                    if (!db) { warn('merge insert fail '+luidStr+' - no DB'); return; }
                    ops.push(db.post(nd).then(function(){ count++; }).catch(function(e){ warn('merge insert fail '+luidStr, e); }));
                } else {
                    var tsRemote = Date.parse(rt.lastEdit || rt.lastWrite || 0) || 0;
                    var tsLocal  = Date.parse(local.lastEdit || local.lastWrite || 0) || 0;
                    // also consider lastProgress as alias for conflict
                    var tsRemote2 = Date.parse(rt.lastProgress||0) || 0;
                    var tsLocal2 = Date.parse(local.lastProgress||0) || 0;
                    var effectiveRemote = Math.max(tsRemote, tsRemote2);
                    var effectiveLocal  = Math.max(tsLocal, tsLocal2);
                    if (effectiveRemote > effectiveLocal) {
                        var merged = Object.assign({}, local, rt);
                        // preserve _id/_rev
                        merged._id = local._id;
                        merged._rev = local._rev;
                        // ensure both aliases
                        merged.lastWrite = merged.lastEdit;
                        var db2 = getDB();
                        if (!db2) { warn('merge update fail '+luidStr+' - no DB'); return; }
                        ops.push(db2.put(merged).then(function(){ count++; }).catch(function(e){ warn('merge update fail '+luidStr, e); }));
                    }
                }
            });
            if (!ops.length) return 0;
            return Promise.all(ops).then(function(){ return count; });
        });
    }

    function pullOnLoad() {
        if (!isEnabled()) return Promise.resolve(0);
        return pull().then(function(data){
            if (!data.tasks || !data.tasks.length) return 0;
            return mergeRemoteTasks(data.tasks);
        }).then(function(mergedCount){
            if (mergedCount > 0 && typeof loadAllTask === 'function') {
                // refresh UI after merge
                try { loadAllTask(); } catch(e){ warn('loadAllTask after pull', e); }
            }
            return mergedCount;
        }).catch(function(err){
            warn('pullOnLoad non-blocking', err);
            return 0;
        });
    }

    // Collect local changes since timestamp (incremental, includes status=0)
    function collectLocalChanges(since) {
        var tsSince = since ? Date.parse(since) : 0;
        if (isNaN(tsSince)) tsSince = 0;
        var getAll = (typeof db_getAllDocs === 'function') ? db_getAllDocs : function(){
            var db = getDB();
            if (!db) return Promise.reject(new Error('localDB not available for collect'));
            return db.allDocs({include_docs:true}).then(function(r){ return r.rows.map(function(x){return x.doc;}); });
        };
        return getAll().then(function(docs){
            return docs.filter(function(d){
                if (d._id && d._id.indexOf('_design')===0) return false;
                var le = Date.parse(d.lastEdit || d.lastWrite || 0) || 0;
                var lp = Date.parse(d.lastProgress || 0) || 0;
                var eff = Math.max(le, lp);
                return eff > tsSince;
            });
        });
    }

    global.RemoteSync = {
        getEndpoint: getEndpoint,
        getToken: getToken,
        getEncPassword: getEncPassword,
        getLastSync: getLastSync,
        setLastSync: setLastSync,
        isEnabled: isEnabled,
        isValidUrl: isValidUrl,
        pull: pull,
        push: push,
        search: search,
        getTask: getTask,
        updateTask: updateTask,
        syncIncremental: syncIncremental,
        mergeRemoteTasks: mergeRemoteTasks,
        pullOnLoad: pullOnLoad,
        collectLocalChanges: collectLocalChanges,
        SYNC_TIMEOUT_MS: SYNC_TIMEOUT_MS
    };

})(typeof window !== 'undefined' ? window : this);
