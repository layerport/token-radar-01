// Token Radar's dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and
// renders the ranked board, a filterable table, a per-protocol detail drawer with the model's
// own inputs and the protocol's farm plan. No network: every byte it shows is in data.js.
//
// The model in one function: the page recomputes a row from the snapshot figures and checks the
// number board.json carries, so the page's code and the board's data are visibly the same
// arithmetic. The farm plan is the same derivation main.ts writes to board.json: category,
// chains, TVL and age decide the action, the capital, the hold and every cost and time. No name
// is special-cased.
(function () {
  'use strict';

  var RADAR = window.RADAR;
  if (!RADAR) return;
  var root = document.getElementById('board');
  var view = { q: '', category: 'all', chain: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null };

  var moneyFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function money(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return moneyFmt.format(n);
  }
  function pct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function ageLabel(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }

  // The model, as lib/model.ts scores it: TVL times a base multiple, a growth multiplier from
  // the seven-day change, a maturity multiplier from the age with no token (it rises for three
  // years, then eases back), and a chain multiplier for the chains the protocol runs on.
  function recompute(row, model) {
    var growth = Math.min(model.growth.cap, Math.max(model.growth.floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * model.growth.weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknownAgeDays : row.age_days;
    var maturity;
    if (age <= model.maturity.days) {
      maturity = model.maturity.floor + (Math.min(Math.max(age, 0), model.maturity.days) / model.maturity.days) * model.maturity.range;
    } else {
      maturity = 1 - model.maturity.decay * Math.min((age - model.maturity.days) / model.maturity.days, 1);
    }
    var chains = row.chains ? row.chains.length : 0;
    var chainMult = 1 + Math.min(Math.max(chains - 1, 0), model.chain.cap) * model.chain.bonus;
    return Math.max(1, Math.round(row.tvl_usd * model.baseMultiple * growthMult * maturity * chainMult));
  }

  // Build one element: h('div', {class: 'x', text: 'y'}, child, [more children]).
  function h(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan, as lib/model.ts writes it to board.json. The same derivation, the same strings.
  function homeChain(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function stakeSize(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function gasNote(chain) {
    if (chain === 'Ethereum') return 'about $8 of gas';
    var cheap = ['Solana', 'Sui', 'Aptos', 'Stellar', 'Ripple', 'Algorand', 'Tron', 'BNB Chain', 'Binance'];
    if (cheap.indexOf(chain) >= 0) return 'under $1 of gas';
    var l2 = ['Base', 'Arbitrum', 'Optimism', 'Polygon', 'zkSync Era', 'Unichain', 'Ink', 'Blast', 'Linea', 'Scroll', 'Mantle', 'Mode', 'Fraxtal', 'Berachain', 'Sonic', 'Katana', 'Monad', 'Hyperliquid L1', 'Plume Mainnet', 'Morph', 'Stable', 'Tempo', 'Arc', 'Corn', 'BOB', 'World Chain', 'Manta'];
    if (l2.indexOf(chain) >= 0) return 'about $2 of gas';
    return 'about $3 of gas';
  }
  function holdFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function mainAction(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('risk curat') >= 0 || c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('cedefi') >= 0) return 'Deposit $' + capital + ' of USDC into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0 || c === 'farm') return 'Provide $' + capital + " of liquidity to " + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('bridge') >= 0 || c.indexOf('cross chain') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('basis trading') >= 0 || c.indexOf('options') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('stable') >= 0 || c.indexOf('dual-token') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return 'Mint $' + capital + " of the protocol's yield asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    if (c.indexOf('payment') >= 0 || c.indexOf('card') >= 0) return 'Spend $' + capital + ' through ' + name + ' on ' + chain + ' and keep the receipt.';
    if (c === 'chain') return 'Bridge $' + capital + ' of USDC to ' + chain + " through its official bridge and use it in an app on the chain.";
    if (c.indexOf('anchor') >= 0 || c.indexOf('btc') >= 0) return 'Deposit $' + capital + ' of BTC into ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('index') >= 0) return 'Buy $' + capital + ' of the ' + name + ' index on ' + chain + ' and hold it.';
    if (c.indexOf('governance') >= 0) return 'Deposit $' + capital + ' into ' + name + ' on ' + chain + ' and vote once with the position.';
    if (c.indexOf('otc') >= 0) return 'Trade $' + capital + ' through ' + name + ' on ' + chain + ' and keep the receipt.';
    if (c.indexOf('privacy') >= 0) return 'Make one private transaction of $' + capital + ' through ' + name + ' on ' + chain + '.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function renderStep(step) {
    var s = step.action + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function planSteps(p) {
    var chain = homeChain(p);
    var capital = stakeSize(p);
    var hold = holdFor(p.age_days);
    var gas = gasNote(chain);
    var action = mainAction(p, capital, chain);
    return [
      { action: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { action: action, cost: '$' + capital + ' of capital and ' + gas, time: '15 minutes to set up' },
      { action: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', cost: 'about $2 of gas a week on ' + chain, time: '10 minutes a week' },
      { action: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { action: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { action: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' }
    ];
  }
  function farmPlan(p) { return planSteps(p).map(renderStep); }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) view.q = params.get('q');
    if (params.get('category')) view.category = params.get('category');
    if (params.get('chain')) view.chain = params.get('chain');
    if (params.get('tab')) view.tab = params.get('tab');
    if (params.get('p')) view.selected = params.get('p');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (view.q) params.set('q', view.q);
    if (view.category !== 'all') params.set('category', view.category);
    if (view.chain !== 'all') params.set('chain', view.chain);
    if (view.tab !== 'pre-token') params.set('tab', view.tab);
    if (view.selected) params.set('p', view.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function visibleRows() {
    var q = view.q.trim().toLowerCase();
    return RADAR.rows.filter(function (r) {
      if (view.category !== 'all' && r.category !== view.category) return false;
      if (view.chain !== 'all' && !(r.chains || []).some(function (c) { return c === view.chain; })) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortValue(r, key) {
    if (key === 'name') return r.name.toLowerCase();
    if (key === 'tvl') return r.tvl_usd;
    if (key === 'growth') return r.change_7d === null ? -Infinity : r.change_7d;
    if (key === 'age') return r.age_days === null ? Infinity : r.age_days;
    return r.implied_value_usd;
  }
  function orderedRows(list) {
    var key = view.sort;
    return list.slice().sort(function (a, b) {
      var av = sortValue(a, key);
      var bv = sortValue(b, key);
      if (av < bv) return -view.dir;
      if (av > bv) return view.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function masthead() {
    return h('header', { class: 'masthead' },
      h('div', { class: 'logo' }, h('span', { class: 'dot' }), h('span', { class: 'wordmark', text: 'Token Radar' })),
      h('div', { class: 'meta' },
        h('span', { text: 'Snapshot ' + RADAR.as_of }),
        h('span', { text: 'DefiLlama protocol index' }),
        h('span', { text: RADAR.model_version + ' model' })
      )
    );
  }

  function intro() {
    return h('section', { class: 'intro' },
      h('div', null,
        h('h1', { text: RADAR.watchlist_size + ' watchlist protocols, ranked by implied value' }),
        h('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(RADAR.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds ' + RADAR.early_size + ' more pre-token protocols below that floor — the whole pre-token universe the snapshot can vouch for. Implied value is a model, not a promise.' })
      ),
      h('div', { class: 'stats' },
        h('div', { class: 'stat' }, h('span', { text: 'Watchlist covered' }), h('b', { text: RADAR.watchlist_size + ' / ' + RADAR.watchlist_size })),
        h('div', { class: 'stat' }, h('span', { text: 'Pre-token rows scored' }), h('b', { text: String(RADAR.board_size) })),
        h('div', { class: 'stat' }, h('span', { text: 'Early rows below the floor' }), h('b', { text: String(RADAR.early_size) })),
        h('div', { class: 'stat' }, h('span', { text: 'Live-token protocols set aside' }), h('b', { text: String(RADAR.live_size) }))
      )
    );
  }

  function topFive() {
    return h('section', { class: 'top5', 'aria-label': 'Top five by implied value' },
      RADAR.rows.slice(0, 5).map(function (r) {
        return h('button', { type: 'button', class: 'pick', onclick: function () { openDetail(r.slug); } },
          h('span', { class: 'place', text: 'RANK ' + r.rank }),
          h('b', { text: r.name }),
          h('span', { class: 'worth', text: money(r.implied_value_usd) }),
          h('span', { class: 'small', text: (r.category || 'Other') + ' · TVL ' + money(r.tvl_usd) })
        );
      })
    );
  }

  function filterBar() {
    var categories = Array.from(new Set(RADAR.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(RADAR.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = h('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: view.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { view.q = search.value; writeHash(); render(); });
    var catSelect = h('select', { id: 'category', 'aria-label': 'Filter by category' },
      h('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return h('option', { value: c, text: c, selected: c === view.category ? 'selected' : null }); })
    );
    catSelect.addEventListener('change', function () { view.category = catSelect.value; writeHash(); render(); });
    var chainSelect = h('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      h('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return h('option', { value: c, text: c, selected: c === view.chain ? 'selected' : null }); })
    );
    chainSelect.addEventListener('change', function () { view.chain = chainSelect.value; writeHash(); render(); });
    var pre = h('button', { type: 'button', 'aria-pressed': view.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { view.tab = 'pre-token'; render(); } });
    var live = h('button', { type: 'button', 'aria-pressed': view.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { view.tab = 'live'; render(); } });
    return h('div', { class: 'filters' },
      h('div', { class: 'ctl' }, h('label', { for: 'q', text: 'Search' }), search),
      h('div', { class: 'ctl' }, h('label', { for: 'category', text: 'Category' }), catSelect),
      h('div', { class: 'ctl' }, h('label', { for: 'chain', text: 'Chain' }), chainSelect),
      h('div', { class: 'ctl' }, h('span', { class: 'small', text: 'Token status' }), h('div', { class: 'seg' }, pre, live)),
      h('span', { class: 'shown', text: view.tab === 'pre-token' ? visibleRows().length + ' rows shown' : RADAR.live.length + ' live-token protocols' })
    );
  }

  function sortBtn(key, label) {
    return h('th', { scope: 'col' },
      h('button', { type: 'button', onclick: function () { if (view.sort === key) view.dir = -view.dir; else { view.sort = key; view.dir = -1; } render(); } },
        label,
        view.sort === key ? h('span', { 'aria-hidden': 'true', text: view.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function rowEl(r, maxImplied) {
    var growth = r.change_7d === null ? 'n/a' : pct(r.change_7d);
    var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'up' : 'down';
    return h('tr', {
      'data-selected': view.selected === r.slug ? 'true' : 'false',
      class: r.rank <= 3 ? 'top3' : null,
      tabindex: '0',
      onclick: function () { openDetail(r.slug); },
      onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
    },
      h('td', { class: 'n', text: String(r.rank) }),
      h('td', null, h('div', { class: 'pname' },
        h('b', { text: r.name }),
        h('span', { class: 'small', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
      )),
      h('td', { class: 'n', text: money(r.tvl_usd) }),
      h('td', { class: 'n ' + growthClass, text: growth }),
      h('td', { class: 'n', text: ageLabel(r.age_days) }),
      h('td', null, h('div', { class: 'value' },
        h('div', { class: 'meter', 'aria-hidden': 'true' }, h('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / maxImplied) * 100)) + '%' })),
        h('span', { class: 'n', text: money(r.implied_value_usd) })
      )),
      h('td', null, h('span', { class: 'tag', text: 'no token' }))
    );
  }

  function boardCard() {
    var list = orderedRows(visibleRows());
    if (list.length === 0) {
      return h('div', { class: 'card' }, h('div', { class: 'none' },
        h('h2', { text: 'No protocol matches that filter' }),
        h('p', { text: 'Clear the search or pick another category to see the board again.' }),
        h('button', { class: 'btn primary', type: 'button', text: 'Clear filters', onclick: function () { view.q = ''; view.category = 'all'; view.chain = 'all'; writeHash(); render(); } })
      ));
    }
    var maxImplied = RADAR.rows.length > 0 ? RADAR.rows[0].implied_value_usd : 1;
    var tbody = h('tbody');
    list.forEach(function (r) { tbody.appendChild(rowEl(r, maxImplied)); });
    return h('div', { class: 'card' },
      h('div', { class: 'scroll' },
        h('table', null,
          h('caption', { class: 'small', text: 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.' }),
          h('thead', null, h('tr', null,
            sortBtn('implied', 'Rank'),
            sortBtn('name', 'Protocol'),
            sortBtn('tvl', 'TVL'),
            sortBtn('growth', '7d'),
            sortBtn('age', 'Age'),
            sortBtn('implied', 'Implied value'),
            h('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function liveCard() {
    var tbody = h('tbody');
    RADAR.live.forEach(function (r) {
      tbody.appendChild(h('tr', null,
        h('td', { class: 'n', text: 'live' }),
        h('td', null, h('div', { class: 'pname' }, h('b', { text: r.name }), h('span', { class: 'small', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        h('td', { class: 'n', text: money(r.tvl_usd) }),
        h('td', { class: 'n ' + (r.change_7d !== null && r.change_7d >= 0 ? 'up' : 'down'), text: pct(r.change_7d) }),
        h('td', { class: 'n', text: money(r.mcap_usd) }),
        h('td', null, h('span', { class: 'tag live', text: 'already trades' }))
      ));
    });
    return h('div', { class: 'card' },
      h('div', { class: 'scroll' },
        h('table', null,
          h('caption', { class: 'small', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking.' }),
          h('thead', null, h('tr', null, h('th', { scope: 'col', text: 'Status' }), h('th', { scope: 'col', text: 'Protocol' }), h('th', { scope: 'col', text: 'TVL' }), h('th', { scope: 'col', text: '7d' }), h('th', { scope: 'col', text: 'Market cap' }), h('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function howPanel() {
    var m = RADAR.model;
    var top = RADAR.rows[0];
    return h('section', { class: 'card how' },
      h('h2', { text: 'How implied value is computed' }),
      h('p', { class: 'small', text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked.' }),
      h('div', { class: 'eq' },
        'implied = round( tvl_usd x ' + m.baseMultiple + ' x (1 + clamp(change_7d, ' + m.growth.floor + ', ' + m.growth.cap + ') / 100 x ' + m.growth.weight + ') x maturity(age_days) x (1 + ' + m.chain.bonus + ' x min(chains - 1, ' + m.chain.cap + ')) )'
      ),
      h('p', { class: 'small', text: 'Maturity rises from ' + m.maturity.floor + ' to 1.0 over the first ' + (m.maturity.days / 365) + ' years with no token, then eases back by ' + m.maturity.decay + ' over the next three: a protocol that has run for years with no token is less likely to launch one than one in its sweet spot. Age is the time since the protocol was first listed; an unlisted age uses ' + m.unknownAgeDays + ' days. ' + (top ? 'Worked example: ' + top.name + ' at rank 1, ' + money(top.tvl_usd) + ' of TVL, ' + pct(top.change_7d) + ' over seven days, ' + ageLabel(top.age_days) + ' old, on ' + (top.chains ? top.chains.length : 1) + ' chain' + ((top.chains && top.chains.length !== 1) ? 's' : '') + ', scores ' + money(top.implied_value_usd) + '.' : '') }),
      h('p', { class: 'caveat', text: 'Say it as the record says it: a protocol on this board records no token. That is not proof it has none — a token may exist that the record does not carry — and the implied value is this entry\u2019s own claim, never a price or a prediction that a token will be issued.' })
    );
  }

  function colophon() {
    return h('footer', { class: 'colophon' },
      h('span', { text: 'Source: ' + RADAR.source }),
      h('span', { text: 'The board is generated from that one sealed snapshot; nothing here is fetched live, and no figure leaves the snapshot.' })
    );
  }

  var drawer = h('dialog', { class: 'drawer', id: 'detail', 'aria-labelledby': 'detail-title' });
  drawer.addEventListener('close', function () { view.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = RADAR.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    view.selected = slug;
    writeHash();
    drawer.textContent = '';
    var steps = farmPlan(row);
    drawer.appendChild(h('div', { class: 'drawer-head' },
      h('div', null,
        h('span', { class: 'wordmark', text: 'Rank ' + row.rank + ' of ' + RADAR.board_size }),
        h('h2', { id: 'detail-title', text: row.name }),
        h('p', { class: 'small', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      h('button', { class: 'x', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { drawer.close(); } })
    ));
    drawer.appendChild(h('section', { class: 'drawer-sec' },
      h('h3', { text: 'Implied value' }),
      h('div', { class: 'breakdown' },
        h('div', null, h('span', { text: 'TVL' }), h('b', { class: 'n', text: money(row.tvl_usd) })),
        h('div', null, h('span', { text: 'Seven-day growth' }), h('b', { class: 'n', text: pct(row.change_7d) })),
        h('div', null, h('span', { text: 'Age with no token' }), h('b', { class: 'n', text: ageLabel(row.age_days) })),
        h('div', null, h('span', { text: 'Chains' }), h('b', { class: 'n', text: String(row.chains ? row.chains.length : 0) })),
        h('div', null, h('span', { text: 'Growth multiplier' }), h('b', { class: 'n', text: String(row.growth_multiplier) })),
        h('div', null, h('span', { text: 'Maturity multiplier' }), h('b', { class: 'n', text: String(row.maturity_multiplier) })),
        h('div', null, h('span', { text: 'Chain multiplier' }), h('b', { class: 'n', text: String(row.chain_multiplier) })),
        h('div', null, h('span', { text: 'Implied value' }), h('b', { class: 'n', text: money(row.implied_value_usd) }))
      ),
      h('p', { class: 'small', text: 'Model ' + RADAR.model_version + ': the same function scores every protocol. The page recomputes this row as ' + money(recompute(row, RADAR.model)) + (recompute(row, RADAR.model) === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price.' })
    ));
    drawer.appendChild(h('section', { class: 'drawer-sec' },
      h('h3', { text: 'Farm plan' }),
      h('ol', { class: 'plan' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return h('li', null, h('b', { text: action }), h('span', { class: 'fine', text: tail }));
      }))
    ));
    if (typeof drawer.showModal === 'function') {
      if (!drawer.open) drawer.showModal();
    } else {
      drawer.setAttribute('open', '');
    }
  }

  function render() {
    root.textContent = '';
    var shell = h('div', { class: 'wrap' });
    shell.appendChild(masthead());
    shell.appendChild(intro());
    if (view.tab === 'pre-token') shell.appendChild(topFive());
    shell.appendChild(filterBar());
    shell.appendChild(view.tab === 'pre-token' ? boardCard() : liveCard());
    if (view.tab === 'pre-token') shell.appendChild(howPanel());
    shell.appendChild(colophon());
    root.appendChild(shell);
    root.setAttribute('aria-busy', 'false');
    if (!drawer.isConnected) root.appendChild(drawer);
    if (view.selected) openDetail(view.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && drawer.open) drawer.close();
  });
})();
