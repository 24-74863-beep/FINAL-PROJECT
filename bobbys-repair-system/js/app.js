/* ==========================================================
   Bobby's Motorcycle Repair System - application logic
   Roles: owner, mechanic, customer
   ========================================================== */
(function () {
  'use strict';

  var me = Auth.current();
  if (!me) { location.replace('index.html'); return; }

  /* ---------- constants & helpers ---------- */
  var STATUSES = ['Waiting', 'Under Repair', 'Ready for Pickup', 'Completed'];
  var EM_STATUSES = ['Pending', 'Dispatched', 'Resolved', 'Cancelled'];
  var URGENCY = ['Low', 'High', 'Critical'];
  var MOTO_TYPES = ['Scooter', 'Underbone', 'Standard', 'Sport', 'Big Bike', 'Tricycle', 'Other'];
  var METHODS = ['Cash', 'GCash', 'Bank Transfer', 'Other'];

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var peso = function (n) {
    return '₱' + (+n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  var fmtDate = function (d) {
    return d ? new Date(d).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : '';
  };
  var fmtDay = function (s) { return s ? fmtDate(s + 'T00:00:00') : ''; };
  function localDate(iso) {
    var d = new Date(iso);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function todayStr() { return localDate(new Date().toISOString()); }
  function slug(s) { return String(s).replace(/\s/g, '').toLowerCase(); }
  function badge(s) { return '<span class="badge s-' + slug(s) + '">' + esc(s) + '</span>'; }
  function urgBadge(u) { return '<span class="badge u-' + slug(u) + '">' + esc(u) + '</span>'; }
  function opts(list, sel) {
    return list.map(function (x) { return '<option' + (x === sel ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join('');
  }
  function toast(msg, bad) {
    var t = $('#toast');
    t.textContent = msg; t.className = 'show' + (bad ? ' bad' : '');
    clearTimeout(toast.t);
    toast.t = setTimeout(function () { t.className = ''; }, 2600);
  }
  function csvCell(v) { v = String(v == null ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }

  var cust = function (id) { return DB.get('customers', id); };
  var moto = function (id) { return DB.get('motorcycles', id); };
  var userOf = function (id) { return DB.get('users', id); };
  var custName = function (id) { var c = cust(id); return c ? c.name : '—'; };
  var mechName = function (id) { var u = userOf(id); return u ? u.name : '—'; };
  function motoLabel(m) { return m ? m.brand + ' ' + m.model + ' (' + m.plate + ')' : '—'; }
  function newestFirst(a, b) { return (b.createdAt || '').localeCompare(a.createdAt || ''); }
  var isOwner = me.role === 'owner', isMech = me.role === 'mechanic', isCust = me.role === 'customer', isStaff = !isCust;

  /* ---------- modal ---------- */
  function modal(title, body, o) {
    o = o || {};
    var m = $('#modal');
    m.innerHTML = '<div class="modal-box' + (o.wide ? ' wide' : '') + '"><div class="modal-head"><h3>' + title +
      '</h3><button class="x" type="button" onclick="App.closeModal()">×</button></div>' +
      '<form id="mform" autocomplete="off"><div class="modal-body">' + body + '</div><div class="modal-foot">' +
      (o.hideSave
        ? '<button type="button" class="btn" onclick="App.closeModal()">Close</button>'
        : '<button type="button" class="btn ghost" onclick="App.closeModal()">Cancel</button><button class="btn primary">' + (o.saveLabel || 'Save') + '</button>') +
      '</div></form></div>';
    m.classList.add('open');
    $('#mform').onsubmit = function (e) {
      e.preventDefault();
      if (!o.onSave) return;
      var r;
      try { r = o.onSave(e.target); } catch (err) { toast(err.message || String(err), true); return; }
      if (r !== false) closeModal();
    };
  }
  function closeModal() { $('#modal').classList.remove('open'); $('#modal').innerHTML = ''; }
  function confirmBox(msg) { return window.confirm(msg); }
  function val(form, name) { var el = form.elements[name]; return el ? el.value.trim() : ''; }

  /* ---------- navigation ---------- */
  var NAV = [
    { id: 'dashboard', label: 'Dashboard', icon: '🏠', roles: ['owner', 'mechanic', 'customer'] },
    { id: 'repairs', label: 'Repairs', icon: '🔧', roles: ['owner', 'mechanic'] },
    { id: 'myrepairs', label: 'My Repairs', icon: '🔧', roles: ['customer'] },
    { id: 'emergency', label: 'Emergency Services', icon: '🚨', roles: ['owner', 'mechanic', 'customer'] },
    { id: 'customers', label: 'Customers', icon: '👥', roles: ['owner', 'mechanic'] },
    { id: 'motorcycles', label: 'Motorcycles', icon: '🏍️', roles: ['owner', 'mechanic'] },
    { id: 'mymotos', label: 'My Motorcycles', icon: '🏍️', roles: ['customer'] },
    { id: 'catalog', label: 'Services & Parts', icon: '📦', roles: ['owner'] },
    { id: 'payments', label: 'Payments', icon: '💰', roles: ['owner'] },
    { id: 'reports', label: 'Reports', icon: '📊', roles: ['owner'] },
    { id: 'accounts', label: 'Accounts', icon: '🔑', roles: ['owner'] },
    { id: 'backup', label: 'Backup & Data', icon: '💾', roles: ['owner'] }
  ].filter(function (n) { return n.roles.indexOf(me.role) >= 0; });

  var view = 'dashboard';
  var F = {};                       // per-view filters
  function fil(v) { return F[v] || (F[v] = { q: '', s: '', u: '' }); }
  var TBL = {};                     // functions that render the filterable table of a view

  function go(v) {
    if (!NAV.some(function (n) { return n.id === v; })) v = 'dashboard';
    view = v;
    $('#sidebar').classList.remove('open');
    $('#nav').innerHTML = NAV.map(function (n) {
      return '<a class="' + (n.id === v ? 'on' : '') + '" onclick="App.go(\'' + n.id + '\')"><span>' + n.icon + '</span>' + n.label + '</a>';
    }).join('');
    var nav = NAV.filter(function (n) { return n.id === v; })[0];
    $('#pageTitle').textContent = nav.label;
    $('#content').innerHTML = VIEWS[v]();
    window.scrollTo(0, 0);
  }
  function refresh() { go(view); }
  function refreshTable() { var t = $('#tbl'); if (t && TBL[view]) t.innerHTML = TBL[view](); }

  function table(cols, rows, emptyMsg) {
    if (!rows.length) return '<div class="tablewrap"><div class="empty">' + (emptyMsg || 'No records found.') + '</div></div>';
    return '<div class="tablewrap"><table><thead><tr>' + cols.map(function (c) {
      var num = /^#?\$?num:/.test(c);
      return '<th' + (num ? ' class="num"' : '') + '>' + esc(c.replace(/^num:/, '')) + '</th>';
    }).join('') + '</tr></thead><tbody>' + rows.join('') + '</tbody></table></div>';
  }
  function searchBox(v, placeholder) {
    return '<div class="grow"><input type="search" placeholder="' + placeholder + '" value="' + esc(fil(v).q) + '" oninput="App.filter(\'' + v + '\',\'q\',this.value)"></div>';
  }
  function matches(q, parts) {
    q = (q || '').toLowerCase().trim();
    return !q || parts.join(' ').toLowerCase().indexOf(q) >= 0;
  }

  /* ==========================================================
     DATA SCOPING (what each role may see)
     ========================================================== */
  function myRepairs() {
    var all = DB.all('repairs');
    if (isOwner) return all;
    if (isMech) return all.filter(function (r) { return r.mechanicId === me.id || !r.mechanicId; });
    return all.filter(function (r) { return r.customerId === me.customerId; });
  }
  function myMotos() {
    var all = DB.all('motorcycles');
    return isCust ? all.filter(function (m) { return m.customerId === me.customerId; }) : all;
  }
  function myEmergencies() {
    var all = DB.all('emergencies');
    return isCust ? all.filter(function (e) { return e.customerId === me.customerId; }) : all;
  }

  /* ==========================================================
     VIEWS
     ========================================================== */
  var VIEWS = {};

  /* ---------- Dashboard ---------- */
  VIEWS.dashboard = function () {
    var reps = myRepairs(), h = '';
    var active = reps.filter(function (r) { return r.status !== 'Completed'; });
    function stat(n, l, cls) { return '<div class="stat ' + (cls || '') + '"><div class="n">' + n + '</div><div class="l">' + l + '</div></div>'; }
    var hello = '<p style="margin:0 0 16px;color:var(--muted)">Welcome back, <b>' + esc(me.name) + '</b> <span class="role-pill">' + me.role + '</span></p>';

    if (isOwner) {
      var today = todayStr();
      var income = DB.all('payments').filter(function (p) { return p.date === today; }).reduce(function (a, p) { return a + (+p.amount || 0); }, 0);
      var unpaid = reps.reduce(function (a, r) { return a + DB.totals(r).balance; }, 0);
      var pendingEm = DB.all('emergencies').filter(function (e) { return e.status === 'Pending'; }).length;
      h = hello + '<div class="cards">' +
        stat(active.length, 'Active repairs') +
        stat(reps.filter(function (r) { return r.status === 'Waiting'; }).length, 'Waiting', 'blue') +
        stat(reps.filter(function (r) { return r.status === 'Ready for Pickup'; }).length, 'Ready for pickup', 'green') +
        stat(pendingEm, 'Pending emergencies', 'red') +
        stat(peso(income), "Today's income", 'green') +
        stat(peso(unpaid), 'Unpaid balances', 'red') + '</div>';
    } else if (isMech) {
      var mine = reps.filter(function (r) { return r.mechanicId === me.id && r.status !== 'Completed'; });
      h = hello + '<div class="cards">' +
        stat(mine.length, 'My active jobs') +
        stat(reps.filter(function (r) { return !r.mechanicId && r.status !== 'Completed'; }).length, 'Unassigned jobs', 'blue') +
        stat(DB.all('emergencies').filter(function (e) { return e.status === 'Pending'; }).length, 'Pending emergencies', 'red') +
        stat(reps.filter(function (r) { return r.mechanicId === me.id && r.status === 'Completed'; }).length, 'Completed by me', 'green') + '</div>';
    } else {
      var bal = reps.reduce(function (a, r) { return a + DB.totals(r).balance; }, 0);
      h = hello + '<div class="cards">' +
        stat(myMotos().length, 'My motorcycles', 'blue') +
        stat(active.length, 'Active repairs') +
        stat(reps.filter(function (r) { return r.status === 'Ready for Pickup'; }).length, 'Ready for pickup', 'green') +
        stat(peso(bal), 'Balance due', 'red') + '</div>';
    }

    var recent = reps.slice().sort(newestFirst).slice(0, 6);
    h += '<div class="panel"><h3>' + (isCust ? 'My recent repairs' : 'Recent repair jobs') + '</h3>' +
      table(['Job #', 'Date', 'Motorcycle', 'Problem', 'Status'], recent.map(function (r) {
        return '<tr><td>#' + r.id + '</td><td>' + fmtDate(r.createdAt) + '</td><td>' + esc(motoLabel(moto(r.motorcycleId))) + '</td><td>' +
          (r.isEmergency ? '<span class="sos">🚨 </span>' : '') + esc(r.problem) + '</td><td>' + badge(r.status) + '</td></tr>';
      }), 'No repair jobs yet.') + '</div>';

    if (isStaff) {
      var em = DB.all('emergencies').filter(function (e) { return e.status === 'Pending' || e.status === 'Dispatched'; }).sort(newestFirst).slice(0, 5);
      if (em.length) {
        h += '<div class="panel"><h3>🚨 Open emergency requests</h3>' + table(['#', 'Contact', 'Location', 'Problem', 'Urgency', 'Status'], em.map(function (e) {
          return '<tr><td>' + e.id + '</td><td>' + esc(e.contactName) + '<br><small>' + esc(e.phone) + '</small></td><td>' + esc(e.location) + '</td><td>' + esc(e.problem) + '</td><td>' + urgBadge(e.urgency) + '</td><td>' + badge(e.status) + '</td></tr>';
        })) + '</div>';
      }
    }
    return h;
  };

  /* ---------- Repairs ---------- */
  function repairsFiltered() {
    var f = fil(view);
    return myRepairs().filter(function (r) {
      var m = moto(r.motorcycleId);
      if (f.s && r.status !== f.s) return false;
      return matches(f.q, [r.id, custName(r.customerId), m ? m.plate + m.brand + m.model : '', r.problem, mechName(r.mechanicId)]);
    }).sort(newestFirst);
  }
  TBL.repairs = TBL.myrepairs = function () {
    var rows = repairsFiltered().map(function (r) {
      var t = DB.totals(r), m = moto(r.motorcycleId);
      var statusCell = isStaff
        ? '<select class="status-sel" onchange="App.setStatus(' + r.id + ',this.value)">' + opts(STATUSES, r.status) + '</select>'
        : badge(r.status);
      var acts = '<button class="btn sm" onclick="App.viewRepair(' + r.id + ')">View</button>';
      if (isStaff) acts += '<button class="btn sm" onclick="App.repairForm(' + r.id + ')">Edit</button>';
      if (isOwner) acts += '<button class="btn sm danger" onclick="App.delRepair(' + r.id + ')">Delete</button>';
      return '<tr><td>#' + r.id + '</td><td>' + fmtDate(r.createdAt) + '</td>' +
        (isCust ? '' : '<td>' + esc(custName(r.customerId)) + '</td>') +
        '<td>' + esc(motoLabel(m)) + '</td><td>' + (r.isEmergency ? '<span class="sos">🚨 </span>' : '') + esc(r.problem) + '</td>' +
        '<td>' + esc(mechName(r.mechanicId)) + '</td><td>' + statusCell + '</td>' +
        '<td class="num">' + peso(t.total) + '</td><td>' + badge(t.status) + '</td><td>' + acts + '</td></tr>';
    });
    var cols = ['Job #', 'Date'].concat(isCust ? [] : ['Customer']).concat(['Motorcycle', 'Problem', 'Mechanic', 'Status', 'num:Total', 'Payment', 'Actions']);
    return table(cols, rows, 'No repair jobs found.');
  };
  VIEWS.repairs = VIEWS.myrepairs = function () {
    var f = fil(view);
    return '<div class="toolbar">' + searchBox(view, 'Search job #, customer, plate, problem…') +
      '<select onchange="App.filter(\'' + view + '\',\'s\',this.value)"><option value="">All statuses</option>' +
      STATUSES.map(function (s) { return '<option' + (f.s === s ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select>' +
      (isStaff ? '<button class="btn primary" onclick="App.repairForm()">+ New repair job</button>' : '') +
      '</div><div id="tbl">' + TBL[view]() + '</div>';
  };

  function setStatus(id, status) {
    var patch = { status: status, updatedAt: new Date().toISOString() };
    var r = DB.get('repairs', id);
    if (isMech && !r.mechanicId) patch.mechanicId = me.id;     // taking an unassigned job
    DB.update('repairs', id, patch);
    toast('Job #' + id + ' marked "' + status + '".');
    refresh();
  }

  function viewRepair(id) {
    var r = DB.get('repairs', id); if (!r) return;
    var t = DB.totals(r), m = moto(r.motorcycleId), c = cust(r.customerId);
    var pays = DB.all('payments').filter(function (p) { return p.repairId === id; }).sort(function (a, b) { return a.date.localeCompare(b.date); });
    var body = '<div class="kv"><span>Job #</span><b>' + r.id + (r.isEmergency ? ' <span class="sos">🚨 Emergency</span>' : '') + '</b>' +
      '<span>Date received</span><span>' + fmtDate(r.createdAt) + '</span>' +
      '<span>Customer</span><span>' + esc(c ? c.name + ' · ' + c.phone : '—') + '</span>' +
      '<span>Motorcycle</span><span>' + esc(motoLabel(m)) + (m ? ' · ' + esc(m.type) : '') + '</span>' +
      '<span>Problem</span><span>' + esc(r.problem) + '</span>' +
      '<span>Mechanic</span><span>' + esc(mechName(r.mechanicId)) + '</span>' +
      '<span>Status</span><span>' + badge(r.status) + '</span>' +
      (r.notes ? '<span>Notes</span><span>' + esc(r.notes) + '</span>' : '') + '</div>';
    body += '<h3 style="margin:14px 0 6px">Services performed</h3>' + (r.services.length
      ? table(['Service', 'num:Price'], r.services.map(function (s) { return '<tr><td>' + esc(s.name) + '</td><td class="num">' + peso(s.price) + '</td></tr>'; }))
      : '<p class="hint">None recorded yet.</p>');
    body += '<h3 style="margin:14px 0 6px">Parts used</h3>' + (r.parts.length
      ? table(['Part', 'num:Qty', 'num:Unit price', 'num:Amount'], r.parts.map(function (p) { return '<tr><td>' + esc(p.name) + '</td><td class="num">' + p.qty + '</td><td class="num">' + peso(p.price) + '</td><td class="num">' + peso(p.qty * p.price) + '</td></tr>'; }))
      : '<p class="hint">None recorded yet.</p>');
    body += '<div class="totalbox">Total: ' + peso(t.total) + '<br><small style="font-weight:600">Paid: ' + peso(t.paid) + ' · Balance: ' + peso(t.balance) + ' ' + badge(t.status) + '</small></div>';
    body += '<h3 style="margin:14px 0 6px">Payments</h3>' + (pays.length
      ? table(['Date', 'Method', 'num:Amount', 'Note'], pays.map(function (p) { return '<tr><td>' + fmtDay(p.date) + '</td><td>' + esc(p.method) + '</td><td class="num">' + peso(p.amount) + '</td><td>' + esc(p.note) + '</td></tr>'; }))
      : '<p class="hint">No payments recorded.</p>');
    if (isOwner && t.balance > 0) body += '<p><button type="button" class="btn primary" onclick="App.payForm(' + id + ')">Record payment</button></p>';
    modal('Repair Job #' + id, body, { wide: true, hideSave: true });
  }

  /* repair form ------------------------------------------------ */
  function svcRow(s) {
    s = s || {};
    return '<div class="line"><input name="sname" list="svcList" placeholder="Service (pick or type)" value="' + esc(s.name || '') + '" oninput="App.svcPick(this)">' +
      '<input type="number" name="sprice" min="0" step="0.01" placeholder="Price" value="' + (s.price == null ? '' : s.price) + '" oninput="App.calc()">' +
      '<button type="button" class="btn sm danger" onclick="App.rmRow(this)">✕</button></div>';
  }
  function partRow(p) {
    p = p || {};
    var o = '<option value="">— select part —</option>' + DB.all('parts').map(function (x) {
      return '<option value="' + x.id + '"' + (x.id === p.partId ? ' selected' : '') + '>' + esc(x.name) + ' (stock ' + x.stock + ')</option>';
    }).join('');
    return '<div class="line"><select name="ppart" onchange="App.partPick(this)">' + o + '</select>' +
      '<input class="qty" type="number" name="pqty" min="1" step="1" placeholder="Qty" value="' + (p.qty || 1) + '" oninput="App.calc()">' +
      '<input type="number" name="pprice" min="0" step="0.01" placeholder="Unit price" value="' + (p.price == null ? '' : p.price) + '" oninput="App.calc()">' +
      '<button type="button" class="btn sm danger" onclick="App.rmRow(this)">✕</button></div>';
  }

  function repairForm(id, pre) {
    var r = id ? DB.get('repairs', id) : null;
    pre = pre || {};
    var src = r || { motorcycleId: pre.motorcycleId, problem: pre.problem || '', mechanicId: pre.mechanicId || (isMech ? me.id : null), status: 'Waiting', isEmergency: !!pre.isEmergency, services: [], parts: [], notes: '' };
    var motos = DB.all('motorcycles');
    if (!motos.length) { toast('Add a motorcycle first (Motorcycles page).', true); return; }
    var mechs = DB.all('users').filter(function (u) { return u.role === 'mechanic' || u.role === 'owner'; });
    var body =
      '<div class="field"><label>Motorcycle *</label><select name="motorcycleId" required><option value="">— select —</option>' +
      motos.map(function (m) { return '<option value="' + m.id + '"' + (m.id === src.motorcycleId ? ' selected' : '') + '>' + esc(motoLabel(m) + ' — ' + custName(m.customerId)) + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label>Problem / complaint *</label><textarea name="problem" required>' + esc(src.problem) + '</textarea></div>' +
      '<div class="grid2"><div class="field"><label>Assigned mechanic</label><select name="mechanicId"><option value="">— unassigned —</option>' +
      mechs.map(function (u) { return '<option value="' + u.id + '"' + (u.id === src.mechanicId ? ' selected' : '') + '>' + esc(u.name) + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label>Status</label><select name="status">' + opts(STATUSES, src.status) + '</select></div></div>' +
      '<div class="field"><label style="display:flex;gap:8px;align-items:center;font-weight:600"><input type="checkbox" name="isEmergency" style="width:auto"' + (src.isEmergency ? ' checked' : '') + '> 🚨 Emergency job</label></div>' +
      '<datalist id="svcList">' + DB.all('services').map(function (s) { return '<option value="' + esc(s.name) + '">'; }).join('') + '</datalist>' +
      '<div class="subhead">Services performed <button type="button" class="btn sm" onclick="App.addSvc()">+ Add service</button></div><div id="svcRows">' + src.services.map(svcRow).join('') + '</div>' +
      '<div class="subhead">Parts used <button type="button" class="btn sm" onclick="App.addPart()">+ Add part</button></div><div id="partRows">' + src.parts.map(partRow).join('') + '</div>' +
      '<div class="totalbox">Total cost: <span id="calcTotal">' + peso(0) + '</span></div>' +
      '<div class="field" style="margin-top:12px"><label>Notes</label><textarea name="notes">' + esc(src.notes || '') + '</textarea></div>';
    modal(r ? 'Edit Repair Job #' + r.id : 'New Repair Job', body, {
      wide: true,
      onSave: function (form) {
        var m = moto(+form.elements.motorcycleId.value);
        if (!m) throw new Error('Please select a motorcycle.');
        var services = $$('#svcRows .line', form).map(function (row) {
          return { name: $('[name=sname]', row).value.trim(), price: +$('[name=sprice]', row).value || 0 };
        }).filter(function (s) { return s.name; });
        var parts = $$('#partRows .line', form).map(function (row) {
          var pid = +$('[name=ppart]', row).value, p = DB.get('parts', pid);
          return p ? { partId: pid, name: p.name, qty: Math.max(1, Math.floor(+$('[name=pqty]', row).value || 1)), price: +$('[name=pprice]', row).value || 0 } : null;
        }).filter(Boolean);

        /* stock check + adjustment */
        var oldQ = {}, newQ = {};
        (r ? r.parts : []).forEach(function (p) { oldQ[p.partId] = (oldQ[p.partId] || 0) + p.qty; });
        parts.forEach(function (p) { newQ[p.partId] = (newQ[p.partId] || 0) + p.qty; });
        Object.keys(newQ).forEach(function (pid) {
          var p = DB.get('parts', pid), avail = p.stock + (oldQ[pid] || 0);
          if (newQ[pid] > avail) throw new Error('Not enough stock for "' + p.name + '" (available: ' + avail + ').');
        });
        var patch = {
          motorcycleId: m.id, customerId: m.customerId, problem: val(form, 'problem'),
          mechanicId: form.elements.mechanicId.value ? +form.elements.mechanicId.value : null,
          status: form.elements.status.value, isEmergency: form.elements.isEmergency.checked,
          services: services, parts: parts, notes: val(form, 'notes'), updatedAt: new Date().toISOString()
        };
        if (!patch.problem) throw new Error('Please describe the problem.');
        Object.keys(Object.assign({}, oldQ, newQ)).forEach(function (pid) {
          var d = (oldQ[pid] || 0) - (newQ[pid] || 0);
          if (d) DB.adjustStock(+pid, d);
        });
        if (r) { DB.update('repairs', r.id, patch); toast('Repair job updated.'); }
        else {
          var nr = DB.insert('repairs', patch);
          if (pre.emergencyId) {
            var em = DB.get('emergencies', pre.emergencyId);
            DB.update('emergencies', pre.emergencyId, { repairId: nr.id, status: em && em.status === 'Pending' ? 'Dispatched' : (em ? em.status : 'Dispatched'), mechanicId: patch.mechanicId || (em && em.mechanicId) || null });
          }
          toast('Repair job #' + nr.id + ' created.');
        }
        setTimeout(refresh, 0);
      }
    });
    setTimeout(calc, 0);
  }

  function calc() {
    var f = $('#mform'); if (!f || !$('#calcTotal')) return;
    var s = $$('#svcRows .line', f).reduce(function (a, row) { return a + (+$('[name=sprice]', row).value || 0); }, 0);
    var p = $$('#partRows .line', f).reduce(function (a, row) { return a + (+$('[name=pqty]', row).value || 0) * (+$('[name=pprice]', row).value || 0); }, 0);
    $('#calcTotal').textContent = peso(s + p);
  }

  function delRepair(id) {
    if (!confirmBox('Delete repair job #' + id + ' and its payment records? Parts used will be returned to stock.')) return;
    var r = DB.get('repairs', id);
    r.parts.forEach(function (p) { DB.adjustStock(p.partId, p.qty); });
    DB.all('payments').filter(function (p) { return p.repairId === id; }).forEach(function (p) { DB.remove('payments', p.id); });
    DB.all('emergencies').filter(function (e) { return e.repairId === id; }).forEach(function (e) { DB.update('emergencies', e.id, { repairId: null }); });
    DB.remove('repairs', id);
    toast('Repair job deleted.'); refresh();
  }

  /* ---------- Customers ---------- */
  TBL.customers = function () {
    var f = fil('customers');
    var rows = DB.all('customers').filter(function (c) {
      return matches(f.q, [c.name, c.phone, c.address, c.email]);
    }).sort(function (a, b) { return a.name.localeCompare(b.name); }).map(function (c) {
      var u = c.userId ? userOf(c.userId) : null;
      var n = DB.all('motorcycles').filter(function (m) { return m.customerId === c.id; }).length;
      return '<tr><td><b>' + esc(c.name) + '</b></td><td>' + esc(c.phone) + '</td><td>' + esc(c.address) + '</td><td>' + esc(c.email) +
        '</td><td>' + (u ? esc(u.username) : '<small>Walk-in</small>') + '</td><td class="num">' + n + '</td><td>' +
        '<button class="btn sm" onclick="App.custHistory(' + c.id + ')">History</button>' +
        '<button class="btn sm" onclick="App.custForm(' + c.id + ')">Edit</button>' +
        (isOwner ? '<button class="btn sm danger" onclick="App.delCust(' + c.id + ')">Delete</button>' : '') + '</td></tr>';
    });
    return table(['Name', 'Phone', 'Address', 'Email', 'Account', 'num:Motorcycles', 'Actions'], rows, 'No customers found.');
  };
  VIEWS.customers = function () {
    return '<div class="toolbar">' + searchBox('customers', 'Search name, phone, address…') +
      '<button class="btn primary" onclick="App.custForm()">+ Add customer</button></div><div id="tbl">' + TBL.customers() + '</div>';
  };
  function custForm(id) {
    var c = id ? cust(id) : { name: '', phone: '', address: '', email: '' };
    modal(id ? 'Edit Customer' : 'Add Customer',
      '<div class="field"><label>Full name *</label><input name="name" required value="' + esc(c.name) + '"></div>' +
      '<div class="grid2"><div class="field"><label>Phone *</label><input name="phone" required value="' + esc(c.phone) + '"></div>' +
      '<div class="field"><label>Email</label><input name="email" type="email" value="' + esc(c.email) + '"></div></div>' +
      '<div class="field"><label>Address</label><input name="address" value="' + esc(c.address) + '"></div>' +
      (id ? '' : '<p class="hint">Walk-in customers do not need a login. Create an account for them in Accounts if they want online access.</p>'), {
      onSave: function (f) {
        var d = { name: val(f, 'name'), phone: val(f, 'phone'), email: val(f, 'email'), address: val(f, 'address') };
        if (!d.name || !d.phone) throw new Error('Name and phone are required.');
        if (id) {
          DB.update('customers', id, d);
          if (c.userId) DB.update('users', c.userId, { name: d.name, phone: d.phone });
        } else DB.insert('customers', Object.assign(d, { userId: null }));
        toast('Customer saved.'); setTimeout(refresh, 0);
      }
    });
  }
  function delCust(id) {
    var hasMoto = DB.all('motorcycles').some(function (m) { return m.customerId === id; });
    var hasRep = DB.all('repairs').some(function (r) { return r.customerId === id; });
    if (hasMoto || hasRep) { toast('Cannot delete: this customer still has motorcycles or repair records.', true); return; }
    if (!confirmBox('Delete this customer' + (cust(id).userId ? ' and their login account' : '') + '?')) return;
    var c = cust(id);
    if (c.userId) DB.remove('users', c.userId);
    DB.remove('customers', id); toast('Customer deleted.'); refresh();
  }
  function custHistory(id) {
    var c = cust(id);
    var reps = DB.all('repairs').filter(function (r) { return r.customerId === id; }).sort(newestFirst);
    modal('Repair history – ' + esc(c.name), repairHistoryTable(reps, true), { wide: true, hideSave: true });
  }
  function repairHistoryTable(reps, showMoto) {
    return table(['Job #', 'Date'].concat(showMoto ? ['Motorcycle'] : []).concat(['Problem', 'Status', 'num:Total', 'Payment', '']), reps.map(function (r) {
      var t = DB.totals(r);
      return '<tr><td>#' + r.id + '</td><td>' + fmtDate(r.createdAt) + '</td>' + (showMoto ? '<td>' + esc(motoLabel(moto(r.motorcycleId))) + '</td>' : '') +
        '<td>' + esc(r.problem) + '</td><td>' + badge(r.status) + '</td><td class="num">' + peso(t.total) + '</td><td>' + badge(t.status) +
        '</td><td><button type="button" class="btn sm" onclick="App.viewRepair(' + r.id + ')">Details</button></td></tr>';
    }), 'No repair history yet.');
  }

  /* ---------- Motorcycles ---------- */
  TBL.motorcycles = TBL.mymotos = function () {
    var f = fil(view);
    var rows = myMotos().filter(function (m) {
      return matches(f.q, [m.brand, m.model, m.plate, m.type, custName(m.customerId)]);
    }).sort(function (a, b) { return a.plate.localeCompare(b.plate); }).map(function (m) {
      var n = DB.all('repairs').filter(function (r) { return r.motorcycleId === m.id; }).length;
      return '<tr><td><b>' + esc(m.plate) + '</b></td><td>' + esc(m.brand) + '</td><td>' + esc(m.model) + '</td><td>' + esc(m.type) + '</td>' +
        (isCust ? '' : '<td>' + esc(custName(m.customerId)) + '</td>') + '<td class="num">' + n + '</td><td>' +
        '<button class="btn sm" onclick="App.motoHistory(' + m.id + ')">History</button>' +
        '<button class="btn sm" onclick="App.motoForm(' + m.id + ')">Edit</button>' +
        (isStaff ? '<button class="btn sm danger" onclick="App.delMoto(' + m.id + ')">Delete</button>' : '') + '</td></tr>';
    });
    return table(['Plate no.', 'Brand', 'Model', 'Type'].concat(isCust ? [] : ['Owner']).concat(['num:Repairs', 'Actions']), rows, 'No motorcycles found.');
  };
  VIEWS.motorcycles = VIEWS.mymotos = function () {
    return '<div class="toolbar">' + searchBox(view, 'Search plate, brand, model, owner…') +
      '<button class="btn primary" onclick="App.motoForm()">+ Add motorcycle</button></div><div id="tbl">' + TBL[view]() + '</div>';
  };
  function motoForm(id) {
    var m = id ? moto(id) : { customerId: isCust ? me.customerId : '', brand: '', model: '', plate: '', type: 'Scooter' };
    var custField = isCust ? '' :
      '<div class="field"><label>Owner (customer) *</label><select name="customerId" required><option value="">— select —</option>' +
      DB.all('customers').sort(function (a, b) { return a.name.localeCompare(b.name); }).map(function (c) {
        return '<option value="' + c.id + '"' + (c.id === m.customerId ? ' selected' : '') + '>' + esc(c.name) + '</option>';
      }).join('') + '</select></div>';
    if (!isCust && !DB.all('customers').length) { toast('Add a customer first.', true); return; }
    modal(id ? 'Edit Motorcycle' : 'Add Motorcycle', custField +
      '<div class="grid2"><div class="field"><label>Brand *</label><input name="brand" required value="' + esc(m.brand) + '" placeholder="e.g. Honda"></div>' +
      '<div class="field"><label>Model *</label><input name="model" required value="' + esc(m.model) + '" placeholder="e.g. Click 125"></div></div>' +
      '<div class="grid2"><div class="field"><label>Plate number *</label><input name="plate" required value="' + esc(m.plate) + '"></div>' +
      '<div class="field"><label>Type</label><select name="type">' + opts(MOTO_TYPES, m.type) + '</select></div></div>', {
      onSave: function (f) {
        var d = {
          customerId: isCust ? me.customerId : +f.elements.customerId.value,
          brand: val(f, 'brand'), model: val(f, 'model'), plate: val(f, 'plate').toUpperCase(), type: f.elements.type.value
        };
        if (!d.customerId || !d.brand || !d.model || !d.plate) throw new Error('Please complete all required fields.');
        var dup = DB.all('motorcycles').some(function (x) { return x.plate.replace(/\s/g, '') === d.plate.replace(/\s/g, '') && x.id !== id; });
        if (dup) throw new Error('A motorcycle with this plate number already exists.');
        if (id) DB.update('motorcycles', id, d); else DB.insert('motorcycles', d);
        toast('Motorcycle saved.'); setTimeout(refresh, 0);
      }
    });
  }
  function delMoto(id) {
    if (DB.all('repairs').some(function (r) { return r.motorcycleId === id; })) { toast('Cannot delete: motorcycle has repair records.', true); return; }
    if (!confirmBox('Delete this motorcycle?')) return;
    DB.remove('motorcycles', id); toast('Motorcycle deleted.'); refresh();
  }
  function motoHistory(id) {
    var reps = DB.all('repairs').filter(function (r) { return r.motorcycleId === id; }).sort(newestFirst);
    modal('Repair history – ' + esc(motoLabel(moto(id))), repairHistoryTable(reps, false), { wide: true, hideSave: true });
  }

  /* ---------- Emergency services ---------- */
  TBL.emergency = function () {
    var f = fil('emergency');
    var rows = myEmergencies().filter(function (e) {
      if (f.s && e.status !== f.s) return false;
      if (f.u && e.urgency !== f.u) return false;
      return matches(f.q, [e.contactName, e.phone, e.location, e.problem]);
    }).sort(function (a, b) {
      var open = function (e) { return e.status === 'Pending' || e.status === 'Dispatched' ? 0 : 1; };
      return open(a) - open(b) || newestFirst(a, b);
    }).map(function (e) {
      var m = e.motorcycleId ? moto(e.motorcycleId) : null;
      var acts = '';
      if (isStaff) {
        acts += '<button class="btn sm" onclick="App.emForm(' + e.id + ')">Update</button>';
        if (!e.repairId && e.status !== 'Cancelled' && e.status !== 'Resolved') acts += '<button class="btn sm primary" onclick="App.emToRepair(' + e.id + ')">Create repair job</button>';
        if (e.repairId) acts += '<button class="btn sm" onclick="App.viewRepair(' + e.repairId + ')">Job #' + e.repairId + '</button>';
        if (isOwner) acts += '<button class="btn sm danger" onclick="App.delEm(' + e.id + ')">Delete</button>';
      } else if (e.status === 'Pending') acts += '<button class="btn sm danger" onclick="App.cancelEm(' + e.id + ')">Cancel request</button>';
      return '<tr><td>' + e.id + '</td><td>' + fmtDate(e.createdAt) + '</td><td>' + esc(e.contactName) + '<br><small>' + esc(e.phone) + '</small></td>' +
        '<td>' + esc(m ? motoLabel(m) : e.motoInfo) + '</td><td>' + esc(e.location) + '</td><td>' + esc(e.problem) + '</td><td>' + urgBadge(e.urgency) +
        '</td><td>' + badge(e.status) + '</td><td>' + esc(mechName(e.mechanicId)) + '</td><td>' + acts + '</td></tr>';
    });
    return table(['#', 'Date', 'Contact', 'Motorcycle', 'Location', 'Problem', 'Urgency', 'Status', 'Mechanic', 'Actions'], rows, 'No emergency requests.');
  };
  VIEWS.emergency = function () {
    var f = fil('emergency');
    return '<div class="toolbar">' + searchBox('emergency', 'Search contact, location, problem…') +
      (isStaff ? '<select onchange="App.filter(\'emergency\',\'s\',this.value)"><option value="">All statuses</option>' + EM_STATUSES.map(function (s) { return '<option' + (f.s === s ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select>' : '') +
      '<select onchange="App.filter(\'emergency\',\'u\',this.value)"><option value="">All urgency</option>' + URGENCY.map(function (s) { return '<option' + (f.u === s ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select>' +
      '<button class="btn primary" onclick="App.emForm()">🚨 ' + (isCust ? 'Request emergency service' : 'New emergency request') + '</button></div>' +
      '<div id="tbl">' + TBL.emergency() + '</div>';
  };
  function motoOptionsFor(customerId, sel) {
    var list = DB.all('motorcycles').filter(function (m) { return !customerId || m.customerId === +customerId; });
    return '<option value="">— not registered / other —</option>' + list.map(function (m) {
      return '<option value="' + m.id + '"' + (m.id === sel ? ' selected' : '') + '>' + esc(motoLabel(m)) + '</option>';
    }).join('');
  }
  function emForm(id) {
    var e = id ? DB.get('emergencies', id) : null;
    var myC = isCust ? cust(me.customerId) : null;
    var d = e || { customerId: isCust ? me.customerId : null, contactName: myC ? myC.name : '', phone: myC ? myC.phone : '', motorcycleId: null, motoInfo: '', location: '', problem: '', urgency: 'High', status: 'Pending', mechanicId: null };
    var body = '';
    if (isStaff) {
      body += '<div class="field"><label>Registered customer</label><select name="customerId" onchange="App.emCustPick(this)"><option value="">— walk-in / not registered —</option>' +
        DB.all('customers').map(function (c) { return '<option value="' + c.id + '"' + (c.id === d.customerId ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join('') + '</select></div>';
    }
    body += '<div class="grid2"><div class="field"><label>Contact name *</label><input name="contactName" required value="' + esc(d.contactName) + '"></div>' +
      '<div class="field"><label>Phone *</label><input name="phone" required value="' + esc(d.phone) + '"></div></div>' +
      '<div class="field"><label>Motorcycle</label><select name="motorcycleId">' + motoOptionsFor(d.customerId, d.motorcycleId) + '</select></div>' +
      '<div class="field"><label>Motorcycle details (if not registered)</label><input name="motoInfo" value="' + esc(d.motoInfo) + '" placeholder="Brand, model, plate"></div>' +
      '<div class="field"><label>Location of the motorcycle *</label><input name="location" required value="' + esc(d.location) + '" placeholder="Where should the mechanic go?"></div>' +
      '<div class="field"><label>Problem *</label><textarea name="problem" required>' + esc(d.problem) + '</textarea></div>' +
      '<div class="field"><label>Urgency</label><select name="urgency">' + opts(URGENCY, d.urgency) + '</select></div>';
    if (isStaff && e) {
      body += '<div class="grid2"><div class="field"><label>Status</label><select name="status">' + opts(EM_STATUSES, d.status) + '</select></div>' +
        '<div class="field"><label>Assigned mechanic</label><select name="mechanicId"><option value="">— unassigned —</option>' +
        DB.all('users').filter(function (u) { return u.role === 'mechanic' || u.role === 'owner'; }).map(function (u) { return '<option value="' + u.id + '"' + (u.id === d.mechanicId ? ' selected' : '') + '>' + esc(u.name) + '</option>'; }).join('') + '</select></div></div>';
    }
    modal(e ? 'Update Emergency Request #' + e.id : '🚨 Emergency Service Request', body, {
      saveLabel: e ? 'Save' : 'Submit request',
      onSave: function (f) {
        var data = {
          customerId: isCust ? me.customerId : (f.elements.customerId.value ? +f.elements.customerId.value : null),
          contactName: val(f, 'contactName'), phone: val(f, 'phone'),
          motorcycleId: f.elements.motorcycleId.value ? +f.elements.motorcycleId.value : null,
          motoInfo: val(f, 'motoInfo'), location: val(f, 'location'), problem: val(f, 'problem'), urgency: f.elements.urgency.value
        };
        if (!data.contactName || !data.phone || !data.location || !data.problem) throw new Error('Please complete all required fields.');
        if (isStaff && e) { data.status = f.elements.status.value; data.mechanicId = f.elements.mechanicId.value ? +f.elements.mechanicId.value : null; }
        if (e) DB.update('emergencies', e.id, data);
        else DB.insert('emergencies', Object.assign(data, { status: 'Pending', mechanicId: null, repairId: null }));
        toast(e ? 'Emergency request updated.' : 'Emergency request submitted. The shop will contact you.'); setTimeout(refresh, 0);
      }
    });
  }
  function emCustPick(sel) {
    var c = cust(+sel.value), f = sel.form;
    if (c) { f.elements.contactName.value = c.name; f.elements.phone.value = c.phone; }
    f.elements.motorcycleId.innerHTML = motoOptionsFor(sel.value, null);
  }
  function emToRepair(id) {
    var e = DB.get('emergencies', id);
    var m = e.motorcycleId ? moto(e.motorcycleId) : null;
    repairForm(null, { motorcycleId: m ? m.id : null, problem: e.problem + (e.location ? ' (Location: ' + e.location + ')' : ''), isEmergency: true, emergencyId: id, mechanicId: e.mechanicId || (isMech ? me.id : null) });
  }
  function delEm(id) { if (!confirmBox('Delete this emergency request?')) return; DB.remove('emergencies', id); toast('Deleted.'); refresh(); }
  function cancelEm(id) { if (!confirmBox('Cancel this emergency request?')) return; DB.update('emergencies', id, { status: 'Cancelled' }); toast('Request cancelled.'); refresh(); }

  /* ---------- Services & Parts catalog (owner) ---------- */
  var catTab = 'services';
  VIEWS.catalog = function () {
    var h = '<div class="tabbar"><button class="' + (catTab === 'services' ? 'on' : '') + '" onclick="App.catTab(\'services\')">Services</button>' +
      '<button class="' + (catTab === 'parts' ? 'on' : '') + '" onclick="App.catTab(\'parts\')">Parts / Inventory</button></div>';
    if (catTab === 'services') {
      h += '<div class="toolbar"><div class="grow"></div><button class="btn primary" onclick="App.svcForm()">+ Add service</button></div>' +
        table(['Service', 'num:Standard price', 'Actions'], DB.all('services').sort(function (a, b) { return a.name.localeCompare(b.name); }).map(function (s) {
          return '<tr><td>' + esc(s.name) + '</td><td class="num">' + peso(s.price) + '</td><td><button class="btn sm" onclick="App.svcForm(' + s.id + ')">Edit</button><button class="btn sm danger" onclick="App.delCat(\'services\',' + s.id + ')">Delete</button></td></tr>';
        }), 'No services yet.');
    } else {
      h += '<div class="toolbar"><div class="grow"></div><button class="btn primary" onclick="App.partForm()">+ Add part</button></div>' +
        table(['Part', 'num:Unit price', 'num:In stock', 'Actions'], DB.all('parts').sort(function (a, b) { return a.name.localeCompare(b.name); }).map(function (p) {
          return '<tr><td>' + esc(p.name) + '</td><td class="num">' + peso(p.price) + '</td><td class="num">' + (p.stock <= 3 ? '<span class="badge s-unpaid">' + p.stock + ' low</span>' : p.stock) + '</td><td><button class="btn sm" onclick="App.partForm(' + p.id + ')">Edit</button><button class="btn sm danger" onclick="App.delCat(\'parts\',' + p.id + ')">Delete</button></td></tr>';
        }), 'No parts yet.');
    }
    return h;
  };
  function svcForm(id) {
    var s = id ? DB.get('services', id) : { name: '', price: '' };
    modal(id ? 'Edit Service' : 'Add Service',
      '<div class="field"><label>Service name *</label><input name="name" required value="' + esc(s.name) + '"></div>' +
      '<div class="field"><label>Standard price (₱) *</label><input name="price" type="number" min="0" step="0.01" required value="' + s.price + '"></div>', {
      onSave: function (f) {
        var d = { name: val(f, 'name'), price: +f.elements.price.value };
        if (!d.name) throw new Error('Name is required.');
        if (id) DB.update('services', id, d); else DB.insert('services', d);
        toast('Service saved.'); setTimeout(refresh, 0);
      }
    });
  }
  function partForm(id) {
    var p = id ? DB.get('parts', id) : { name: '', price: '', stock: 0 };
    modal(id ? 'Edit Part' : 'Add Part',
      '<div class="field"><label>Part name *</label><input name="name" required value="' + esc(p.name) + '"></div>' +
      '<div class="grid2"><div class="field"><label>Unit price (₱) *</label><input name="price" type="number" min="0" step="0.01" required value="' + p.price + '"></div>' +
      '<div class="field"><label>Stock quantity *</label><input name="stock" type="number" min="0" step="1" required value="' + p.stock + '"></div></div>', {
      onSave: function (f) {
        var d = { name: val(f, 'name'), price: +f.elements.price.value, stock: Math.max(0, Math.floor(+f.elements.stock.value)) };
        if (!d.name) throw new Error('Name is required.');
        if (id) DB.update('parts', id, d); else DB.insert('parts', d);
        toast('Part saved.'); setTimeout(refresh, 0);
      }
    });
  }
  function delCat(t, id) {
    if (!confirmBox('Delete this item from the catalog? Existing repair records keep their own copy.')) return;
    DB.remove(t, id); toast('Deleted.'); refresh();
  }

  /* ---------- Payments (owner) ---------- */
  TBL.payments = function () {
    var f = fil('payments');
    var rows = DB.all('repairs').filter(function (r) {
      var t = DB.totals(r);
      if (f.s === 'Unpaid' && t.status !== 'Unpaid') return false;
      if (f.s === 'Partial' && t.status !== 'Partial') return false;
      if (f.s === 'Paid' && t.status !== 'Paid') return false;
      return matches(f.q, [r.id, custName(r.customerId), motoLabel(moto(r.motorcycleId))]);
    }).sort(newestFirst).map(function (r) {
      var t = DB.totals(r);
      return '<tr><td>#' + r.id + '</td><td>' + fmtDate(r.createdAt) + '</td><td>' + esc(custName(r.customerId)) + '</td><td>' + esc(motoLabel(moto(r.motorcycleId))) +
        '</td><td>' + badge(r.status) + '</td><td class="num">' + peso(t.total) + '</td><td class="num">' + peso(t.paid) + '</td><td class="num"><b>' + peso(t.balance) + '</b></td><td>' + badge(t.status) +
        '</td><td><button class="btn sm" onclick="App.viewRepair(' + r.id + ')">View</button>' + (t.balance > 0 ? '<button class="btn sm primary" onclick="App.payForm(' + r.id + ')">Record payment</button>' : '') + '</td></tr>';
    });
    return table(['Job #', 'Date', 'Customer', 'Motorcycle', 'Repair', 'num:Total', 'num:Paid', 'num:Balance', 'Payment', 'Actions'], rows, 'No repair jobs found.');
  };
  VIEWS.payments = function () {
    var f = fil('payments');
    var all = DB.all('repairs').map(DB.totals);
    var billed = all.reduce(function (a, t) { return a + t.total; }, 0), paid = all.reduce(function (a, t) { return a + t.paid; }, 0);
    var pays = DB.all('payments').sort(function (a, b) { return b.date.localeCompare(a.date) || b.id - a.id; }).slice(0, 10);
    return '<div class="cards"><div class="stat"><div class="n">' + peso(billed) + '</div><div class="l">Total billed</div></div>' +
      '<div class="stat green"><div class="n">' + peso(paid) + '</div><div class="l">Total collected</div></div>' +
      '<div class="stat red"><div class="n">' + peso(billed - paid) + '</div><div class="l">Outstanding</div></div></div>' +
      '<div class="toolbar">' + searchBox('payments', 'Search job #, customer, motorcycle…') +
      '<select onchange="App.filter(\'payments\',\'s\',this.value)"><option value="">All payment statuses</option>' + ['Unpaid', 'Partial', 'Paid'].map(function (s) { return '<option' + (f.s === s ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select></div>' +
      '<div id="tbl">' + TBL.payments() + '</div>' +
      '<div class="panel" style="margin-top:18px"><h3>Latest payments</h3>' + table(['Date', 'Job #', 'Customer', 'Method', 'num:Amount', 'Note', ''], pays.map(function (p) {
        var r = DB.get('repairs', p.repairId);
        return '<tr><td>' + fmtDay(p.date) + '</td><td>#' + p.repairId + '</td><td>' + esc(r ? custName(r.customerId) : '—') + '</td><td>' + esc(p.method) + '</td><td class="num">' + peso(p.amount) + '</td><td>' + esc(p.note) +
          '</td><td><button class="btn sm danger" onclick="App.delPay(' + p.id + ')">Void</button></td></tr>';
      }), 'No payments recorded yet.') + '</div>';
  };
  function payForm(id) {
    var r = DB.get('repairs', id), t = DB.totals(r);
    if (t.total <= 0) { toast('This job has no charges yet. Add services/parts first.', true); return; }
    modal('Record payment – Job #' + id,
      '<div class="kv"><span>Customer</span><span>' + esc(custName(r.customerId)) + '</span><span>Total</span><span>' + peso(t.total) + '</span><span>Already paid</span><span>' + peso(t.paid) + '</span><span>Balance</span><b>' + peso(t.balance) + '</b></div>' +
      '<div class="grid2"><div class="field"><label>Amount (₱) *</label><input name="amount" type="number" min="0.01" step="0.01" max="' + t.balance.toFixed(2) + '" required value="' + t.balance.toFixed(2) + '"></div>' +
      '<div class="field"><label>Method</label><select name="method">' + opts(METHODS, 'Cash') + '</select></div></div>' +
      '<div class="grid2"><div class="field"><label>Date</label><input name="date" type="date" required value="' + todayStr() + '"></div>' +
      '<div class="field"><label>Note</label><input name="note"></div></div>', {
      saveLabel: 'Save payment',
      onSave: function (f) {
        var amt = Math.round(+f.elements.amount.value * 100) / 100, bal = DB.totals(DB.get('repairs', id)).balance;
        if (!(amt > 0)) throw new Error('Enter a valid amount.');
        if (amt > bal + 0.004) throw new Error('Amount is more than the balance (' + peso(bal) + ').');
        DB.insert('payments', { repairId: id, amount: amt, method: f.elements.method.value, date: f.elements.date.value, note: val(f, 'note') });
        toast('Payment of ' + peso(amt) + ' recorded.'); setTimeout(refresh, 0);
      }
    });
  }
  function delPay(id) { if (!confirmBox('Void this payment record?')) return; DB.remove('payments', id); toast('Payment voided.'); refresh(); }

  /* ---------- Reports (owner) ---------- */
  var rep = { type: 'repairs', from: '', to: '' };
  function money(n) { return { m: n }; }
  function cellText(c) { return c && typeof c === 'object' ? peso(c.m) : esc(c); }
  function cellCsv(c) { return c && typeof c === 'object' ? c.m.toFixed(2) : c; }

  function buildReport() {
    var from = rep.from, to = rep.to;
    function inRange(iso) { var d = iso.length > 10 ? localDate(iso) : iso; return (!from || d >= from) && (!to || d <= to); }
    var cols, rows, sum;
    if (rep.type === 'repairs') {
      var rs = DB.all('repairs').filter(function (r) { return inRange(r.createdAt); }).sort(newestFirst);
      var billed = 0, paid = 0;
      cols = ['Job #', 'Date', 'Customer', 'Motorcycle', 'Problem', 'Mechanic', 'Status', 'Total', 'Paid', 'Balance'];
      rows = rs.map(function (r) {
        var t = DB.totals(r); billed += t.total; paid += t.paid;
        return [r.id, fmtDate(r.createdAt), custName(r.customerId), motoLabel(moto(r.motorcycleId)), r.problem, mechName(r.mechanicId), r.status, money(t.total), money(t.paid), money(t.balance)];
      });
      sum = [['Jobs', rs.length], ['Completed', rs.filter(function (r) { return r.status === 'Completed'; }).length], ['Total billed', peso(billed)], ['Collected', peso(paid)]];
    } else if (rep.type === 'services') {
      var agg = {};
      DB.all('repairs').filter(function (r) { return inRange(r.createdAt); }).forEach(function (r) {
        r.services.forEach(function (s) { var a = agg[s.name] || (agg[s.name] = { n: 0, amt: 0 }); a.n++; a.amt += +s.price || 0; });
      });
      var names = Object.keys(agg).sort(function (a, b) { return agg[b].n - agg[a].n; });
      cols = ['Service', 'Times performed', 'Revenue'];
      rows = names.map(function (n) { return [n, agg[n].n, money(agg[n].amt)]; });
      sum = [['Service types', names.length], ['Total services done', names.reduce(function (a, n) { return a + agg[n].n; }, 0)], ['Service revenue', peso(names.reduce(function (a, n) { return a + agg[n].amt; }, 0))]];
    } else if (rep.type === 'payments') {
      var ps = DB.all('payments').filter(function (p) { return inRange(p.date); }).sort(function (a, b) { return b.date.localeCompare(a.date); });
      var tot = 0;
      cols = ['Date', 'Job #', 'Customer', 'Method', 'Amount', 'Note'];
      rows = ps.map(function (p) {
        tot += +p.amount; var r = DB.get('repairs', p.repairId);
        return [fmtDay(p.date), p.repairId, r ? custName(r.customerId) : '—', p.method, money(+p.amount), p.note || ''];
      });
      var byM = {}; ps.forEach(function (p) { byM[p.method] = (byM[p.method] || 0) + (+p.amount); });
      sum = [['Payments', ps.length], ['Total collected', peso(tot)]].concat(Object.keys(byM).map(function (k) { return [k, peso(byM[k])]; }));
    } else {
      var es = DB.all('emergencies').filter(function (e) { return inRange(e.createdAt); }).sort(newestFirst);
      cols = ['#', 'Date', 'Contact', 'Phone', 'Location', 'Problem', 'Urgency', 'Status', 'Mechanic'];
      rows = es.map(function (e) { return [e.id, fmtDate(e.createdAt), e.contactName, e.phone, e.location, e.problem, e.urgency, e.status, mechName(e.mechanicId)]; });
      sum = [['Requests', es.length]].concat(EM_STATUSES.map(function (s) { return [s, es.filter(function (e) { return e.status === s; }).length]; }));
    }
    return { cols: cols, rows: rows, sum: sum };
  }
  var REPORT_NAMES = { repairs: 'Repair Report', services: 'Service Report', payments: 'Payment Report', emergency: 'Emergency Service Report' };
  function reportBody() {
    var R = buildReport();
    var title = REPORT_NAMES[rep.type] + (rep.from || rep.to ? ' (' + (rep.from ? fmtDay(rep.from) : 'start') + ' – ' + (rep.to ? fmtDay(rep.to) : 'today') + ')' : ' (all dates)');
    var numCols = { Total: 1, Paid: 1, Balance: 1, Revenue: 1, Amount: 1 };
    return '<h2 class="print-title">' + esc("Bobby's Motorcycle Repair – " + title) + '</h2>' +
      '<div class="sumrow">' + R.sum.map(function (s) { return '<div><small>' + esc(s[0]) + '</small><b>' + esc(s[1]) + '</b></div>'; }).join('') + '</div>' +
      table(R.cols.map(function (c) { return numCols[c] ? 'num:' + c : c; }), R.rows.map(function (r) {
        return '<tr>' + r.map(function (c, i) { return '<td' + (numCols[R.cols[i]] ? ' class="num"' : '') + '>' + cellText(c) + '</td>'; }).join('') + '</tr>';
      }), 'No data for the selected period.');
  }
  TBL.reports = reportBody;
  VIEWS.reports = function () {
    var tabs = Object.keys(REPORT_NAMES).map(function (k) { return '<button class="' + (rep.type === k ? 'on' : '') + '" onclick="App.repType(\'' + k + '\')">' + REPORT_NAMES[k].replace(' Report', 's') + '</button>'; }).join('');
    return '<div class="tabbar">' + tabs + '</div>' +
      '<div class="toolbar"><label style="margin:0">From</label><input type="date" value="' + rep.from + '" onchange="App.repRange(\'from\',this.value)">' +
      '<label style="margin:0">To</label><input type="date" value="' + rep.to + '" onchange="App.repRange(\'to\',this.value)">' +
      '<button class="btn" onclick="App.repRange(\'clear\')">Clear</button><div class="grow"></div>' +
      '<button class="btn" onclick="App.repCsv()">⬇ Export CSV</button><button class="btn primary" onclick="window.print()">🖨 Print</button></div>' +
      '<div id="tbl">' + reportBody() + '</div>';
  };
  function download(name, text, mime) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: mime || 'text/plain' }));
    a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function repCsv() {
    var R = buildReport();
    var lines = [R.cols.map(csvCell).join(',')].concat(R.rows.map(function (r) { return r.map(function (c) { return csvCell(cellCsv(c)); }).join(','); }));
    download('bobbys-' + rep.type + '-report-' + todayStr() + '.csv', '﻿' + lines.join('\r\n'), 'text/csv;charset=utf-8');
  }

  /* ---------- Accounts (owner) ---------- */
  VIEWS.accounts = function () {
    var rows = DB.all('users').sort(function (a, b) { return a.role.localeCompare(b.role) || a.name.localeCompare(b.name); }).map(function (u) {
      return '<tr><td><b>' + esc(u.name) + '</b></td><td>' + esc(u.username) + '</td><td><span class="role-pill">' + u.role + '</span></td><td>' + esc(u.phone || '') + '</td><td>' +
        '<button class="btn sm" onclick="App.userForm(' + u.id + ')">Edit / reset password</button>' +
        (u.id !== me.id ? '<button class="btn sm danger" onclick="App.delUser(' + u.id + ')">Delete</button>' : '<small>(you)</small>') + '</td></tr>';
    });
    return '<div class="toolbar"><div class="grow"><p style="margin:0;color:var(--muted)">Manage logins for the owner, mechanics and customers.</p></div><button class="btn primary" onclick="App.userForm()">+ Add account</button></div>' +
      table(['Name', 'Username', 'Role', 'Phone', 'Actions'], rows);
  };
  function userForm(id) {
    var u = id ? userOf(id) : { name: '', username: '', role: 'mechanic', phone: '' };
    modal(id ? 'Edit Account' : 'Add Account',
      '<div class="field"><label>Full name *</label><input name="name" required value="' + esc(u.name) + '"></div>' +
      '<div class="grid2"><div class="field"><label>Username *</label><input name="username" required value="' + esc(u.username) + '"></div>' +
      '<div class="field"><label>Role *</label><select name="role"' + (id ? ' disabled' : '') + '>' + ['owner', 'mechanic', 'customer'].map(function (r) { return '<option value="' + r + '"' + (r === u.role ? ' selected' : '') + '>' + r + '</option>'; }).join('') + '</select></div></div>' +
      '<div class="grid2"><div class="field"><label>Phone</label><input name="phone" value="' + esc(u.phone || '') + '"></div>' +
      '<div class="field"><label>' + (id ? 'New password' : 'Password *') + '</label><input name="password" type="password" minlength="6" ' + (id ? 'placeholder="Leave blank to keep"' : 'required') + '></div></div>', {
      onSave: function (f) {
        var name = val(f, 'name'), username = val(f, 'username'), pw = f.elements.password.value, phone = val(f, 'phone');
        if (!name) throw new Error('Name is required.');
        if (!/^[A-Za-z0-9_.-]{4,}$/.test(username)) throw new Error('Username: at least 4 characters (letters, numbers, . _ -).');
        if (Auth.usernameTaken(username, id)) throw new Error('That username is already taken.');
        if (pw && pw.length < 6) throw new Error('Password must be at least 6 characters.');
        if (id) {
          var patch = { name: name, username: username, phone: phone };
          if (pw) patch.passHash = Auth.hashPw(pw);
          DB.update('users', id, patch);
          if (u.customerId) DB.update('customers', u.customerId, { name: name, phone: phone });
        } else {
          var role = f.elements.role.value, nu = { role: role, name: name, username: username, passHash: Auth.hashPw(pw), phone: phone };
          if (role === 'customer') {
            var c = DB.insert('customers', { name: name, phone: phone || '—', address: '', email: '', userId: null });
            nu.customerId = c.id; var made = DB.insert('users', nu); DB.update('customers', c.id, { userId: made.id });
          } else DB.insert('users', nu);
        }
        toast('Account saved.'); setTimeout(refresh, 0);
      }
    });
  }
  function delUser(id) {
    var u = userOf(id);
    if (u.role === 'owner' && DB.all('users').filter(function (x) { return x.role === 'owner'; }).length < 2) { toast('Cannot delete the only owner account.', true); return; }
    if (!confirmBox('Delete the account "' + u.username + '"? Their repair records stay in the system.')) return;
    DB.all('repairs').forEach(function (r) { if (r.mechanicId === id) DB.update('repairs', r.id, { mechanicId: null }); });
    DB.all('emergencies').forEach(function (e) { if (e.mechanicId === id) DB.update('emergencies', e.id, { mechanicId: null }); });
    if (u.customerId) DB.update('customers', u.customerId, { userId: null });
    DB.remove('users', id); toast('Account deleted.'); refresh();
  }

  /* ---------- Backup (owner) ---------- */
  VIEWS.backup = function () {
    return '<div class="panel"><h3>Back up data</h3><p>All system data is stored in this browser on this computer. Download a backup file regularly so records are not lost if the computer has a problem.</p>' +
      '<button class="btn primary" onclick="App.exportDb()">⬇ Download backup (.json)</button></div>' +
      '<div class="panel"><h3>Restore from backup</h3><p>Choose a backup file. This <b>replaces</b> all current data.</p><input type="file" accept=".json,application/json" onchange="App.importDb(this)"></div>' +
      '<div class="panel"><h3>Sample data</h3><p>Adds sample customers, motorcycles, repairs, payments and emergency requests for demonstration. Sample customer logins: <code>juan</code> / <code>maria</code> with password <code>customer123</code>.</p>' +
      '<button class="btn" onclick="App.sample()">Load sample data</button></div>' +
      '<div class="panel"><h3>Reset system</h3><p>Erase everything and restore the default accounts, services and parts.</p><button class="btn danger" onclick="App.resetDb()">Reset all data</button></div>';
  };

  /* ==========================================================
     Password change / logout / wiring
     ========================================================== */
  function pwForm() {
    modal('Change password',
      '<div class="field"><label>Current password</label><input type="password" name="cur" required></div>' +
      '<div class="field"><label>New password (min. 6 characters)</label><input type="password" name="nw" minlength="6" required></div>' +
      '<div class="field"><label>Confirm new password</label><input type="password" name="cf" required></div>', {
      onSave: function (f) {
        if (DB.get('users', me.id).passHash !== Auth.hashPw(f.elements.cur.value)) throw new Error('Current password is incorrect.');
        if (f.elements.nw.value.length < 6) throw new Error('New password must be at least 6 characters.');
        if (f.elements.nw.value !== f.elements.cf.value) throw new Error('Passwords do not match.');
        DB.update('users', me.id, { passHash: Auth.hashPw(f.elements.nw.value) });
        toast('Password changed.');
      }
    });
  }

  window.App = {
    go: go, closeModal: closeModal,
    filter: function (v, k, value) { fil(v)[k] = value; refreshTable(); },
    setStatus: setStatus, viewRepair: viewRepair, repairForm: repairForm, delRepair: delRepair,
    addSvc: function () { $('#svcRows').insertAdjacentHTML('beforeend', svcRow()); },
    addPart: function () { $('#partRows').insertAdjacentHTML('beforeend', partRow()); calc(); },
    rmRow: function (b) { b.parentNode.remove(); calc(); },
    calc: calc,
    svcPick: function (inp) {
      var s = DB.all('services').filter(function (x) { return x.name === inp.value; })[0];
      if (s) { var price = inp.parentNode.querySelector('[name=sprice]'); if (!price.value) price.value = s.price; calc(); }
    },
    partPick: function (sel) {
      var p = DB.get('parts', sel.value), price = sel.parentNode.querySelector('[name=pprice]');
      if (p) price.value = p.price; calc();
    },
    custForm: custForm, delCust: delCust, custHistory: custHistory,
    motoForm: motoForm, delMoto: delMoto, motoHistory: motoHistory,
    emForm: emForm, emCustPick: emCustPick, emToRepair: emToRepair, delEm: delEm, cancelEm: cancelEm,
    catTab: function (t) { catTab = t; refresh(); }, svcForm: svcForm, partForm: partForm, delCat: delCat,
    payForm: payForm, delPay: delPay,
    repType: function (t) { rep.type = t; refresh(); },
    repRange: function (k, v) { if (k === 'clear') { rep.from = rep.to = ''; } else rep[k] = v; refresh(); },
    repCsv: repCsv,
    userForm: userForm, delUser: delUser,
    exportDb: function () { download('bobbys-repair-backup-' + todayStr() + '.json', DB.exportJSON(), 'application/json'); toast('Backup downloaded.'); },
    importDb: function (inp) {
      var file = inp.files[0]; if (!file) return;
      if (!confirmBox('Replace ALL current data with this backup?')) { inp.value = ''; return; }
      var rd = new FileReader();
      rd.onload = function () {
        try { DB.importJSON(rd.result); Auth.logout(); alert('Backup restored. Please log in again.'); location.href = 'index.html'; }
        catch (e) { toast('Restore failed: ' + e.message, true); }
      };
      rd.readAsText(file);
    },
    sample: function () {
      if (DB.all('customers').length && !confirmBox('Sample data will be added on top of the existing data. Continue?')) return;
      DB.loadSample(); toast('Sample data loaded.'); refresh();
    },
    resetDb: function () {
      if (!confirmBox('This erases ALL data. Are you sure?')) return;
      if (!confirmBox('Last warning – everything will be deleted. Continue?')) return;
      DB.reset(); Auth.logout(); location.href = 'index.html';
    }
  };

  $('#me').innerHTML = '<b>' + esc(me.name) + '</b><span class="role-pill">' + me.role + '</span>';
  $('#menuBtn').onclick = function () { $('#sidebar').classList.toggle('open'); };
  $('#pwBtn').onclick = pwForm;
  $('#logoutBtn').onclick = function () { Auth.logout(); location.href = 'index.html'; };
  $('#modal').addEventListener('mousedown', function (e) { if (e.target.id === 'modal') closeModal(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeModal(); });
  go('dashboard');
})();
