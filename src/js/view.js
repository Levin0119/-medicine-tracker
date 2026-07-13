/* view.js — read-only medicine viewer (parse scanned QR) */
(function () {
  'use strict';

  var PREFIX = 'MT2:';
  var KIND_MED = 'med';
  var KIND_DEV = 'dev';
  var STATUS_LABEL = { danger: '已过期', warning: '即将过期', normal: '正常' };

  // 拼装中的数据：{ total, current, chunks: [] }
  var assembling = null;

  /* ---------- Date utils ---------- */
  function parseYMD(s) {
    if (typeof s !== 'string') return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
    if (!m) return null;
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    if (isNaN(d.getTime())) return null;
    if (d.getFullYear() !== +m[1] || d.getMonth() !== +m[2] - 1 || d.getDate() !== +m[3]) return null;
    return d;
  }
  function today() {
    var d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  function daysUntil(s) {
    var d = parseYMD(s);
    if (!d) return null;
    var t = today();
    return Math.round((d.getTime() - t.getTime()) / 86400000);
  }
  function statusOf(item) {
    if (item.kind === KIND_DEV) return 'normal';
    var d = parseYMD(item.expiryDate);
    if (!d) return 'normal';
    var left = daysUntil(item.expiryDate);
    if (left < 0) return 'danger';
    if (left <= 30) return 'warning';
    return 'normal';
  }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function formatYMD(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  /* ---------- DOM helpers ---------- */
  function $(s) { return document.querySelector(s); }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }
  function h(tag, attrs, children) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') el.className = attrs[k];
      else el.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) {
      if (c == null) return;
      el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return el;
  }
  function showSection(id) {
    ['loading', 'error', 'multi-progress', 'content'].forEach(function (s) {
      var el = document.getElementById(s);
      if (!el) return;
      el.classList.toggle('hidden', s !== id);
    });
  }

  /* ---------- Decode & render ---------- */
  function parseScanned(str) {
    if (typeof str !== 'string') return { ok: false, msg: '内容为空' };
    if (str.indexOf(PREFIX) !== 0) return { ok: false, msg: '不是医药箱二维码（缺少 ' + PREFIX + ' 前缀）' };

    var rest = str.slice(PREFIX.length);
    var colonAt = rest.indexOf(':');
    if (colonAt < 0) return { ok: false, msg: '格式错误：缺少分页标记' };
    var pageHeader = rest.slice(0, colonAt);
    var body = rest.slice(colonAt + 1);
    var slashAt = pageHeader.indexOf('/');
    if (slashAt < 0) return { ok: false, msg: '分页标记格式错误' };
    var idx = parseInt(pageHeader.slice(0, slashAt), 10);
    var total = parseInt(pageHeader.slice(slashAt + 1), 10);
    if (!idx || !total || idx > total) return { ok: false, msg: '分页号非法' };

    return { ok: true, idx: idx, total: total, body: body };
  }

  function assemble(parsed) {
    if (!assembling || assembling.total !== parsed.total) {
      assembling = { total: parsed.total, chunks: new Array(parsed.total) };
    }
    assembling.chunks[parsed.idx - 1] = parsed.body;

    if (parsed.total === 1) {
      return finalize(assembling.chunks.join(''));
    }

    // 多页：更新进度
    var got = assembling.chunks.filter(function (x) { return !!x; }).length;
    if (got < parsed.total) {
      $('#mp-total').textContent = parsed.total;
      $('#mp-total-2').textContent = parsed.total;
      $('#mp-current').textContent = got;
      $('#mp-fill').style.width = (got / parsed.total * 100) + '%';
      showSection('multi-progress');
      return null;
    }
    return finalize(assembling.chunks.join(''));
  }

  function finalize(joined) {
    try {
      if (typeof LZString === 'undefined') throw '未加载 LZString';
      var raw = LZString.decompressFromEncodedURIComponent(joined);
      if (!raw) throw '解压结果为空（可能编码不匹配或数据被截断）';
      var payload = JSON.parse(raw);
      if (!payload || payload.app !== 'medicine-tracker') throw '应用标识不符';
      return { ok: true, payload: payload };
    } catch (e) {
      return { ok: false, msg: '解压/解析失败：' + (e.message || e) };
    }
  }

  function expandItems(payload) {
    return (payload.meds || []).map(function (m) {
      var kind = m.k === 'd' ? KIND_DEV : KIND_MED;
      return {
        kind: kind,
        name: m.n || '',
        category: m.c || '其他',
        quantity: m.q || 1,
        batch: m.b || '',
        purchaseDate: m.p || '',
        expiryDate: m.e || '',
        warrantyDate: m.w || '',
        note: m.x || ''
      };
    });
  }

  function renderAll(payload) {
    var items = expandItems(payload);
    var meds = items.filter(function (m) { return m.kind === KIND_MED; });
    var devs = items.filter(function (m) { return m.kind === KIND_DEV; });

    var danger = 0, warning = 0;
    meds.forEach(function (m) {
      var s = statusOf(m);
      if (s === 'danger') danger++;
      else if (s === 'warning') warning++;
    });

    $('#stat-total').textContent = meds.length;
    $('#stat-dev').textContent = devs.length;
    $('#stat-warning').textContent = warning;
    $('#stat-danger').textContent = danger;

    var t = today();
    var wk = ['日','一','二','三','四','五','六'][t.getDay()];
    $('#today-line').textContent = '查看时间：' + formatYMD(t) + '（周' + wk + '）';

    // 顶部 alert
    var alertArea = $('#alert-area');
    clear(alertArea);
    var dangerItems = meds.filter(function (m) { return statusOf(m) === 'danger'; });
    var warningItems = meds.filter(function (m) { return statusOf(m) === 'warning'; });
    if (dangerItems.length) {
      alertArea.appendChild(buildAlert('danger', '⛔ ' + dangerItems.length + ' 个药品已过期', dangerItems));
    }
    if (warningItems.length) {
      alertArea.appendChild(buildAlert('warn', '⚠️ ' + warningItems.length + ' 个药品将在 30 天内过期', warningItems));
    }
    if (!dangerItems.length && !warningItems.length) {
      alertArea.appendChild(h('div', { class: 'alert-banner', style: 'background:linear-gradient(135deg,#f0fdf4,#dcfce7);border-color:#bbf7d0' }, [
        h('div', { class: 'alert-icon' }, [document.createTextNode('✨')]),
        h('div', { class: 'alert-text' }, [
          h('strong', null, [document.createTextNode('全部药品状态良好')]),
          document.createTextNode('没有发现过期或即将过期的药品。')
        ])
      ]));
    }

    // tabs 渲染
    var activeTab = 'focus';
    function rerender(tab) {
      activeTab = tab;
      $$('.tab').forEach(function (t) { t.classList.toggle('active', t.dataset.tab === tab); });
      var host = $('#tab-content');
      clear(host);
      if (tab === 'focus') host.appendChild(buildFocusList(meds));
      else if (tab === 'meds') host.appendChild(buildFullList(meds));
      else if (tab === 'devs') host.appendChild(buildFullList(devs));
      else host.appendChild(buildFullList(items));
    }
    $$('.tab').forEach(function (t) {
      t.addEventListener('click', function () { rerender(t.dataset.tab); });
    });
    rerender(activeTab);
  }

  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }

  function buildAlert(kind, title, items) {
    var banner = h('div', { class: 'alert-banner ' + (kind === 'danger' ? '' : 'warn') });
    var list = h('ul', { class: 'alert-list' });
    items.slice(0, 5).forEach(function (m) {
      var left = daysUntil(m.expiryDate);
      var txt = m.name + '（' + m.category + '）— ' + (left < 0 ? '已过期 ' + (-left) + ' 天' : '剩 ' + left + ' 天') + '（到期 ' + m.expiryDate + '）';
      list.appendChild(h('li', null, [document.createTextNode(txt)]));
    });
    if (items.length > 5) {
      list.appendChild(h('li', null, [document.createTextNode('…还有 ' + (items.length - 5) + ' 个')]));
    }
    banner.appendChild(h('div', { class: 'alert-icon' }, [document.createTextNode(kind === 'danger' ? '⛔' : '⚠️')]));
    banner.appendChild(h('div', { class: 'alert-text' }, [
      h('strong', null, [document.createTextNode(title)]),
      list
    ]));
    return banner;
  }

  function buildCard(item) {
    var s = statusOf(item);
    var card = h('div', { class: 'view-card ' + (item.kind === KIND_DEV ? 'device' : s) });
    var head = h('div', { class: 'vc-head' }, [
      h('div', { class: 'vc-name' }, [
        item.kind === KIND_DEV ? h('span', null, [document.createTextNode('🩺 ')]) : null,
        document.createTextNode(item.name)
      ]),
      item.kind === KIND_DEV
        ? h('span', { class: 'badge badge-device' }, [document.createTextNode('器材')])
        : h('span', { class: 'badge badge-' + s }, [document.createTextNode(STATUS_LABEL[s])])
    ]);
    var metaRows = [
      h('div', null, [document.createTextNode('分类：' + item.category)]),
      h('div', null, [document.createTextNode('数量：' + item.quantity)])
    ];
    if (item.batch) metaRows.push(h('div', null, [document.createTextNode('批号：' + item.batch)]));
    if (item.purchaseDate) metaRows.push(h('div', null, [document.createTextNode('购入：' + item.purchaseDate)]));
    if (item.kind === KIND_DEV) {
      if (item.warrantyDate) metaRows.push(h('div', null, [document.createTextNode('保修期：' + item.warrantyDate)]));
    } else if (item.expiryDate) {
      var left = daysUntil(item.expiryDate);
      metaRows.push(h('div', null, [document.createTextNode('到期：' + item.expiryDate)]));
      metaRows.push(h('div', null, [document.createTextNode('状态：' + (left === null ? '日期无效' : left < 0 ? '已过期 ' + (-left) + ' 天' : (left === 0 ? '今天到期' : '剩 ' + left + ' 天')))]));
    }
    var meta = h('div', { class: 'vc-meta' }, metaRows);
    card.appendChild(head);
    card.appendChild(meta);
    if (item.note) card.appendChild(h('div', { class: 'vc-note' }, [document.createTextNode('📝 ' + item.note)]));
    return card;
  }

  function buildFocusList(meds) {
    var focus = meds
      .map(function (m) { return { m: m, left: daysUntil(m.expiryDate) }; })
      .filter(function (x) { return x.left !== null && x.left <= 30; })
      .sort(function (a, b) { return a.left - b.left; });
    if (!focus.length) {
      return h('div', { class: 'loading-state' }, [
        h('div', { class: 'loading-illo' }, [document.createTextNode('✨')]),
        h('h2', null, [document.createTextNode('没有需要关注的药品')]),
        h('p', { class: 'muted' }, [document.createTextNode('所有药品状态良好')])
      ]);
    }
    var wrap = h('div', null);
    focus.forEach(function (x) { wrap.appendChild(buildCard(x.m)); });
    return wrap;
  }

  function buildFullList(items) {
    if (!items.length) {
      return h('div', { class: 'loading-state' }, [
        h('div', { class: 'loading-illo' }, [document.createTextNode('📭')]),
        h('h2', null, [document.createTextNode('暂无数据')])
      ]);
    }
    var sorted = items.slice().sort(function (a, b) {
      var sa = statusOf(a), sb = statusOf(b);
      var order = { danger: 0, warning: 1, normal: 2 };
      if (a.kind === KIND_DEV) sa = 3;
      if (b.kind === KIND_DEV) sb = 3;
      if (sa !== sb) return order[sa] - order[sb];
      var la = a.expiryDate || '9999';
      var lb = b.expiryDate || '9999';
      return la.localeCompare(lb);
    });
    var wrap = h('div', null);
    sorted.forEach(function (m) { wrap.appendChild(buildCard(m)); });
    return wrap;
  }

  function handleScanString(str) {
    var parsed = parseScanned(str);
    if (!parsed.ok) {
      $('#error-msg').textContent = parsed.msg;
      showSection('error');
      return;
    }
    var result = assemble(parsed);
    if (!result) return; // 等待更多页
    if (!result.ok) {
      $('#error-msg').textContent = result.msg;
      showSection('error');
      return;
    }
    assembling = null;
    showSection('content');
    renderAll(result.payload);
  }

  /* ---------- Boot: try URL hash data ---------- */
  function boot() {
    // 1) 尝试从 URL hash 直接读取数据
    var hash = window.location.hash || '';
    if (hash.indexOf('#d=') === 0) {
      var str = decodeURIComponent(hash.slice(3));
      handleScanString(str);
      return;
    }
    // 2) 没数据 → 显示等待扫描态
    showSection('loading');
  }

  // 暴露一个全局函数给外部扫码 SDK 调用
  window.MT2HandleScan = handleScanString;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();