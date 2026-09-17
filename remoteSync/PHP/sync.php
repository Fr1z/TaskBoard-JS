<?php
/**
 * PouchTasker Remote Sync - PHP microservice
 * No external DB. File storage outside webroot if possible, otherwise encrypted json.
 *
 * Supports: pull / push / sync / get / search / update
 * Auth: Authorization: Bearer <token> + optional X-User header or ?auth=base64(user:pass)
 * Storage: storage/<sha256(token+user)>.json  (or .enc if encrypted)
 * Incremental: filter by lastEdit / lastWrite (alias)
 */

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, OPTIONS');
header('Access-Control-Allow-Headers: Authorization, Content-Type, X-User-Pass, X-Enc-Password, X-User');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// --- helpers ---
function getBearerToken() {
    $headers = [];
    if (function_exists('getallheaders')) {
        $headers = getallheaders();
        // normalize case-insensitive
        $headers = array_change_key_case($headers, CASE_LOWER);
    }
    // fallback from $_SERVER
    $auth = $headers['authorization'] ?? $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (preg_match('/Bearer\s+(.+)/i', $auth, $m)) {
        return trim($m[1]);
    }
    // alternative header X-Sync-Token
    if (!empty($headers['x-sync-token'])) return trim($headers['x-sync-token']);
    if (!empty($_SERVER['HTTP_X_SYNC_TOKEN'])) return trim($_SERVER['HTTP_X_SYNC_TOKEN']);
    // query fallback
    if (!empty($_GET['token'])) return trim($_GET['token']);
    // legacy base64 user:pass via ?auth= or header X-User-Pass
    if (!empty($_GET['auth'])) {
        $decoded = base64_decode($_GET['auth'], true);
        if ($decoded !== false && strpos($decoded, ':') !== false) {
            // use password part as token
            return trim(substr($decoded, strpos($decoded, ':')+1));
        }
        return trim($_GET['auth']);
    }
    if (!empty($headers['x-user-pass'])) {
        $decoded = base64_decode($headers['x-user-pass'], true);
        if ($decoded !== false && strpos($decoded, ':') !== false) {
            return trim(substr($decoded, strpos($decoded, ':')+1));
        }
        return trim($headers['x-user-pass']);
    }
    return '';
}

function getUserId() {
    $headers = function_exists('getallheaders') ? array_change_key_case(getallheaders(), CASE_LOWER) : [];
    if (!empty($headers['x-user'])) return trim($headers['x-user']);
    if (!empty($_SERVER['HTTP_X_USER'])) return trim($_SERVER['HTTP_X_USER']);
    if (!empty($_GET['user'])) return trim($_GET['user']);
    // try to extract from base64 auth user part
    $authB64 = $headers['x-user-pass'] ?? $_SERVER['HTTP_X_USER_PASS'] ?? $_GET['auth'] ?? '';
    if ($authB64) {
        $decoded = base64_decode($authB64, true);
        if ($decoded !== false && strpos($decoded, ':') !== false) {
            return trim(substr($decoded, 0, strpos($decoded, ':')));
        }
    }
    return 'default';
}

function getEncPassword() {
    $headers = function_exists('getallheaders') ? array_change_key_case(getallheaders(), CASE_LOWER) : [];
    if (!empty($headers['x-enc-password'])) return $headers['x-enc-password'];
    if (!empty($_SERVER['HTTP_X_ENC_PASSWORD'])) return $_SERVER['HTTP_X_ENC_PASSWORD'];
    if (!empty($_GET['enc'])) return $_GET['enc'];
    // also check Bearer-like enc
    return '';
}

function getStoragePath($token, $user) {
    $base = __DIR__ . '/storage';
    if (!is_dir($base)) @mkdir($base, 0755, true);
    // hash token+user to isolate multi-user without exposing token
    $hash = hash('sha256', ($token ?: 'anonymous') . '|' . $user);
    return $base . '/' . $hash;
}

function parseLastEdit($task) {
    // alias lastWrite / lastEdit
    $v = $task['lastEdit'] ?? $task['lastWrite'] ?? $task['last-write'] ?? null;
    if (!$v) return 0;
    $t = strtotime($v);
    return $t === false ? 0 : $t;
}

