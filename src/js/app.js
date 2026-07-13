/* ============================================================
   Medicine Tracker — app.js
   单文件前端应用：localStorage 持久化，原生 JS，无依赖。
   ============================================================ */
(function () {
  'use strict';

  /* ---------- Constants ---------- */
  var STORAGE_KEY = 'medicine-tracker:v2';
  var KIND_MED = 'med';
  var KIND_DEV = 'dev';
  var CATEGORIES = ['口服', '外用', '急救', '中成药', '保健品', '其他'];
  var DEVICE_CATEGORIES = ['体温计', '血压计', '血糖仪', '听诊器', '剪刀镊子', '纱布绷带', '消毒用品', '其他'];
  var CATEGORY_COLORS = {
    '口服':   '#0ea5e9',
    '外用':   '#14b8a6',
    '急救':   '#ef4444',
    '中成药': '#f59e0b',
    '保健品': '#8b5cf6',
    '其他':   '#64748b',
    '体温计': '#f43f5e',
    '血压计': '#3b82f6',
    '血糖仪': '#a855f7',
    '听诊器': '#10b981',
    '剪刀镊子': '#eab308',
    '纱布绷带': '#06b6d4',
    '消毒用品': '#84cc16'
  };
  var STATUS_LABEL = {
    danger:  '已过期',
    warning: '即将过期',
    normal:  '正常'
  };

  /* ---------- Date utilities (TZ-safe) ---------- */
  function today() {
    var d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function parseYMD(s) {
    if (!s || typeof s !== 'string') return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
    if (!m) return null;
    var y = Number(m[1]), mo = Number(m[2]) - 1, da = Number(m[3]);
    var dt = new Date(y, mo, da);
    if (isNaN(dt.getTime())) return null;
    if (dt.getFullYear() !== y || dt.getMonth() !== mo || dt.getDate() !== da) return null;
    return dt;
  }

  function formatYMD(d) {
    if (!d) return '';
    var y = d.getFullYear();
    var mo = String(d.getMonth() + 1).padStart(2, '0');
    var da = String(d.getDate()).padStart(2, '0');
    return y + '-' + mo + '-' + da;
  }

  function addDays(base, days) {
    var d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
    d.setDate(d.getDate() + days);
    return d;
  }

  function daysUntil(expiryDateStr, baseDate) {
    var exp = parseYMD(expiryDateStr);
    if (!exp) return null;
    var base = baseDate || today();
    var ms = exp.getTime() - base.getTime();
    return Math.round(ms / 86400000);
  }

  function computeStatus(expiryDateStr) {
    var left = daysUntil(expiryDateStr);
    if (left === null) return 'normal';
    if (left < 0) return 'danger';
    if (left <= 30) return 'warning';
    return 'normal';
  }

  function inMonthWindow(expiryDateStr) {
    var exp = parseYMD(expiryDateStr);
    if (!exp) return false;
    var t = today();
    var monthEnd = new Date(t.getFullYear(), t.getMonth() + 1, 0);
    return exp.getTime() >= t.getTime() && exp.getTime() <= monthEnd.getTime();
  }

  /* ---------- Storage ---------- */
  function loadMeds() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      var data = JSON.parse(raw);
      if (!Array.isArray(data)) return [];
      return data.filter(isValidMed).map(normalizeMed);
    } catch (err) {
      console.warn('[med-tracker] load failed:', err);
      return [];
    }
  }

  function saveMeds(meds) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(meds));
      return true;
    } catch (err) {
      console.error('[med-tracker] save failed:', err);
      toast('保存失败：浏览器存储不可用');
      return false;
    }
  }

  function isValidItem(m) {
    return m && typeof m === 'object' && typeof m.name === 'string';
  }

  function normalizeItem(m) {
    var kind = m.kind === KIND_DEV ? KIND_DEV : KIND_MED;
    var cat;
    if (kind === KIND_DEV) {
      cat = DEVICE_CATEGORIES.indexOf(m.category) >= 0 ? m.category : '其他';
    } else {
      cat = CATEGORIES.indexOf(m.category) >= 0 ? m.category : '其他';
    }
    return {
      id: typeof m.id === 'string' && m.id ? m.id : genId(),
      kind: kind,
      name: String(m.name || '').trim(),
      category: cat,
      batch: typeof m.batch === 'string' ? m.batch : '',
      purchaseDate: typeof m.purchaseDate === 'string' ? m.purchaseDate : '',
      expiryDate: typeof m.expiryDate === 'string' ? m.expiryDate : '',
      warrantyDate: typeof m.warrantyDate === 'string' ? m.warrantyDate : '',
      quantity: Number.isFinite(+m.quantity) && +m.quantity >= 0 ? Math.floor(+m.quantity) : 1,
      note: typeof m.note === 'string' ? m.note : '',
      createdAt: typeof m.createdAt === 'number' ? m.createdAt : Date.now(),
      updatedAt: Date.now()
    };
  }
  // Back-compat aliases (older code paths used these names)
  var isValidMed = isValidItem;
  var normalizeMed = normalizeItem;

  function genId() {
    return 'med_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  /* ---------- App state ---------- */
  var state = {
    items: [],
    view: 'dashboard',
    search: '',
    filterKind: '',     // '', 'med', 'dev'
    filterCategory: '',
    filterStatus: '',
    sortBy: 'expiry-asc'
  };
  // Back-compat: state.meds reads/writes through state.items
  Object.defineProperty(state, 'meds', {
    get: function () { return state.items; },
    set: function (v) { state.items = v; }
  });

  /* ---------- DOM helpers ---------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function h(tag, attrs, children) {
    var el = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') el.className = attrs[k];
        else if (k === 'dataset') Object.assign(el.dataset, attrs[k]);
        else if (k === 'html') el.innerHTML = attrs[k];
        else el.setAttribute(k, attrs[k]);
      });
    }
    (children || []).forEach(function (c) {
      if (c == null) return;
      el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return el;
  }

  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }

  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.classList.remove('show'); }, 2200);
  }

  /* ---------- Stats & filters ---------- */
  function summarize(items) {
    var total = items.length;
    var medCount = 0, devCount = 0;
    var danger = 0, warning = 0, month = 0;
    items.forEach(function (m) {
      if (m.kind === KIND_DEV) { devCount++; return; }
      medCount++;
      var s = computeStatus(m.expiryDate);
      if (s === 'danger') danger++;
      else if (s === 'warning') warning++;
      if (inMonthWindow(m.expiryDate)) month++;
    });
    return { total: total, medCount: medCount, devCount: devCount, danger: danger, warning: warning, month: month };
  }

  function categoryCounts(items) {
    var map = {};
    CATEGORIES.forEach(function (c) { map[c] = 0; });
    DEVICE_CATEGORIES.forEach(function (c) { map[c] = 0; });
    items.forEach(function (m) {
      map[m.category] = (map[m.category] || 0) + 1;
    });
    return map;
  }

  /* ---------- Render — dashboard ---------- */
  function renderToday() {
    var t = today();
    var wk = ['日', '一', '二', '三', '四', '五', '六'][t.getDay()];
    $('#today-line').textContent = '今天是 ' + formatYMD(t) + '（周' + wk + '）';
  }

  function renderStats() {
    var s = summarize(state.items);
    var totalEl = $('#stat-total');
    var totalLbl = $('#stat-total-label');
    if (totalEl) totalEl.textContent = s.medCount;
    var devEl = $('#stat-dev');
    if (devEl) devEl.textContent = s.devCount;
    var totalFullEl = $('#stat-total-full');
    if (totalFullEl) totalFullEl.textContent = s.total;
    if ($('#stat-warning')) $('#stat-warning').textContent = s.warning;
    if ($('#stat-danger')) $('#stat-danger').textContent = s.danger;
    if ($('#stat-month')) $('#stat-month').textContent = s.month;
  }

  function renderEmpty() {
    var empty = $('#dashboard-empty');
    if (state.items.length === 0) empty.classList.remove('hidden');
    else empty.classList.add('hidden');
  }

  function renderPriorityList() {
    var ul = $('#priority-list');
    clear(ul);
    var focused = state.items
      .filter(function (m) { return m.kind !== KIND_DEV; })
      .map(function (m) { return { m: m, s: computeStatus(m.expiryDate), left: daysUntil(m.expiryDate) }; })
      .filter(function (x) { return x.s === 'danger' || x.s === 'warning'; })
      .sort(function (a, b) { return (a.left || 0) - (b.left || 0); })
      .slice(0, 6);

    if (focused.length === 0) {
      var li = h('li', { class: 'empty muted' }, [document.createTextNode(state.items.length ? '当前没有即将过期或已过期药品 ✨' : '暂无药品')]);
      ul.appendChild(li);
      return;
    }

    focused.forEach(function (x) {
      var m = x.m;
      var li = h('li', null, [
        h('div', null, [
          h('div', { class: 'mini-name' }, [document.createTextNode(m.name)]),
          h('div', { class: 'mini-meta' }, [document.createTextNode(
            (m.category || '') + ' · 剩余 ' + (x.left < 0 ? '已过 ' + (-x.left) : x.left) + ' 天 · 到期 ' + m.expiryDate
          )])
        ]),
        h('span', { class: 'badge badge-' + x.s }, [document.createTextNode(STATUS_LABEL[x.s])])
      ]);
      ul.appendChild(li);
    });
  }

  function renderCategoryChart() {
    var counts = categoryCounts(state.meds);
    var entries = CATEGORIES.map(function (c) { return { name: c, value: counts[c] || 0 }; });
    var total = entries.reduce(function (s, e) { return s + e.value; }, 0);
    var wrap = $('#chart-category');
    var legend = $('#legend-category');
    clear(wrap);
    clear(legend);

    if (total === 0) {
      wrap.appendChild(h('p', { class: 'muted' }, [document.createTextNode('暂无数据')]));
      return;
    }

    var size = 200;
    var cx = size / 2, cy = size / 2;
    var r = 70, ir = 46;
    var svg = '<svg viewBox="0 0 ' + size + ' ' + size + '" role="img" aria-label="分类分布饼图">';
    var acc = 0;
    entries.forEach(function (e) {
      if (e.value === 0) return;
      var frac = e.value / total;
      var a0 = acc * 2 * Math.PI - Math.PI / 2;
      var a1 = (acc + frac) * 2 * Math.PI - Math.PI / 2;
      acc += frac;
      var large = (a1 - a0) > Math.PI ? 1 : 0;
      var x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
      var x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
      var xi0 = cx + ir * Math.cos(a1), yi0 = cy + ir * Math.sin(a1);
      var xi1 = cx + ir * Math.cos(a0), yi1 = cy + ir * Math.sin(a0);
      var d = [
        'M', x0, y0,
        'A', r, r, 0, large, 1, x1, y1,
        'L', xi0, yi0,
        'A', ir, ir, 0, large, 0, xi1, yi1,
        'Z'
      ].join(' ');
      svg += '<path d="' + d + '" fill="' + CATEGORY_COLORS[e.name] + '"><title>' + esc(e.name) + ' · ' + e.value + '</title></path>';
    });

    // center text
    svg += '<text x="' + cx + '" y="' + (cy - 4) + '" text-anchor="middle" font-size="22" font-weight="700" fill="#0f172a">' + total + '</text>';
    svg += '<text x="' + cx + '" y="' + (cy + 16) + '" text-anchor="middle" font-size="11" fill="#64748b">总药品</text>';
    svg += '</svg>';

    wrap.innerHTML = svg;
    entries.forEach(function (e) {
      if (e.value === 0) return;
      legend.appendChild(h('li', null, [
        h('span', { class: 'legend-dot', style: 'background:' + CATEGORY_COLORS[e.name] }),
        document.createTextNode(e.name + ' · ' + e.value)
      ]));
    });
  }

  function renderDashboard() {
    renderToday();
    renderStats();
    renderEmpty();
    renderCategoryChart();
    renderPriorityList();
  }

  /* ---------- Render — list ---------- */
  function getFilteredSorted() {
    var q = state.search.trim().toLowerCase();
    var cat = state.filterCategory;
    var stt = state.filterStatus;
    var kind = state.filterKind;
    var sort = state.sortBy;

    var arr = state.items.filter(function (m) {
      var mk = m.kind === KIND_DEV ? KIND_DEV : KIND_MED;
      if (kind && mk !== kind) return false;
      if (cat && m.category !== cat) return false;
      if (stt) {
        if (m.kind === KIND_DEV) return false; // 器材没有过期状态
        var s = computeStatus(m.expiryDate);
        if (s !== stt) return false;
      }
      if (q) {
        if ((m.name || '').toLowerCase().indexOf(q) === -1 &&
            (m.batch || '').toLowerCase().indexOf(q) === -1 &&
            (m.note || '').toLowerCase().indexOf(q) === -1) return false;
      }
      return true;
    });

    var cmpName = function (a, b) { return (a.name || '').localeCompare(b.name || '', 'zh-Hans-CN'); };
    var cmpDate = function (a, b) {
      var ax = parseYMD(a.expiryDate) || new Date(0);
      var bx = parseYMD(b.expiryDate) || new Date(0);
      return ax.getTime() - bx.getTime();
    };
    var cmpStatus = function (a, b) {
      var sa = computeStatus(a.expiryDate), sb = computeStatus(b.expiryDate);
      var order = { danger: 0, warning: 1, normal: 2 };
      if (order[sa] !== order[sb]) return order[sa] - order[sb];
      return cmpDate(a, b);
    };

    arr.sort(function (a, b) {
      switch (sort) {
        case 'name-asc': return cmpName(a, b);
        case 'name-desc': return -cmpName(a, b);
        case 'expiry-desc': return -cmpDate(a, b);
        case 'category':
          if (a.category !== b.category) return (a.category || '').localeCompare(b.category || '', 'zh-Hans-CN');
          return cmpDate(a, b);
        case 'status':
        case 'expiry-asc':
        default: return sort === 'status' ? cmpStatus(a, b) : cmpDate(a, b);
      }
    });
    return arr;
  }

  function renderList() {
    var host = $('#list-results');
    clear(host);

    var arr = getFilteredSorted();
    var emptyEl = $('#list-results-empty');

    if (state.items.length === 0) {
      host.appendChild(buildEmptyListState());
      return;
    }
    if (arr.length === 0) {
      host.appendChild(h('div', { class: 'empty-state card' }, [
        h('div', { class: 'empty-illo' }, [document.createTextNode('🔍')]),
        h('h2', null, [document.createTextNode('未找到匹配的记录')]),
        h('p', { class: 'muted' }, [document.createTextNode('尝试调整搜索词或筛选条件。')])
      ]));
      return;
    }

    var frag = document.createDocumentFragment();
    arr.forEach(function (m) { frag.appendChild(buildMedCard(m)); });
    host.appendChild(frag);
  }

  function buildEmptyListState() {
    return h('div', { class: 'empty-state card' }, [
      h('div', { class: 'empty-illo' }, [document.createTextNode('💊')]),
      h('h2', null, [document.createTextNode('还没有添加任何记录')]),
      h('p', { class: 'muted' }, [document.createTextNode('点击右上角“新增药品”或先加载示例数据体验功能。')]),
      h('div', { class: 'empty-actions' }, [
        h('button', { type: 'button', class: 'btn btn-primary', onclick: openSampleData }, [document.createTextNode('加载示例数据')]),
        h('button', { type: 'button', class: 'btn btn-ghost', onclick: function () { openForm(); } }, [document.createTextNode('立即新增')])
      ])
    ]);
  }

  function buildMedCard(m) {
    var isDev = m.kind === KIND_DEV;
    var s = isDev ? 'normal' : computeStatus(m.expiryDate);
    var left = isDev ? null : daysUntil(m.expiryDate);
    var card = h('article', { class: 'med-card status-' + s + (isDev ? ' kind-dev' : '') });

    var head = h('div', { class: 'med-head' }, [
      h('div', null, [
        h('div', { class: 'med-name' }, [
          isDev ? h('span', { class: 'kind-ico', title: '器材' }, [document.createTextNode('🩺')]) : null,
          document.createTextNode(m.name)
        ]),
        h('div', { class: 'med-sub' }, [document.createTextNode(m.batch ? '批号：' + m.batch : (isDev ? '常用器材' : '无批号'))])
      ]),
      isDev
        ? h('span', { class: 'badge badge-device' }, [document.createTextNode('器材')])
        : h('span', { class: 'badge badge-' + s }, [document.createTextNode(STATUS_LABEL[s])])
    ]);

    var metaRows = [
      h('div', null, [h('span', { class: 'muted' }, [document.createTextNode('分类：')]), document.createTextNode(m.category)]),
      h('div', null, [h('span', { class: 'muted' }, [document.createTextNode('数量：')]), document.createTextNode(String(m.quantity))]),
      h('div', null, [h('span', { class: 'muted' }, [document.createTextNode('购入日期：')]), document.createTextNode(m.purchaseDate || '—')])
    ];
    if (isDev) {
      metaRows.push(h('div', null, [h('span', { class: 'muted' }, [document.createTextNode('保修期：')]), document.createTextNode(m.warrantyDate || '—')]));
    } else {
      metaRows.push(h('div', null, [h('span', { class: 'muted' }, [document.createTextNode('到期日期：')]), document.createTextNode(m.expiryDate || '—')]));
      metaRows.push(h('div', { style: 'grid-column: 1 / -1' }, [
        h('span', { class: 'muted' }, [document.createTextNode('状态：')]),
        document.createTextNode(
          left === null ? '日期无效'
            : left < 0 ? '已过期 ' + (-left) + ' 天'
            : (left === 0 ? '今天到期' : '剩余 ' + left + ' 天')
        )
      ]));
    }
    if (m.note) {
      metaRows.push(h('div', { style: 'grid-column: 1 / -1' }, [
        h('span', { class: 'muted' }, [document.createTextNode('备注：')]),
        document.createTextNode(m.note)
      ]));
    }
    var meta = h('div', { class: 'med-meta' }, metaRows);

    var footer = h('div', { class: 'med-footer' }, [
      h('span', { class: 'badge badge-cat' }, [document.createTextNode(m.category)]),
      h('div', { class: 'med-actions' }, [
        h('button', {
          type: 'button', class: 'btn btn-icon', title: '编辑', 'aria-label': '编辑',
          onclick: function () { openForm(m.id); }
        }, [document.createTextNode('✏️')]),
        h('button', {
          type: 'button', class: 'btn btn-icon', title: '删除', 'aria-label': '删除',
          onclick: function () { confirmDelete(m.id); }
        }, [document.createTextNode('🗑️')])
      ])
    ]);

    card.appendChild(head);
    card.appendChild(meta);
    card.appendChild(footer);
    return card;
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---------- Modal — form ---------- */
  function openForm(medId, forcedKind) {
    var modal = $('#modal');
    var form = $('#med-form');
    var title = $('#modal-title');
    var err = $('#form-error');
    err.textContent = '';
    form.reset();
    $('#f-id').value = '';
    $('#f-purchase').value = formatYMD(today());
    $('#f-expiry').value = '';
    $('#f-qty').value = 1;

    var kind = KIND_MED;
    var m = null;
    if (medId) {
      m = state.items.find(function (x) { return x.id === medId; });
      if (!m) { toast('未找到该记录'); return; }
      kind = m.kind === KIND_DEV ? KIND_DEV : KIND_MED;
    } else if (forcedKind) {
      kind = forcedKind === KIND_DEV ? KIND_DEV : KIND_MED;
    }

    var kindEl = $('#f-kind');
    if (kindEl) kindEl.value = kind;
    populateFormCategoryOptions(kind);
    updateFormByKind(kind);

    if (m) {
      title.textContent = m.kind === KIND_DEV ? '编辑器材' : '编辑药品';
      $('#f-id').value = m.id;
      $('#f-name').value = m.name;
      $('#f-category').value = m.category;
      $('#f-batch').value = m.batch || '';
      $('#f-purchase').value = m.purchaseDate || '';
      $('#f-expiry').value = m.expiryDate || '';
      if ($('#f-warranty')) $('#f-warranty').value = m.warrantyDate || '';
      $('#f-qty').value = m.quantity;
      $('#f-note').value = m.note || '';
    } else {
      title.textContent = kind === KIND_DEV ? '新增器材' : '新增药品';
    }
    showModal(modal);
    setTimeout(function () { $('#f-name').focus(); }, 50);
  }

  function populateFormCategoryOptions(kind) {
    var sel = $('#f-category');
    if (!sel) return;
    var list = kind === KIND_DEV ? DEVICE_CATEGORIES : CATEGORIES;
    sel.innerHTML = '';
    list.forEach(function (c) {
      var opt = document.createElement('option');
      opt.value = c; opt.textContent = c;
      sel.appendChild(opt);
    });
  }

  function updateFormByKind(kind) {
    var expiryRow = $('#row-expiry');
    var warrantyRow = $('#row-warranty');
    var expiryRequired = $('#req-expiry');
    var quickRow = $('.quick-row');
    if (expiryRow) expiryRow.style.display = kind === KIND_DEV ? 'none' : '';
    if (warrantyRow) warrantyRow.style.display = kind === KIND_DEV ? '' : 'none';
    if (expiryRequired) expiryRequired.style.display = kind === KIND_DEV ? 'none' : '';
    if (quickRow) quickRow.style.display = kind === KIND_DEV ? 'none' : '';
  }

  function handleSubmit(e) {
    e.preventDefault();
    var err = $('#form-error');
    err.textContent = '';

    var kindEl = $('#f-kind');
    var kind = kindEl ? kindEl.value : KIND_MED;
    var name = $('#f-name').value.trim();
    var category = $('#f-category').value;
    var batch = $('#f-batch').value.trim();
    var purchaseDate = $('#f-purchase').value;
    var expiryDate = $('#f-expiry').value;
    var warrantyDate = $('#f-warranty') ? $('#f-warranty').value : '';
    var quantity = parseInt($('#f-qty').value, 10) || 0;
    var note = $('#f-note').value.trim();
    var id = $('#f-id').value;

    if (!name) { err.textContent = '请填写名称'; $('#f-name').focus(); return; }
    if (name.length > 60) { err.textContent = '名称过长（≤60 字）'; return; }
    if (kind === KIND_MED) {
      if (!expiryDate) { err.textContent = '请选择到期日期'; $('#f-expiry').focus(); return; }
      if (!parseYMD(expiryDate)) { err.textContent = '到期日期格式不合法'; return; }
    } else {
      if (expiryDate && !parseYMD(expiryDate)) { err.textContent = '到期日期格式不合法'; return; }
      if (warrantyDate && !parseYMD(warrantyDate)) { err.textContent = '保修期格式不合法'; return; }
    }
    if (purchaseDate && !parseYMD(purchaseDate)) { err.textContent = '购入日期格式不合法'; return; }
    if (quantity < 0) { err.textContent = '数量不能为负数'; return; }

    var med = {
      id: id || genId(),
      kind: kind === KIND_DEV ? KIND_DEV : KIND_MED,
      name: name,
      category: category,
      batch: batch,
      purchaseDate: purchaseDate,
      expiryDate: expiryDate,
      warrantyDate: warrantyDate,
      quantity: quantity,
      note: note,
      createdAt: id ? (state.items.find(function (x) { return x.id === id; }) || {}).createdAt || Date.now() : Date.now(),
      updatedAt: Date.now()
    };

    if (id) {
      var idx = state.items.findIndex(function (x) { return x.id === id; });
      if (idx >= 0) state.items[idx] = med;
      else state.items.push(med);
    } else {
      state.items.push(med);
    }

    if (saveMeds(state.items)) {
      toast(id ? '已更新' : '已添加');
      hideModal($('#modal'));
      renderAll();
      jumpTo('list');
    }
  }

  /* ---------- Quick expiry buttons ---------- */
  function setExpiryOffset(days) {
    var d = addDays(today(), days);
    $('#f-expiry').value = formatYMD(d);
  }

  /* ---------- Confirm modal ---------- */
  function confirmDelete(medId) {
    var m = state.items.find(function (x) { return x.id === medId; });
    if (!m) return;
    var label = m.kind === KIND_DEV ? '器材' : '药品';
    $('#confirm-text').textContent = '确定要删除' + label + ' “' + m.name + '” 吗？此操作不可撤销。';
    var okBtn = $('#confirm-ok');
    var modal = $('#confirm-modal');
    function onOk() {
      okBtn.removeEventListener('click', onOk);
      hideModal(modal);
      state.items = state.items.filter(function (x) { return x.id !== medId; });
      if (saveMeds(state.items)) {
        toast('已删除');
        renderAll();
      }
    }
    okBtn.addEventListener('click', onOk);
    showModal(modal);
  }

  /* ---------- Modal show/hide ---------- */
  function showModal(modal) {
    modal.hidden = false;
    modal.style.display = '';
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }
  function hideModal(modal) {
    modal.hidden = true;
    // Belt-and-suspenders: explicitly force display:none too. The CSS rule
    // ".modal[hidden]{display:none}" already handles this, but setting it
    // directly here means a closed modal can never again block clicks on
    // the rest of the page, even if a future style change reintroduces
    // this problem.
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  /* ---------- Import / export ---------- */
  function exportJSON() {
    var data = {
      schema: 'medicine-tracker.v1',
      exportedAt: new Date().toISOString(),
      medicines: state.meds
    };
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    var ts = formatYMD(today());
    a.href = url;
    a.download = 'medicines-' + ts + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    toast('已导出 ' + state.meds.length + ' 条数据');
  }

  function handleImportFile(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        var txt = String(e.target.result || '');
        var parsed = JSON.parse(txt);
        var arr = null;
        if (Array.isArray(parsed)) arr = parsed;
        else if (parsed && Array.isArray(parsed.medicines)) arr = parsed.medicines;
        else if (parsed && typeof parsed === 'object') arr = parsed.medicines || parsed.items;
        if (!Array.isArray(arr)) { toast('文件格式不识别'); return; }
        var cleaned = arr.filter(isValidItem).map(normalizeItem);

        var merge = confirm(
          '共解析出 ' + cleaned.length + ' 条记录。\n\n' +
          '点击 “确定” → 合并到现有数据（按 ID 去重）\n' +
          '点击 “取消” → 覆盖现有数据'
        );
        if (merge) {
          var existing = {};
          state.items.forEach(function (m) { existing[m.id] = m; });
          var added = 0, updated = 0;
          cleaned.forEach(function (m) {
            if (existing[m.id]) { existing[m.id] = Object.assign({}, existing[m.id], m, { updatedAt: Date.now() }); updated++; }
            else { state.items.push(m); added++; }
          });
          toast('合并完成：新增 ' + added + '，更新 ' + updated);
        } else {
          state.items = cleaned;
          toast('已覆盖：导入 ' + cleaned.length + ' 条');
        }
        if (saveMeds(state.items)) renderAll();
      } catch (err) {
        console.error(err);
        toast('解析失败：' + err.message);
      }
    };
    reader.onerror = function () { toast('读取文件失败'); };
    reader.readAsText(file);
  }

  /* ---------- QR export ---------- */
  // L 级别安全容量上限，留点余量；超过则拆多张
  var QR_MAX_BYTES = 2800;
  var QR_PAGE_PREFIX = 'MT2:'; // 任意前缀，方便扫码端识别

  function buildSharePayload() {
    var s = summarize(state.items);
    return {
      v: 2,
      app: 'medicine-tracker',
      exportedAt: new Date().toISOString(),
      counts: s,
      meds: state.items.map(function (m) {
        var o = {
          k: m.kind === KIND_DEV ? 'd' : 'm', // 缩短字段名
          n: m.name,
          c: m.category,
          q: m.quantity
        };
        if (m.batch) o.b = m.batch;
        if (m.purchaseDate) o.p = m.purchaseDate;
        if (m.expiryDate) o.e = m.expiryDate;
        if (m.warrantyDate) o.w = m.warrantyDate;
        if (m.note) o.x = m.note;
        return o;
      })
    };
  }

  function chunkPayload(compressed) {
    var chunks = [];
    for (var i = 0; i < compressed.length; i += QR_MAX_BYTES) {
      chunks.push(compressed.slice(i, i + QR_MAX_BYTES));
    }
    return chunks;
  }

  function encodePages(pages) {
    var total = pages.length;
    // 拼成 view.html 链接形式，让扫码后直接打开查看页
    var baseDir = location.href.replace(/[^/]*$/, '');
    var viewBase = baseDir + 'view.html';
    return pages.map(function (p, i) {
      var body = QR_PAGE_PREFIX + (i + 1) + '/' + total + ':' + p;
      return viewBase + '#d=' + encodeURIComponent(body);
    });
  }

  function buildQRCodes() {
    if (typeof LZString === 'undefined' || typeof qrcode === 'undefined') {
      throw new Error('二维码库未加载');
    }
    var payload = buildSharePayload();
    var raw = JSON.stringify(payload);
    var compressed = LZString.compressToEncodedURIComponent(raw);
    var pages = chunkPayload(compressed);
    var encoded = encodePages(pages);
    var codes = encoded.map(function (str, i) {
      var q = qrcode(0, 'L');
      q.addData(str);
      q.make();
      return { str: str, qr: q, index: i + 1, total: pages.length };
    });
    return { codes: codes, rawBytes: raw.length, compressedBytes: compressed.length };
  }

  function exportQR() {
    try {
      var result = buildQRCodes();
      var codes = result.codes;
      var n = codes.length;

      // 准备一个弹窗渲染二维码 + 下载按钮
      var modal = $('#qr-modal');
      var body = $('#qr-modal-body');
      var meta = $('#qr-modal-meta');
      clear(body);
      meta.textContent = '压缩后 ' + result.compressedBytes + ' 字节（原 JSON ' + result.rawBytes + ' 字节）';
      if (n > 1) {
        meta.textContent += ' · 拆为 ' + n + ' 张二维码，请按顺序扫描';
      }

      codes.forEach(function (c) {
        var wrap = h('div', { class: 'qr-cell' });
        var svgWrap = h('div', { class: 'qr-svg' });
        svgWrap.innerHTML = c.qr.createSvgTag({ cellSize: 6, margin: 2 });
        var label = h('div', { class: 'qr-label' }, [
          document.createTextNode('第 ' + c.index + ' / ' + c.total + ' 张')
        ]);
        wrap.appendChild(svgWrap);
        wrap.appendChild(label);
        body.appendChild(wrap);
      });

      // 下载按钮：单独下载当前 / 全部 PNG
      var dlAll = h('button', {
        type: 'button',
        class: 'btn btn-primary',
        onclick: function () { downloadAllQRCodes(codes); }
      }, [document.createTextNode('下载全部 PNG')]);

      var dlPdf = h('button', {
        type: 'button',
        class: 'btn btn-ghost',
        onclick: function () { openPrintPage(codes); }
      }, [document.createTextNode('打开可打印页')]);

      var actions = h('div', { class: 'qr-actions' }, [dlAll, dlPdf]);
      body.appendChild(actions);

      showModal(modal);
    } catch (err) {
      console.error(err);
      toast('生成二维码失败：' + err.message);
    }
  }

  function qrToPNG(q, size) {
    size = size || 600;
    var canvas = document.createElement('canvas');
    var n = q.getModuleCount();
    var cell = Math.floor(size / (n + 4));
    var real = cell * (n + 4);
    canvas.width = real; canvas.height = real;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, real, real);
    ctx.fillStyle = '#000';
    var off = cell * 2;
    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) {
        if (q.isDark(r, c)) ctx.fillRect(off + c * cell, off + r * cell, cell, cell);
      }
    }
    return canvas.toDataURL('image/png');
  }

  function downloadAllQRCodes(codes) {
    codes.forEach(function (c, i) {
      var dataUrl = qrToPNG(c.qr, 600);
      var a = document.createElement('a');
      a.href = dataUrl;
      a.download = 'medicine-qr-' + (i + 1) + '-of-' + codes.length + '.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    });
    toast('已下载 ' + codes.length + ' 张二维码 PNG');
  }

  function openPrintPage(codes) {
    // 把所有码 + 数据写入新窗口，用户可用浏览器原生打印为 PDF
    var w = window.open('', '_blank');
    if (!w) { toast('请允许弹窗以打开打印页'); return; }
    var html = '<!doctype html><html><head><meta charset="utf-8"><title>医药箱二维码打印页</title>' +
      '<style>body{font-family:-apple-system,Segoe UI,PingFang SC,sans-serif;padding:24px;background:#fff;color:#111}' +
      'h1{font-size:20px;margin:0 0 8px}' +
      '.sub{color:#666;margin-bottom:24px}' +
      '.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:24px;max-width:760px;margin:0 auto}' +
      '.cell{border:1px dashed #ccc;padding:16px;text-align:center;page-break-inside:avoid}' +
      '.cell img{display:block;width:100%;max-width:280px;margin:0 auto 8px}' +
      '.label{font-weight:700;font-size:14px}' +
      '.meta{font-size:11px;color:#888;margin-top:4px}' +
      '@media print{.no-print{display:none}.cell{border:none}}</style></head><body>' +
      '<h1>医药箱二维码</h1><p class="sub">贴于药箱表面。手机扫码即可只读查看药品与器材清单。打印本页面后可裁剪。</p>' +
      '<div class="grid">';
    codes.forEach(function (c) {
      html += '<div class="cell"><img src="' + qrToPNG(c.qr, 600) + '" alt="QR ' + c.index + '/' + c.total + '"><div class="label">第 ' + c.index + ' / ' + c.total + ' 张</div><div class="meta">使用任一扫一扫即可查看</div></div>';
    });
    html += '</div><p class="sub no-print" style="margin-top:24px;text-align:center"><button onclick="window.print()" style="padding:8px 16px;background:#0ea5e9;color:#fff;border:none;border-radius:6px;cursor:pointer">打印 / 存为 PDF</button></p></body></html>';
    w.document.write(html);
    w.document.close();
  }

  /* ---------- Sample data ---------- */
  function buildSampleItems() {
    var t = today();
    function mkMed(name, category, batch, days, qty, note) {
      return {
        id: genId(),
        kind: KIND_MED,
        name: name,
        category: category,
        batch: batch,
        purchaseDate: formatYMD(addDays(t, days < 0 ? days - 365 : -180)),
        expiryDate: formatYMD(addDays(t, days)),
        quantity: qty,
        note: note || '',
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
    }
    function mkDev(name, category, qty, note, warrantyDays) {
      return {
        id: genId(),
        kind: KIND_DEV,
        name: name,
        category: category,
        batch: '',
        purchaseDate: formatYMD(addDays(t, -200)),
        expiryDate: '',
        warrantyDate: warrantyDays ? formatYMD(addDays(t, warrantyDays)) : '',
        quantity: qty,
        note: note || '',
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
    }
    return [
      mkMed('布洛芬缓释胶囊', '口服', 'BJ2024A12', 25, 1, '成人饭后服用；用于退热镇痛'),
      mkMed('阿莫西林胶囊', '口服', 'AMX2025C03', 10, 2, '青霉素过敏者禁用'),
      mkMed('云南白药气雾剂', '外用', 'YNBY2024K8', 200, 1, '跌打损伤、肌肉酸痛'),
      mkMed('速效救心丸', '急救', 'JXZ2024B11', 12, 3, '急救常备，舌下含服'),
      mkMed('板蓝根颗粒', '中成药', 'BLG2025A01', 365, 4, '清热解毒，凉血利咽'),
      mkMed('维生素 C 片', '保健品', 'VC2024LOT22', -8, 1, '每日 1 片'),
      mkMed('碘伏消毒液', '外用', 'IODO2024Q4', -45, 1, '外用消毒'),
      mkMed('复方甘草片', '口服', 'FGC2024D07', 60, 2, ''),
      mkMed('藿香正气水', '中成药', 'HXZQ2025E09', 540, 3, '解表化湿，理气和中'),
      mkMed('医用纱布卷', '其他', 'GSB2024H02', 900, 5, '急救包常备'),
      mkDev('电子体温计', '体温计', 1, '备用电池 × 2 节', 365),
      mkDev('水银血压计', '血压计', 1, '袖带 + 听诊器套装'),
      mkDev('血糖仪', '血糖仪', 1, '含试纸 50 张、采血针', 730),
      mkDev('医用纱布卷', '纱布绷带', 5, '独立密封'),
      mkDev('医用剪刀', '剪刀镊子', 1, '不锈钢，固定刃'),
      mkDev('碘伏棉签', '消毒用品', 30, '单支独立包装')
    ];
  }

  function openSampleData() {
    if (state.items.length > 0) {
      if (!confirm('当前已有 ' + state.items.length + ' 条数据，是否仍要追加示例数据？')) return;
    }
    var samples = buildSampleItems();
    samples.forEach(function (m) { state.items.push(m); });
    if (saveMeds(state.items)) {
      toast('已加载 ' + samples.length + ' 条示例数据');
      renderAll();
    }
  }

  /* ---------- Navigation ---------- */
  function jumpTo(view) {
    state.view = view;
    $$('.nav-btn').forEach(function (b) {
      b.classList.toggle('active', b.dataset.view === view);
    });
    if (view === 'dashboard') {
      $('#view-dashboard').classList.remove('hidden');
      $('#view-list').classList.add('hidden');
    } else {
      $('#view-dashboard').classList.add('hidden');
      $('#view-list').classList.remove('hidden');
    }
    renderAll();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ---------- Master render ---------- */
  function renderAll() {
    renderDashboard();
    renderList();
  }

  /* ---------- Wire up ---------- */
  function wire() {
    // Year
    var y = new Date().getFullYear();
    var ye = $('#year'); if (ye) ye.textContent = y;

    // Nav
    $$('.nav-btn').forEach(function (b) {
      b.addEventListener('click', function () { jumpTo(b.dataset.view); });
    });
    $$('[data-jump]').forEach(function (a) {
      a.addEventListener('click', function (e) { e.preventDefault(); jumpTo(a.dataset.jump); });
    });

    // Top buttons
    var addBtn = $('#btn-add');
    if (addBtn) addBtn.addEventListener('click', function () { openForm(null); });
    var addDevBtn = $('#btn-add-dev');
    if (addDevBtn) addDevBtn.addEventListener('click', function () { openForm(null, KIND_DEV); });
    var exportBtn = $('#btn-export');
    if (exportBtn) exportBtn.addEventListener('click', exportJSON);
    var qrBtn = $('#btn-qr');
    if (qrBtn) qrBtn.addEventListener('click', exportQR);
    var input = $('#import-input');
    var importLabel = $('#btn-import-label');
    if (importLabel) importLabel.addEventListener('click', function () { input.value = ''; });
    input.addEventListener('change', function (e) {
      var file = e.target.files && e.target.files[0];
      if (file) handleImportFile(file);
    });

    // Sample
    $('#btn-sample').addEventListener('click', openSampleData);
    var btn2 = $('#btn-sample-add');
    if (btn2) btn2.addEventListener('click', function () { openForm(); });

    // Modal close handlers
    $$('.modal [data-close]').forEach(function (el) {
      el.addEventListener('click', function () {
        var m = el.closest('.modal');
        if (m) hideModal(m);
      });
    });
    // 点击 .modal 容器（不是 panel）也能关掉（即遮罩层点击）
    $$('.modal').forEach(function (m) {
      m.addEventListener('click', function (e) {
        if (e.target === m) hideModal(m);
      });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        var mods = $$('.modal').filter(function (m) { return !m.hidden; });
        if (mods.length) hideModal(mods[mods.length - 1]);
      }
      // 兑底：连续按 Ctrl+Shift+R 可强行关闭所有弹窗、重置页面状态
      if (e.ctrlKey && e.shiftKey && e.key === 'R') {
        $$('.modal').forEach(function (m) { m.hidden = true; });
        document.body.style.overflow = '';
        toast('已重置页面状态');
      }
    });

    // Form
    var form = $('#med-form');
    form.addEventListener('submit', handleSubmit);
    $$('.quick-row .chip').forEach(function (b) {
      b.addEventListener('click', function () { setExpiryOffset(parseInt(b.dataset.quick, 10) || 0); });
    });

    var kindSwitch = $('#f-kind');
    if (kindSwitch) {
      kindSwitch.addEventListener('change', function (e) {
        var k = e.target.value === KIND_DEV ? KIND_DEV : KIND_MED;
        populateFormCategoryOptions(k);
        updateFormByKind(k);
      });
    }

    // Toolbar
    var search = $('#search-input');
    if (search) search.addEventListener('input', function (e) { state.search = e.target.value; renderList(); });
    var filterCat = $('#filter-category');
    if (filterCat) filterCat.addEventListener('change', function (e) { onFilterCategoryChange(e.target.value); });
    var filterStatus = $('#filter-status');
    if (filterStatus) filterStatus.addEventListener('change', function (e) { state.filterStatus = e.target.value; renderList(); });
    var sortBy = $('#sort-by');
    if (sortBy) sortBy.addEventListener('change', function (e) { state.sortBy = e.target.value; renderList(); });
    var tabs = $$('.tab-bar .tab');
    if (tabs.length) {
      tabs.forEach(function (t) {
        t.addEventListener('click', function () {
          tabs.forEach(function (x) { x.classList.toggle('active', x === t); });
          state.filterKind = t.dataset.kind || '';
          renderList();
        });
      });
    }
  }

  function populateCategoryFilter() {
    var sel = $('#filter-category');
    if (!sel) return;
    var og = sel.dataset.allOptions === '1';
    if (!og) {
      sel.innerHTML = '';
      var all = document.createElement('option');
      all.value = ''; all.textContent = '全部分类';
      sel.appendChild(all);
      var g1 = document.createElement('optgroup');
      g1.label = '药品';
      CATEGORIES.forEach(function (c) {
        var opt = document.createElement('option');
        opt.value = 'm:' + c; opt.textContent = c;
        g1.appendChild(opt);
      });
      sel.appendChild(g1);
      var g2 = document.createElement('optgroup');
      g2.label = '器材';
      DEVICE_CATEGORIES.forEach(function (c) {
        var opt = document.createElement('option');
        opt.value = 'd:' + c; opt.textContent = c;
        g2.appendChild(opt);
      });
      sel.appendChild(g2);
      sel.dataset.allOptions = '1';
    }
  }

  function onFilterCategoryChange(value) {
    // value 格式: 'm:口服' 或 'd:体温计' 或 ''
    if (!value) {
      state.filterKind = '';
      state.filterCategory = '';
    } else {
      var parts = value.split(':');
      state.filterKind = parts[0];
      state.filterCategory = parts[1] || '';
    }
    renderList();
  }

  /* ---------- Init ---------- */
  function init() {
    state.meds = loadMeds();
    populateCategoryFilter();
    wire();
    renderAll();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
