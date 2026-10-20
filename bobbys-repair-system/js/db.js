/* ==========================================================
   Bobby's Motorcycle Repair System - Database + Auth layer
   Data is stored in the browser (localStorage) as JSON tables.
   Tables: users, customers, motorcycles, services, parts,
           repairs, emergencies, payments
   ========================================================== */
(function (global) {
  'use strict';

  var KEY = 'bobbys_repair_db_v1';
  var SKEY = 'bobbys_repair_session';
  var TABLES = ['users', 'customers', 'motorcycles', 'services', 'parts', 'repairs', 'emergencies', 'payments'];

  /* ---------- safe storage wrapper (falls back to memory) ---------- */
  var mem = {};
  function store(kind) {
    try {
      var s = global[kind];
      s.setItem('__t', '1'); s.removeItem('__t');
      return s;
    } catch (e) {
      return {
        getItem: function (k) { return mem[kind + k] === undefined ? null : mem[kind + k]; },
        setItem: function (k, v) { mem[kind + k] = String(v); },
        removeItem: function (k) { delete mem[kind + k]; }
      };
    }
  }
  var LS = store('localStorage');
  var SS = store('sessionStorage');

  /* ---------- SHA-256 (synchronous, for password hashing) ---------- */
  function sha256(ascii) {
    function rr(v, a) { return (v >>> a) | (v << (32 - a)); }
    var mp = Math.pow, mw = mp(2, 32), i, j, result = '';
    var words = [], bitLen = ascii.length * 8;
    var hash = sha256.h = sha256.h || [], k = sha256.k = sha256.k || [], pc = k.length, comp = {};
    for (var c = 2; pc < 64; c++) {
      if (!comp[c]) {
        for (i = 0; i < 313; i += c) comp[i] = c;
        hash[pc] = (mp(c, 0.5) * mw) | 0;
        k[pc++] = (mp(c, 1 / 3) * mw) | 0;
      }
    }
    ascii += '\x80';
    while (ascii.length % 64 - 56) ascii += '\x00';
    for (i = 0; i < ascii.length; i++) {
      j = ascii.charCodeAt(i);
      words[i >> 2] |= j << ((3 - i) % 4) * 8;
    }
    words[words.length] = ((bitLen / mw) | 0);
    words[words.length] = bitLen;
    for (j = 0; j < words.length;) {
      var w = words.slice(j, j += 16), old = hash;
      hash = hash.slice(0, 8);
      for (i = 0; i < 64; i++) {
        var w15 = w[i - 15], w2 = w[i - 2], a = hash[0], e = hash[4];
        var t1 = hash[7] + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) + ((e & hash[5]) ^ (~e & hash[6])) + k[i] +
          (w[i] = (i < 16) ? w[i] : (w[i - 16] + (rr(w15, 7) ^ rr(w15, 18) ^ (w15 >>> 3)) + w[i - 7] +
            (rr(w2, 17) ^ rr(w2, 19) ^ (w2 >>> 10))) | 0);
        var t2 = (rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
        hash = [(t1 + t2) | 0].concat(hash);
        hash[4] = (hash[4] + t1) | 0;
      }
      for (i = 0; i < 8; i++) hash[i] = (hash[i] + old[i]) | 0;
    }
    for (i = 0; i < 8; i++) for (j = 3; j + 1; j--) {
      var b = (hash[i] >> (j * 8)) & 255;
      result += ((b < 16) ? 0 : '') + b.toString(16);
    }
    return result;
  }
  function hashPw(pw) {
    return sha256(unescape(encodeURIComponent('bobbys$' + pw + '$motoshop')));
  }

  /* ---------- core ---------- */
  var data = null;

  function save() { LS.setItem(KEY, JSON.stringify(data)); }
  function nextId(t) { data.seq[t] = (data.seq[t] || 0) + 1; return data.seq[t]; }
  function emptyDb() {
    var d = { seq: {} };
    TABLES.forEach(function (t) { d[t] = []; });
    return d;
  }

  function load() {
    try { data = JSON.parse(LS.getItem(KEY)); } catch (e) { data = null; }
    if (!data || typeof data !== 'object') { data = emptyDb(); seed(); save(); return; }
    TABLES.forEach(function (t) { if (!Array.isArray(data[t])) data[t] = []; });
    if (!data.seq) data.seq = {};
    if (!data.users.length) { seed(); save(); }
  }

  function seed() {
    DB.insert('users', { role: 'owner', name: 'Sir Ariel Socorro', username: 'owner', passHash: hashPw('owner123'), phone: '' }, true);
    DB.insert('users', { role: 'mechanic', name: 'Mario Mekaniko', username: 'mechanic1', passHash: hashPw('mech123'), phone: '' }, true);
    [['Oil Change', 250], ['General Check-up', 150], ['Tune-up', 600], ['Brake Adjustment', 200],
     ['Brake Pad Replacement', 350], ['Chain Cleaning & Lubrication', 150], ['Tire Change', 200],
     ['Battery Check / Replacement', 150], ['Carburetor Cleaning', 450], ['CVT Cleaning', 500],
     ['Electrical Troubleshooting', 400], ['Engine Overhaul', 5000]].forEach(function (s) {
      DB.insert('services', { name: s[0], price: s[1] }, true);
    });
    [['Engine Oil 1L', 280, 30], ['Spark Plug', 120, 25], ['Brake Pad (Front)', 350, 20], ['Brake Pad (Rear)', 300, 20],
     ['Drive Chain', 900, 10], ['Tire 2.75-17', 1200, 8], ['Battery 12V', 1100, 6], ['Air Filter', 220, 15],
     ['Clutch Cable', 180, 10], ['Headlight Bulb', 150, 20], ['CVT Belt', 650, 8], ['Brake Fluid', 180, 12]].forEach(function (p) {
      DB.insert('parts', { name: p[0], price: p[1], stock: p[2] }, true);
    });
  }

  var DB = {
    init: load,
    all: function (t) { return data[t].slice(); },
    get: function (t, id) { id = +id; return data[t].find(function (x) { return x.id === id; }) || null; },
    insert: function (t, o, skipSave) {
      o.id = nextId(t);
      o.createdAt = o.createdAt || new Date().toISOString();
      data[t].push(o);
      if (!skipSave) save();
      return o;
    },
    update: function (t, id, patch) {
      var o = DB.get(t, id);
      if (!o) return null;
      Object.assign(o, patch);
      save();
      return o;
    },
    remove: function (t, id) {
      id = +id;
      data[t] = data[t].filter(function (x) { return x.id !== id; });
      save();
    },
    adjustStock: function (partId, delta) {
      var p = DB.get('parts', partId);
      if (p) { p.stock = Math.max(0, (+p.stock || 0) + delta); save(); }
    },
    /* money summary for one repair job */
    totals: function (r) {
      var s = (r.services || []).reduce(function (a, x) { return a + (+x.price || 0); }, 0);
      var p = (r.parts || []).reduce(function (a, x) { return a + (+x.qty || 0) * (+x.price || 0); }, 0);
      var paid = data.payments.filter(function (x) { return x.repairId === r.id; })
        .reduce(function (a, x) { return a + (+x.amount || 0); }, 0);
      var total = s + p;
      var status = total === 0 ? 'No charge' : (paid >= total - 0.004 ? 'Paid' : (paid > 0 ? 'Partial' : 'Unpaid'));
      return { services: s, parts: p, total: total, paid: paid, balance: Math.max(0, total - paid), status: status };
    },
    exportJSON: function () { return JSON.stringify(data, null, 2); },
    importJSON: function (text) {
      var d = JSON.parse(text);
      if (!d || typeof d !== 'object') throw new Error('Invalid file');
      TABLES.forEach(function (t) { if (!Array.isArray(d[t])) throw new Error('Missing table: ' + t); });
      if (!d.users.some(function (u) { return u.role === 'owner'; })) throw new Error('Backup has no owner account');
      if (!d.seq) d.seq = {};
      data = d; save();
    },
    reset: function () { data = emptyDb(); seed(); save(); },

    loadSample: function () {
      var day = 86400000, now = Date.now();
      function ago(n) { return new Date(now - n * day).toISOString(); }
      function dstr(n) { var d = new Date(now - n * day); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
      var mech = data.users.find(function (u) { return u.role === 'mechanic'; });
      var mid = mech ? mech.id : null;
      function mkCust(name, phone, addr, username) {
        var c = DB.insert('customers', { name: name, phone: phone, address: addr, email: '', userId: null });
        if (username && !data.users.some(function (u) { return u.username === username; })) {
          var u = DB.insert('users', { role: 'customer', name: name, username: username, passHash: hashPw('customer123'), phone: phone, customerId: c.id });
          c.userId = u.id; save();
        }
        return c;
      }
      var c1 = mkCust('Juan Dela Cruz', '0917-111-2233', 'Gumamela, Balayan, Batangas', 'juan');
      var c2 = mkCust('Maria Santos', '0918-222-3344', 'Poblacion, Balayan, Batangas', 'maria');
      var c3 = mkCust('Pedro Reyes', '0919-333-4455', 'Calaca, Batangas', null);
      var m1 = DB.insert('motorcycles', { customerId: c1.id, brand: 'Honda', model: 'Click 125', plate: 'ABC 1234', type: 'Scooter' });
      var m2 = DB.insert('motorcycles', { customerId: c2.id, brand: 'Yamaha', model: 'Mio i125', plate: 'XYZ 5678', type: 'Scooter' });
      var m3 = DB.insert('motorcycles', { customerId: c3.id, brand: 'Honda', model: 'XRM 125', plate: 'DEF 9012', type: 'Underbone' });
      var m4 = DB.insert('motorcycles', { customerId: c1.id, brand: 'Kawasaki', model: 'Ninja 400', plate: 'NIN 4000', type: 'Sport' });
      var parts = data.parts;
      function part(name) { return parts.find(function (p) { return p.name === name; }); }
      function repair(m, cust, problem, status, svcs, prts, ageDays, emergency, notes) {
        var items = prts.map(function (x) { var p = part(x[0]); return { partId: p.id, name: p.name, qty: x[1], price: p.price }; });
        items.forEach(function (it) { DB.adjustStock(it.partId, -it.qty); });
        return DB.insert('repairs', {
          motorcycleId: m.id, customerId: cust.id, problem: problem, mechanicId: mid, status: status,
          isEmergency: !!emergency, services: svcs.map(function (s) { return { name: s[0], price: s[1] }; }),
          parts: items, notes: notes || '', createdAt: ago(ageDays), updatedAt: ago(ageDays)
        });
      }
      function pay(r, amt, method, age) { DB.insert('payments', { repairId: r.id, amount: amt, method: method, date: dstr(age), note: '', createdAt: ago(age) }); }
      var r1 = repair(m1, c1, 'Regular change oil and check-up', 'Completed', [['Oil Change', 250], ['General Check-up', 150]], [['Engine Oil 1L', 1]], 12, false);
      pay(r1, 680, 'Cash', 12);
      var r2 = repair(m2, c2, 'Brake is soft and noisy', 'Ready for Pickup', [['Brake Pad Replacement', 350]], [['Brake Pad (Front)', 1], ['Brake Fluid', 1]], 2, false);
      pay(r2, 400, 'GCash', 1);
      repair(m3, c3, 'Engine will not start', 'Under Repair', [['Electrical Troubleshooting', 400]], [['Spark Plug', 1], ['Battery 12V', 1]], 1, false);
      repair(m4, c1, 'Chain is loose and makes noise', 'Waiting', [], [], 0, false);
      var e1 = DB.insert('emergencies', { customerId: c3.id, contactName: 'Pedro Reyes', phone: '0919-333-4455', motorcycleId: m3.id, motoInfo: '', location: 'National Highway, near Balayan Market', problem: 'Motorcycle stalled in the middle of the road, flat tire.', urgency: 'High', status: 'Pending', mechanicId: null, repairId: null, createdAt: ago(0) });
      DB.insert('emergencies', { customerId: c2.id, contactName: 'Maria Santos', phone: '0918-222-3344', motorcycleId: m2.id, motoInfo: '', location: 'Gumamela', problem: 'Battery drained, cannot start.', urgency: 'Low', status: 'Resolved', mechanicId: mid, repairId: null, createdAt: ago(6) });
      return e1;
    }
  };

  /* ---------- authentication ---------- */
  var Auth = {
    hashPw: hashPw,
    usernameTaken: function (u, exceptId) {
      u = String(u || '').trim().toLowerCase();
      return data.users.some(function (x) { return x.username.toLowerCase() === u && x.id !== exceptId; });
    },
    login: function (username, password) {
      var u = String(username || '').trim().toLowerCase();
      var x = data.users.find(function (a) { return a.username.toLowerCase() === u; });
      if (!x || x.passHash !== hashPw(password || '')) return null;
      SS.setItem(SKEY, String(x.id));
      return x;
    },
    current: function () {
      var id = SS.getItem(SKEY);
      return id ? DB.get('users', id) : null;
    },
    logout: function () { SS.removeItem(SKEY); },
    registerCustomer: function (f) {
      var name = (f.name || '').trim(), username = (f.username || '').trim();
      if (!name) throw new Error('Full name is required.');
      if (!(f.phone || '').trim()) throw new Error('Phone number is required.');
      if (username.length < 4) throw new Error('Username must be at least 4 characters.');
      if (!/^[A-Za-z0-9_.-]+$/.test(username)) throw new Error('Username may only contain letters, numbers, dot, dash and underscore.');
      if (Auth.usernameTaken(username)) throw new Error('That username is already taken.');
      if ((f.password || '').length < 6) throw new Error('Password must be at least 6 characters.');
      var c = DB.insert('customers', { name: name, phone: f.phone.trim(), address: (f.address || '').trim(), email: (f.email || '').trim(), userId: null });
      var u = DB.insert('users', { role: 'customer', name: name, username: username, passHash: hashPw(f.password), phone: f.phone.trim(), customerId: c.id });
      DB.update('customers', c.id, { userId: u.id });
      return u;
    }
  };

  DB.init();
  global.DB = DB;
  global.Auth = Auth;
})(window);