function normalizeTask($task) {
    // ensure lastEdit alias exists
    if (!isset($task['lastEdit']) && isset($task['lastWrite'])) $task['lastEdit'] = $task['lastWrite'];
    if (!isset($task['lastWrite']) && isset($task['lastEdit'])) $task['lastWrite'] = $task['lastEdit'];
    if (isset($task['last-write']) && !isset($task['lastEdit'])) $task['lastEdit'] = $task['last-write'];
    return $task;
}

function loadData($path, $encPassword) {
    $jsonPath = $path . '.json';
    $encPath  = $path . '.enc';
    // prefer enc if exists and password provided
    if ($encPassword !== '' && file_exists($encPath)) {
        $raw = file_get_contents($encPath);
        $dec = decryptData($raw, $encPassword);
        if ($dec === null) return null; // decrypt fail
        $data = json_decode($dec, true);
        return is_array($data) ? $data : [];
    }
    if (file_exists($jsonPath)) {
        $raw = file_get_contents($jsonPath);
        // if file is actually encrypted but password not provided, try to detect
        if (strpos($raw, '"enc":') !== false || substr($raw,0,2)==='{"') {
            // try plain
        }
        $data = json_decode($raw, true);
        return is_array($data) ? $data : [];
    }
    // if enc exists but no password supplied, try to tell caller it's encrypted
    if (file_exists($encPath) && $encPassword === '') {
        return '__ENCRYPTED__';
    }
    return [];
}

function saveData($path, $data, $encPassword) {
    $jsonPath = $path . '.json';
    $encPath  = $path . '.enc';
    if ($encPassword !== '') {
        $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $gz = gzencode($json, 9);
        $enc = encryptData($gz, $encPassword);
        // remove plain if exists
        if (file_exists($jsonPath)) @unlink($jsonPath);
        return file_put_contents($encPath, $enc, LOCK_EX) !== false;
    } else {
        $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
        if (file_exists($encPath)) @unlink($encPath);
        return file_put_contents($jsonPath, $json, LOCK_EX) !== false;
    }
}

function encryptData($data, $password) {
    $key = hash('sha256', $password, true);
    $iv = openssl_random_pseudo_bytes(16);
    $ct = openssl_encrypt($data, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $iv, $tag);
    // store iv + tag + ct as base64 json
    return base64_encode(json_encode(['iv'=>base64_encode($iv),'tag'=>base64_encode($tag),'ct'=>base64_encode($ct)]));
}

function decryptData($raw, $password) {
    $key = hash('sha256', $password, true);
    $outer = json_decode(base64_decode($raw), true);
    if (!$outer || !isset($outer['iv'],$outer['tag'],$outer['ct'])) return null;
    $iv = base64_decode($outer['iv']);
    $tag = base64_decode($outer['tag']);
    $ct = base64_decode($outer['ct']);
    $pt = openssl_decrypt($ct, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $iv, $tag);
    if ($pt === false) return null;
    // decompress
    $json = @gzdecode($pt);
    return $json !== false ? $json : $pt;
}

function error($code, $msg) {
    http_response_code($code);
    echo json_encode(['error'=>$msg]);
    exit;
}

$token = getBearerToken();
$user  = getUserId();
$encPassword = getEncPassword();

// allow anonymous token empty - isolate to anonymous file
$storagePath = getStoragePath($token, $user);

// determine action
$action = $_GET['action'] ?? $_POST['action'] ?? '';
if (!$action) {
    // try JSON body
    $rawInput = file_get_contents('php://input');
    if ($rawInput) {
        $j = json_decode($rawInput, true);
        if (isset($j['action'])) $action = $j['action'];
    }
}
$action = strtolower(trim($action));
if (!$action) $action = 'pull'; // default

$rawInput = file_get_contents('php://input');
$body = null;
if ($rawInput) {
    $body = json_decode($rawInput, true);
    if (!is_array($body)) $body = null;
}
if (!$body && !empty($_POST)) $body = $_POST;

// load current data
$data = loadData($storagePath, $encPassword);
if ($data === '__ENCRYPTED__') {
    error(401, 'Storage is encrypted, provide X-Enc-Password header');
}
if ($data === null) {
    error(401, 'Failed to decrypt storage - wrong password?');
}
if (!is_array($data)) $data = [];

// index by luid for fast merge
function indexByLuid($arr) {
    $m = [];
    foreach ($arr as $t) {
        if (isset($t['luid'])) $m[(string)$t['luid']] = $t;
    }
    return $m;
}

$serverTime = gmdate('c');

switch ($action) {
    case 'pull':
        $since = $_GET['since'] ?? $body['since'] ?? null;
        $sinceTs = $since ? strtotime($since) : 0;
        if ($since && $sinceTs === false) $sinceTs = 0;
        if (!$sinceTs) {
            // return all
            $filtered = array_values(array_map('normalizeTask', $data));
        } else {
            $filtered = [];
            foreach ($data as $t) {
                $t = normalizeTask($t);
                if (parseLastEdit($t) > $sinceTs) $filtered[] = $t;
            }
        }
        echo json_encode(['tasks'=>$filtered, 'serverTime'=>$serverTime, 'count'=>count($filtered), 'total'=>count($data)]);
        break;

    case 'push':
        $tasks = $body['tasks'] ?? $body['changes'] ?? null;
        // also support raw array body
        if (!$tasks && is_array($body) && isset($body[0]['luid'])) $tasks = $body;
        if (!$tasks) $tasks = [];
        if (!is_array($tasks)) error(400, 'tasks must be array');
        $tombstones = $body['tombstones'] ?? $body['deleted'] ?? [];
        if (!is_array($tombstones)) $tombstones = [];

        $byLuid = indexByLuid($data);
        $maxLuid = 0;
        foreach ($data as $t) if (isset($t['luid']) && $t['luid'] > $maxLuid) $maxLuid = (int)$t['luid'];
        $accepted = [];
        $remapped = [];
        $conflicts = [];

        // apply tombstones first (hard deletes)
        if (!empty($tombstones)) {
            $tsSet = array_map('strval', $tombstones);
            $data = array_values(array_filter($data, function($t) use ($tsSet) {
                return !in_array((string)($t['luid'] ?? ''), $tsSet, true);
            }));
            $byLuid = indexByLuid($data);
        }

        foreach ($tasks as $incoming) {
            $incoming = normalizeTask($incoming);
            if (!isset($incoming['luid'])) continue;
            $luidStr = (string)$incoming['luid'];
            // collision handling: if incoming luid exists but _id different and lastEdit close, might be different task with same luid
            // For now luid is logical PK, so existing with same luid = same task
            if (!isset($byLuid[$luidStr])) {
                // check for _id collision? Use luid only.
                // If maxLuid collision risk: incoming luid may duplicate existing max? Actually if not in map it's new, accept.
                // But if incoming luid <= maxLuid and not in map, it was hard-deleted tombstone - treat as new.
                $data[] = $incoming;
                $byLuid[$luidStr] = $incoming;
                $accepted[] = $incoming['luid'];
                if ((int)$incoming['luid'] > $maxLuid) $maxLuid = (int)$incoming['luid'];
            } else {
                $existing = $byLuid[$luidStr];
                $tsIn = parseLastEdit($incoming);
                $tsEx = parseLastEdit($existing);
                if ($tsIn > $tsEx) {
                    // newer wins - replace
                    foreach ($data as $idx => $t) {
                        if ((string)($t['luid'] ?? '') === $luidStr) {
                            $data[$idx] = array_merge($existing, $incoming);
                            // ensure alias
                            $data[$idx] = normalizeTask($data[$idx]);
                            break;
                        }
                    }
                    $byLuid[$luidStr] = $data[array_search($luidStr, array_map(fn($t)=> (string)($t['luid']??''), $data))];
                    $accepted[] = $incoming['luid'];
                } else if ($tsIn < $tsEx) {
                    $conflicts[] = ['luid'=>$incoming['luid'], 'reason'=>'remote newer', 'remoteLastEdit'=>$existing['lastEdit'] ?? null];
                } else {
                    // equal - no op
                    $accepted[] = $incoming['luid'];
                }
            }
        }

        if (!saveData($storagePath, array_values($data), $encPassword)) {
            error(500, 'Failed to save storage');
        }
        echo json_encode(['accepted'=>$accepted, 'remapped'=>$remapped, 'conflicts'=>$conflicts, 'serverTime'=>$serverTime, 'total'=>count($data)]);
        break;

    case 'sync':
        // atomic pull+push
        $since = $body['since'] ?? $_GET['since'] ?? null;
        $sinceTs = $since ? strtotime($since) : 0;
        $tasks = $body['tasks'] ?? $body['changes'] ?? [];
        $tombstones = $body['tombstones'] ?? [];
        if (!is_array($tasks)) $tasks = [];
        if (!is_array($tombstones)) $tombstones = [];

        // first push logic (reuse)
        $byLuid = indexByLuid($data);
        $accepted = [];
        $conflicts = [];
        if (!empty($tombstones)) {
            $tsSet = array_map('strval', $tombstones);
            $data = array_values(array_filter($data, fn($t)=> !in_array((string)($t['luid']??''), $tsSet, true)));
            $byLuid = indexByLuid($data);
        }
        foreach ($tasks as $incoming) {
            $incoming = normalizeTask($incoming);
            if (!isset($incoming['luid'])) continue;
            $luidStr = (string)$incoming['luid'];
            if (!isset($byLuid[$luidStr])) {
                $data[] = $incoming;
                $byLuid[$luidStr] = $incoming;
                $accepted[] = $incoming['luid'];
            } else {
                $tsIn = parseLastEdit($incoming);
                $tsEx = parseLastEdit($byLuid[$luidStr]);
                if ($tsIn > $tsEx) {
                    foreach ($data as $idx=>$t) if ((string)($t['luid']??'')===$luidStr) { $data[$idx]=array_merge($t,$incoming); $data[$idx]=normalizeTask($data[$idx]); break; }
                    $accepted[] = $incoming['luid'];
                } else if ($tsIn < $tsEx) {
                    $conflicts[] = ['luid'=>$incoming['luid'], 'reason'=>'remote newer'];
                } else $accepted[] = $incoming['luid'];
            }
        }
        if (!saveData($storagePath, array_values($data), $encPassword)) error(500,'save fail');
        // now pull
        $sinceTs = $since ? strtotime($since) : 0;
        if ($sinceTs === false) $sinceTs = 0;
        $remoteChanges = [];
        foreach ($data as $t) {
            $t = normalizeTask($t);
            if (!$sinceTs || parseLastEdit($t) > $sinceTs) $remoteChanges[] = $t;
        }
        echo json_encode(['accepted'=>$accepted, 'conflicts'=>$conflicts, 'tasks'=>$remoteChanges, 'serverTime'=>$serverTime, 'total'=>count($data)]);
        break;

    case 'get':
        $luid = $_GET['luid'] ?? $body['luid'] ?? null;
        if ($luid === null) error(400, 'luid required');
        $found = null;
        foreach ($data as $t) if ((string)($t['luid'] ?? '') === (string)$luid) { $found = normalizeTask($t); break; }
        if (!$found) error(404, 'not found');
        echo json_encode(['task'=>$found, 'serverTime'=>$serverTime]);
        break;

    case 'search':
        $q = $_GET['q'] ?? $_GET['query'] ?? $body['q'] ?? $body['query'] ?? '';
        $q = strtolower(trim($q));
        $since = $_GET['since'] ?? $body['since'] ?? null;
        $sinceTs = $since ? strtotime($since) : 0;
        $out = [];
        foreach ($data as $t) {
            $t = normalizeTask($t);
            if ($sinceTs && parseLastEdit($t) <= $sinceTs) continue;
            if ($q !== '') {
                $hay = strtolower(($t['title']??'').' '.($t['description']??'').' '.($t['categories']??''));
                if (strpos($hay, $q)===false) continue;
            }
            $out[] = $t;
        }
        echo json_encode(['tasks'=>$out, 'serverTime'=>$serverTime, 'count'=>count($out)]);
        break;

    case 'update':
        // single task upsert (alias push single)
        $task = $body['task'] ?? $body;
        if (isset($body['luid'])) $task = $body;
        $task = normalizeTask($task);
        if (!isset($task['luid'])) error(400,'luid required');
        $byLuid = indexByLuid($data);
        $luidStr = (string)$task['luid'];
        if (!isset($byLuid[$luidStr])) {
            $data[] = $task;
        } else {
            $tsIn = parseLastEdit($task);
            $tsEx = parseLastEdit($byLuid[$luidStr]);
            if ($tsIn >= $tsEx) {
                foreach ($data as $idx=>$t) if ((string)($t['luid']??'')===$luidStr) { $data[$idx]=array_merge($t,$task); $data[$idx]=normalizeTask($data[$idx]); break; }
            } else {
                error(409, 'conflict: remote newer');
            }
        }
        if (!saveData($storagePath, array_values($data), $encPassword)) error(500,'save fail');
        echo json_encode(['ok'=>true, 'serverTime'=>$serverTime]);
        break;

    default:
        error(400, 'unknown action: '.$action.' (use pull/push/sync/get/search/update)');
}
