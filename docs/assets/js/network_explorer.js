// ─── GML Parser ───────────────────────────────────────────────────────────────

function tokenizeGML(text) {
  const tokens = [];
  let i = 0;
  while (i < text.length) {
    if (/\s/.test(text[i])) { i++; continue; }
    if (text[i] === '#') { while (i < text.length && text[i] !== '\n') i++; continue; }
    if (text[i] === '[') { tokens.push({ type: '[' }); i++; continue; }
    if (text[i] === ']') { tokens.push({ type: ']' }); i++; continue; }
    if (text[i] === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') { if (text[j] === '\\') j++; j++; }
      tokens.push({ type: 'str', value: text.slice(i + 1, j) });
      i = j + 1; continue;
    }
    if (text[i] === '-' || /\d/.test(text[i])) {
      let j = i;
      if (text[j] === '-') j++;
      while (j < text.length && /\d/.test(text[j])) j++;
      if (text[j] === '.') { j++; while (j < text.length && /\d/.test(text[j])) j++; }
      if (/[eE]/.test(text[j])) { j++; if (/[+\-]/.test(text[j])) j++; while (/\d/.test(text[j])) j++; }
      const num = parseFloat(text.slice(i, j));
      if (!isNaN(num)) { tokens.push({ type: 'num', value: num }); i = j; continue; }
    }
    if (/[a-zA-Z_]/.test(text[i])) {
      let j = i;
      while (j < text.length && /[a-zA-Z0-9_]/.test(text[j])) j++;
      tokens.push({ type: 'word', value: text.slice(i, j) });
      i = j; continue;
    }
    i++;
  }
  return tokens;
}

function parseGML(text) {
  text = text.replace(/\bComment\s+"[^"]*"/g, '');
  const tokens = tokenizeGML(text);
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];

  function parseValue() {
    const t = peek();
    if (!t) return null;
    if (t.type === '[') return parseBlock();
    if (t.type === 'num' || t.type === 'str' || t.type === 'word') return next().value;
    return null;
  }
  function parseBlock() {
    next(); // [
    const obj = {};
    while (pos < tokens.length && peek()?.type !== ']') {
      if (peek()?.type !== 'word') { next(); continue; }
      const key = next().value;
      const val = parseValue();
      if (key in obj) {
        if (!Array.isArray(obj[key])) obj[key] = [obj[key]];
        obj[key].push(val);
      } else { obj[key] = val; }
    }
    if (pos < tokens.length) next(); // ]
    return obj;
  }

  while (pos < tokens.length) {
    const t = peek();
    if (t.type === 'word' && t.value === 'graph') { next(); return buildGraph(parseBlock()); }
    next();
  }
  throw new Error('No "graph" block found in GML file.');
}

function buildGraph(raw) {
  const directed = raw.directed === 1 || raw.directed === '1';
  let rn = raw.node || []; if (!Array.isArray(rn)) rn = [rn];
  let re = raw.edge || []; if (!Array.isArray(re)) re = [re];

  const nodes = rn.map((n, fi) => {
    const nd = { id: n.id ?? fi, label: n.label != null ? String(n.label) : String(n.id ?? fi) };
    if (n.x != null) nd.x0 = Number(n.x);
    if (n.y != null) nd.y0 = Number(n.y);
    if (n.color != null) nd.color = String(n.color);
    if (n.group != null) nd.group = Number(n.group);
    if (n.value != null) nd.value = Number(n.value);
    return nd;
  });

  const ids = new Set(nodes.map(n => n.id));
  const edges = re
    .filter(e => ids.has(e.source) && ids.has(e.target))
    .map(e => ({ source: e.source, target: e.target, weight: e.weight != null ? Number(e.weight) : 1 }));

  return { directed, nodes, edges, layout: raw.layout ? String(raw.layout) : undefined };
}

// ─── Color utilities ──────────────────────────────────────────────────────────

const PALETTE = [
  '#4e79a7','#f28e2b','#e15759','#76b7b2','#59a14f',
  '#edc948','#b07aa1','#ff9da7','#9c755f','#bab0ac',
];

function buildGroupColorMap(nodes) {
  const groups = [...new Set(nodes.filter(n => n.group != null).map(n => n.group))].sort((a, b) => a - b);
  const map = new Map();
  groups.forEach((g, i) => map.set(g, PALETTE[i % PALETTE.length]));
  return map;
}

function nodeColor(d, gcm) {
  if (d.color) return d.color;
  if (d.group != null && gcm.has(d.group)) return gcm.get(d.group);
  return '#5b8dd9';
}

// ─── Network Viewer ───────────────────────────────────────────────────────────

const W = 700, H = 460;

class NetworkViewer {
  constructor(options) {
    this.graph = options.graph;
    this.layout = options.layout || this.graph.layout || 'force';
    this.pinnedNode = null;
    this.gcm = buildGroupColorMap(this.graph.nodes);
    this._uid = Math.random().toString(36).slice(2, 7);

    this._computeDegrees();
    this._tagParallel();
    this._buildAdj();
    this._cloneForSim();
    this._assignPositions();
    this._initSVG();
    this._buildSim();
    this._render();
  }

  // ── Graph analysis ──────────────────────────────────────────────────────────

  _computeDegrees() {
    const deg = new Map(), ind = new Map(), outd = new Map();
    this.graph.nodes.forEach(n => { deg.set(n.id, 0); ind.set(n.id, 0); outd.set(n.id, 0); });
    this.graph.edges.forEach(e => {
      const w = e.weight || 1;
      if (this.graph.directed) {
        outd.set(e.source, (outd.get(e.source) || 0) + w);
        ind.set(e.target, (ind.get(e.target) || 0) + w);
      }
      deg.set(e.source, (deg.get(e.source) || 0) + 1);
      deg.set(e.target, (deg.get(e.target) || 0) + 1);
    });
    this.graph.nodes.forEach(n => {
      n.degree = deg.get(n.id) || 0;
      n.indegree = ind.get(n.id) || 0;
      n.outdegree = outd.get(n.id) || 0;
    });
  }

  _tagParallel() {
    const cnt = new Map(), idx = new Map();
    this.graph.edges.forEach(e => {
      const k = this.graph.directed ? `${e.source}>${e.target}` : [e.source, e.target].sort().join('-');
      cnt.set(k, (cnt.get(k) || 0) + 1);
    });
    this.graph.edges.forEach(e => {
      const k = this.graph.directed ? `${e.source}>${e.target}` : [e.source, e.target].sort().join('-');
      e._pTotal = cnt.get(k); e._pIdx = idx.get(k) || 0; idx.set(k, (idx.get(k) || 0) + 1);
    });
  }

  _buildAdj() {
    this.adj = new Map();
    this.graph.nodes.forEach(n => this.adj.set(n.id, new Set()));
    this.graph.edges.forEach(e => {
      this.adj.get(e.source)?.add(e.target);
      if (!this.graph.directed) this.adj.get(e.target)?.add(e.source);
    });
  }

  _cloneForSim() {
    this.sNodes = this.graph.nodes.map(n => ({ ...n }));
    this.nodeById = new Map(this.sNodes.map(n => [n.id, n]));
    this.sEdges = this.graph.edges.map(e => ({ ...e }));
  }

  // ── Layout-specific position assignment ─────────────────────────────────────

  _assignPositions() {
    const nodes = this.sNodes;
    const pad = 60;

    if (this.layout === 'bipartite') {
      let g0 = nodes.filter(n => n.group === 0);
      let g1 = nodes.filter(n => n.group === 1);
      // If untagged, split evenly
      if (g0.length === 0 && g1.length === 0) {
        const half = Math.ceil(nodes.length / 2);
        nodes.forEach((n, i) => { n.group = i < half ? 0 : 1; });
        g0 = nodes.filter(n => n.group === 0);
        g1 = nodes.filter(n => n.group === 1);
      }
      // Push unassigned nodes into the smaller side
      nodes.filter(n => n.group == null).forEach(n => {
        n.group = g0.length <= g1.length ? 0 : 1;
        (n.group === 0 ? g0 : g1).push(n);
      });
      g0.forEach((n, i) => { n.x0 = W * 0.25; n.y0 = pad + ((H - 2 * pad) / (g0.length + 1)) * (i + 1); });
      g1.forEach((n, i) => { n.x0 = W * 0.75; n.y0 = pad + ((H - 2 * pad) / (g1.length + 1)) * (i + 1); });
      this.gcm = buildGroupColorMap(nodes);
    }

    if (this.layout === 'hierarchy') {
      const sorted = [...nodes].sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
      sorted.forEach((n, i) => {
        n.y0 = pad + ((H - 2 * pad) / (sorted.length + 1)) * (i + 1);
        if (n.x0 == null) n.x0 = W / 2 + (Math.random() - 0.5) * 80;
      });
    }

    // Set initial sim x,y from x0/y0
    if (this.layout === 'anchored') {
      const withPos = nodes.filter(n => n.x0 != null && n.y0 != null);
      if (withPos.length > 0) {
        // Normalize GML-space positions into canvas space
        const xs = withPos.map(n => n.x0), ys = withPos.map(n => n.y0);
        const xMin = Math.min(...xs), xMax = Math.max(...xs);
        const yMin = Math.min(...ys), yMax = Math.max(...ys);
        const xR = xMax - xMin || 1, yR = yMax - yMin || 1;
        nodes.forEach(n => {
          if (n.x0 != null) n.x = pad + ((n.x0 - xMin) / xR) * (W - 2 * pad);
          if (n.y0 != null) n.y = pad + ((n.y0 - yMin) / yR) * (H - 2 * pad);
        });
        // Store normalized values as home positions for restore forces
        nodes.forEach(n => { if (n.x != null) { n.x0 = n.x; n.y0 = n.y; } });
      }
    } else {
      // bipartite / hierarchy: positions already in canvas space
      nodes.forEach(n => { if (n.x0 != null) n.x = n.x0; if (n.y0 != null) n.y = n.y0; });
    }
  }

  // ── SVG setup ───────────────────────────────────────────────────────────────

  _initSVG() {
    const svg = d3.select('#ne-svg').attr('viewBox', `0 0 ${W} ${H}`).attr('height', H);
    this._svg = svg;
    svg.selectAll('*').remove();
    svg.on('.zoom', null).on('click.unpin', null);

    this._zoom = d3.zoom().scaleExtent([0.08, 12]).on('zoom', ev => {
      this._zl.attr('transform', ev.transform);
    });
    svg.call(this._zoom);
    svg.on('click.unpin', ev => { if (ev.target === svg.node()) this._unpin(); });

    const g = svg.append('g');
    this._zl = g;

    // Background catch
    g.append('rect').attr('width', W).attr('height', H).attr('fill', 'transparent')
      .on('click', () => this._unpin());

    // Bipartite separator line
    if (this.layout === 'bipartite') {
      g.append('line')
        .attr('x1', W / 2).attr('y1', 14).attr('x2', W / 2).attr('y2', H - 14)
        .attr('stroke', '#d0d7de').attr('stroke-width', 1).attr('stroke-dasharray', '5,4')
        .attr('pointer-events', 'none');
    }

    // Arrowhead markers
    if (this.graph.directed) {
      const defs = svg.append('defs');
      const mk = (id, fill) => defs.append('marker').attr('id', id)
        .attr('markerWidth', 8).attr('markerHeight', 6)
        .attr('refX', 8).attr('refY', 3).attr('orient', 'auto')
        .append('polygon').attr('points', '0 0, 8 3, 0 6').attr('fill', fill);
      mk(`a-${this._uid}`, '#999');
      mk(`ao-${this._uid}`, '#c0392b');
      mk(`ai-${this._uid}`, '#b5860d');
    }

    this._eLayer = g.append('g');
    this._nLayer = g.append('g');
  }

  // ── Force simulation ─────────────────────────────────────────────────────────

  _buildSim() {
    this.sim = d3.forceSimulation(this.sNodes)
      .force('link', d3.forceLink(this.sEdges).id(d => d.id)
        .distance(this.layout === 'bipartite' ? 90 : 65)
        .strength(this.layout === 'bipartite' ? 0.3 : 0.4))
      .force('charge', d3.forceManyBody().strength(
        this.layout === 'bipartite' ? -55 : this.layout === 'hierarchy' ? -85 : -140))
      .force('center', this.layout === 'force' ? d3.forceCenter(W / 2, H / 2) : null)
      .force('collide', d3.forceCollide().radius(d => this._r(d) + 4))
      .alphaDecay(0.026)
      .on('tick', () => this._tick());

    if (this.layout === 'anchored') {
      this.sim
        .force('rx', d3.forceX(d => d.x0 ?? W / 2).strength(d => d.x0 != null ? 0.22 : 0.02))
        .force('ry', d3.forceY(d => d.y0 ?? H / 2).strength(d => d.y0 != null ? 0.22 : 0.02));
    }
    if (this.layout === 'bipartite') {
      this.sim
        .force('rx', d3.forceX(d => d.x0 ?? W / 2).strength(0.82))
        .force('ry', d3.forceY(d => d.y0 ?? H / 2).strength(0.30));
    }
    if (this.layout === 'hierarchy') {
      this.sim
        .force('rx', d3.forceX(d => d.x0 ?? W / 2).strength(0.07))
        .force('ry', d3.forceY(d => d.y0 ?? H / 2).strength(0.88));
    }
  }

  // ── Rendering ───────────────────────────────────────────────────────────────

  _render() {
    // Edges
    this._eSel = this._eLayer.selectAll('path')
      .data(this.sEdges).join('path')
      .attr('stroke', '#bbb').attr('stroke-opacity', 0.75)
      .attr('stroke-width', d => Math.max(1, Math.min(6, d.weight || 1)))
      .attr('fill', 'none')
      .attr('marker-end', this.graph.directed ? `url(#a-${this._uid})` : null);

    // Nodes
    this._nSel = this._nLayer.selectAll('g')
      .data(this.sNodes).join('g')
      .call(this._drag())
      .on('mouseover', (_, d) => { if (!this.pinnedNode) this._hi(d); })
      .on('mouseout',  ()     => { if (!this.pinnedNode) this._lo(); })
      .on('click', (ev, d) => { ev.stopPropagation(); this.pinnedNode === d ? this._unpin() : this._pin(d); });

    this._nSel.append('circle')
      .attr('r', d => this._r(d))
      .attr('fill', d => nodeColor(d, this.gcm))
      .attr('stroke', '#fff').attr('stroke-width', 1.5);

    this._nSel.append('text')
      .text(d => d.label)
      .attr('text-anchor', 'middle')
      .attr('dy', d => this._r(d) + 12)
      .attr('font-size', '10px')
      .attr('font-family', "'JetBrains Mono','Courier New',monospace")
      .attr('fill', '#666').attr('pointer-events', 'none');
  }

  _r(d) {
    const mx = Math.max(1, ...this.graph.nodes.map(n => n.degree));
    return Math.max(6, Math.min(20, 6 + (d.degree / mx) * 13));
  }

  // ── Drag ────────────────────────────────────────────────────────────────────

  _drag() {
    return d3.drag()
      .on('start', (ev, d) => {
        if (!ev.active) this.sim.alphaTarget(0.3).restart();
        d.fx = d.x; d.fy = d.y;
      })
      .on('drag', (ev, d) => { d.fx = ev.x; d.fy = ev.y; })
      .on('end', (ev, d) => {
        if (!ev.active) this.sim.alphaTarget(0);
        if (d !== this.pinnedNode) {
          d.fx = null; d.fy = null;
          if (this.layout !== 'force') this.sim.alpha(0.35).restart();
        }
      });
  }

  // ── Tick ────────────────────────────────────────────────────────────────────

  _tick() {
    this._eSel.attr('d', e => {
      const s = e.source, t = e.target;
      if (!s || !t || s.x == null) return '';
      const dx = t.x - s.x, dy = t.y - s.y, dist = Math.sqrt(dx * dx + dy * dy) || 1;
      let sx = s.x, sy = s.y, tx = t.x, ty = t.y;
      if (this.graph.directed) {
        const sr = this._r(s), tr = this._r(t) + 9;
        sx = s.x + (dx / dist) * sr; sy = s.y + (dy / dist) * sr;
        tx = t.x - (dx / dist) * tr; ty = t.y - (dy / dist) * tr;
      }
      if (e._pTotal > 1) {
        const off = 28 * (e._pIdx - (e._pTotal - 1) / 2);
        const mx = (sx + tx) / 2 - (dy / dist) * off;
        const my = (sy + ty) / 2 + (dx / dist) * off;
        return `M${sx},${sy} Q${mx},${my} ${tx},${ty}`;
      }
      return `M${sx},${sy} L${tx},${ty}`;
    });
    this._nSel.attr('transform', d => `translate(${d.x ?? 0},${d.y ?? 0})`);
  }

  // ── Highlight ────────────────────────────────────────────────────────────────

  _nid(x) { return typeof x === 'object' ? x.id : x; }

  _hi(d) {
    const nb = this.adj.get(d.id) || new Set();
    this._nSel.selectAll('circle').transition().duration(150)
      .attr('r', n => n === d ? this._r(n) * 1.22 : this._r(n))
      .attr('stroke-width', n => n === d ? 3 : 1.5)
      .attr('opacity', n => (n === d || nb.has(n.id)) ? 1 : 0.12);
    this._nSel.selectAll('text').transition().duration(150)
      .attr('opacity', n => (n === d || nb.has(n.id)) ? 1 : 0.12);
    this._eSel.transition().duration(150)
      .attr('stroke', e => {
        const sid = this._nid(e.source), tid = this._nid(e.target);
        if (sid === d.id) return this.graph.directed ? '#c0392b' : '#333';
        if (tid === d.id) return this.graph.directed ? '#b5860d' : '#333';
        return '#bbb';
      })
      .attr('stroke-opacity', e => {
        const sid = this._nid(e.source), tid = this._nid(e.target);
        return (sid === d.id || tid === d.id) ? 1 : 0.07;
      })
      .attr('stroke-width', e => {
        const sid = this._nid(e.source), tid = this._nid(e.target);
        const b = Math.max(1, Math.min(6, e.weight || 1));
        return (sid === d.id || tid === d.id) ? b * 1.8 : b;
      })
      .attr('marker-end', e => {
        if (!this.graph.directed) return null;
        const sid = this._nid(e.source), tid = this._nid(e.target);
        if (sid === d.id) return `url(#ao-${this._uid})`;
        if (tid === d.id) return `url(#ai-${this._uid})`;
        return `url(#a-${this._uid})`;
      });
    this._setPanel(d);
  }

  _lo() {
    this._nSel.selectAll('circle').transition().duration(150)
      .attr('r', n => this._r(n)).attr('stroke-width', 1.5).attr('opacity', 1);
    this._nSel.selectAll('text').transition().duration(150).attr('opacity', 1);
    this._eSel.transition().duration(150)
      .attr('stroke', '#bbb').attr('stroke-opacity', 0.75)
      .attr('stroke-width', e => Math.max(1, Math.min(6, e.weight || 1)))
      .attr('marker-end', this.graph.directed ? `url(#a-${this._uid})` : null);
    this._clearPanel();
  }

  _pin(d)  { this.pinnedNode = d; d.fx = d.x; d.fy = d.y; this._hi(d); }
  _unpin() {
    if (this.pinnedNode) {
      const d = this.pinnedNode; d.fx = null; d.fy = null; this.pinnedNode = null;
      if (this.layout !== 'force') this.sim.alpha(0.3).restart();
    }
    this._lo();
  }

  // ── Info panel ───────────────────────────────────────────────────────────────

  _setPanel(d) {
    const nb = [...(this.adj.get(d.id) || [])];
    const names = nb.map(id => this.graph.nodes.find(n => n.id === id)?.label ?? id);
    const deg = this.graph.directed
      ? `out: ${d.outdegree} &nbsp;·&nbsp; in: ${d.indegree}`
      : `degree: ${d.degree}`;
    document.getElementById('ne-info-panel').innerHTML =
      `<span class="nip-label">${d.label}</span>` +
      `<span class="nip-deg">${deg}</span>` +
      (names.length ? `<span class="nip-nb">neighbors: ${names.join(', ')}</span>` : '');
  }
  _clearPanel() {
    document.getElementById('ne-info-panel').innerHTML =
      '<span class="nip-hint">Hover or click a node for details</span>';
  }

  // ── Matrix ───────────────────────────────────────────────────────────────────

  renderMatrix(container) {
    const { nodes, edges, directed } = this.graph;
    if (nodes.length > 60) {
      container.innerHTML = '<p style="padding:16px;color:#666;font-size:13px">Matrix view only available for graphs with ≤ 60 nodes.</p>';
      return;
    }
    const n = nodes.length;
    const idxOf = new Map(nodes.map((nd, i) => [nd.id, i]));
    const mat = Array.from({ length: n }, () => new Array(n).fill(0));
    edges.forEach(e => {
      const si = idxOf.get(this._nid(e.source));
      const ti = idxOf.get(this._nid(e.target));
      if (si != null && ti != null) {
        mat[si][ti] += e.weight || 1;
        if (!directed) mat[ti][si] += e.weight || 1;
      }
    });
    const tr = l => l.length > 7 ? l.slice(0, 6) + '…' : l;
    const labels = nodes.map(nd => nd.label);
    let html = '<table class="ne-matrix"><thead><tr><th></th>';
    labels.forEach(l => html += `<th title="${l}">${tr(l)}</th>`);
    html += '</tr></thead><tbody>';
    mat.forEach((row, i) => {
      html += `<tr><th title="${labels[i]}">${tr(labels[i])}</th>`;
      row.forEach(v => html += v ? `<td class="nz">${v}</td>` : '<td></td>');
      html += '</tr>';
    });
    html += '</tbody></table>';
    container.innerHTML = html;
  }

  destroy() { if (this.sim) this.sim.stop(); }
}

// ─── Example networks ─────────────────────────────────────────────────────────

const EXAMPLES = {

  karate: {
    label: 'Karate Club',
    sublabel: 'force · 34 nodes · 2 communities',
    layout: 'force',
    graph: {
      directed: false,
      nodes: [
        {id:1,label:'1',group:0},{id:2,label:'2',group:0},{id:3,label:'3',group:0},
        {id:4,label:'4',group:0},{id:5,label:'5',group:0},{id:6,label:'6',group:0},
        {id:7,label:'7',group:0},{id:8,label:'8',group:0},{id:9,label:'9',group:1},
        {id:10,label:'10',group:1},{id:11,label:'11',group:0},{id:12,label:'12',group:0},
        {id:13,label:'13',group:0},{id:14,label:'14',group:0},{id:15,label:'15',group:1},
        {id:16,label:'16',group:1},{id:17,label:'17',group:0},{id:18,label:'18',group:0},
        {id:19,label:'19',group:1},{id:20,label:'20',group:0},{id:21,label:'21',group:1},
        {id:22,label:'22',group:0},{id:23,label:'23',group:1},{id:24,label:'24',group:1},
        {id:25,label:'25',group:1},{id:26,label:'26',group:1},{id:27,label:'27',group:1},
        {id:28,label:'28',group:1},{id:29,label:'29',group:1},{id:30,label:'30',group:1},
        {id:31,label:'31',group:1},{id:32,label:'32',group:1},{id:33,label:'33',group:1},
        {id:34,label:'34',group:1},
      ],
      edges: [
        {source:1,target:2},{source:1,target:3},{source:1,target:4},{source:1,target:5},
        {source:1,target:6},{source:1,target:7},{source:1,target:8},{source:1,target:9},
        {source:1,target:11},{source:1,target:12},{source:1,target:13},{source:1,target:14},
        {source:1,target:18},{source:1,target:20},{source:1,target:22},{source:1,target:32},
        {source:2,target:3},{source:2,target:4},{source:2,target:8},{source:2,target:14},
        {source:2,target:18},{source:2,target:20},{source:2,target:22},{source:2,target:31},
        {source:3,target:4},{source:3,target:8},{source:3,target:9},{source:3,target:10},
        {source:3,target:14},{source:3,target:28},{source:3,target:29},{source:3,target:33},
        {source:4,target:8},{source:4,target:13},{source:4,target:14},
        {source:5,target:7},{source:5,target:11},{source:6,target:7},{source:6,target:11},
        {source:6,target:17},{source:7,target:17},
        {source:9,target:31},{source:9,target:33},{source:9,target:34},{source:10,target:34},
        {source:14,target:34},{source:15,target:33},{source:15,target:34},
        {source:16,target:33},{source:16,target:34},{source:19,target:33},{source:19,target:34},
        {source:20,target:34},{source:21,target:33},{source:21,target:34},
        {source:23,target:33},{source:23,target:34},
        {source:24,target:26},{source:24,target:28},{source:24,target:30},
        {source:24,target:33},{source:24,target:34},
        {source:25,target:26},{source:25,target:28},{source:25,target:32},
        {source:26,target:32},{source:27,target:30},{source:27,target:34},
        {source:28,target:34},{source:29,target:32},{source:29,target:34},
        {source:30,target:33},{source:30,target:34},{source:31,target:33},{source:31,target:34},
        {source:32,target:33},{source:32,target:34},{source:33,target:34},
      ],
    },
  },

  florentine: {
    label: 'Florentine Families',
    sublabel: 'anchored · 15 nodes · marriage alliances',
    layout: 'anchored',
    graph: {
      directed: false,
      nodes: [
        {id:0, label:'Medici',       group:0, x0:350, y0:230},
        {id:1, label:'Albizzi',      group:1, x0:180, y0:110},
        {id:2, label:'Acciaiuoli',   group:0, x0:160, y0:310},
        {id:3, label:'Barbadori',    group:0, x0:265, y0:375},
        {id:4, label:'Castellani',   group:1, x0:430, y0:400},
        {id:5, label:'Peruzzi',      group:1, x0:545, y0:345},
        {id:6, label:'Bischeri',     group:1, x0:555, y0:200},
        {id:7, label:'Strozzi',      group:1, x0:490, y0:105},
        {id:8, label:'Guadagni',     group:1, x0:330, y0:75},
        {id:9, label:'Lamberteschi', group:1, x0:210, y0:60},
        {id:10,label:'Ginori',       group:1, x0:100, y0:175},
        {id:11,label:'Salviati',     group:0, x0:155, y0:395},
        {id:12,label:'Pazzi',        group:1, x0:72,  y0:435},
        {id:13,label:'Ridolfi',      group:0, x0:395, y0:305},
        {id:14,label:'Tornabuoni',   group:0, x0:305, y0:175},
      ],
      edges: [
        {source:0,target:1},{source:0,target:2},{source:0,target:3},
        {source:0,target:11},{source:0,target:13},{source:0,target:14},
        {source:1,target:8},{source:1,target:10},
        {source:3,target:4},
        {source:4,target:5},{source:4,target:7},
        {source:5,target:6},{source:5,target:7},
        {source:6,target:7},{source:6,target:8},
        {source:8,target:9},{source:8,target:14},
        {source:11,target:12},
        {source:13,target:7},{source:13,target:14},
      ],
    },
  },

  pollinator: {
    label: 'Plant–Pollinator',
    sublabel: 'bipartite · 22 nodes',
    layout: 'bipartite',
    graph: {
      directed: false,
      nodes: [
        {id:'p1',label:'Oil-flower A',group:0},{id:'p2',label:'Oil-flower B',group:0},
        {id:'p3',label:'Oil-flower C',group:0},{id:'p4',label:'Oil-flower D',group:0},
        {id:'p5',label:'Oil-flower E',group:0},{id:'p6',label:'Oil-flower F',group:0},
        {id:'p7',label:'Oil-flower G',group:0},{id:'p8',label:'Oil-flower H',group:0},
        {id:'p9',label:'Oil-flower I',group:0},
        {id:'q1', label:'Centris analis',     group:1},
        {id:'q2', label:'C. flavifrons',      group:1},
        {id:'q3', label:'Epicharis rustica',  group:1},
        {id:'q4', label:'Centris tarsata',    group:1},
        {id:'q5', label:'Tetrapedia sp.',     group:1},
        {id:'q6', label:'Monoeca xanthopyga', group:1},
        {id:'q7', label:'C. leprieuri',       group:1},
        {id:'q8', label:'Epicharis bicolor',  group:1},
        {id:'q9', label:'Paratetrapedia sp.', group:1},
        {id:'q10',label:'Centris nitida',     group:1},
        {id:'q11',label:'Centris aenea',      group:1},
        {id:'q12',label:'Trigona spinipes',   group:1},
        {id:'q13',label:'Epicharis picta',    group:1},
      ],
      edges: [
        {source:'p1',target:'q1'},{source:'p1',target:'q2'},{source:'p1',target:'q4'},
        {source:'p2',target:'q1'},{source:'p2',target:'q2'},{source:'p2',target:'q3'},
        {source:'p2',target:'q5'},{source:'p2',target:'q6'},
        {source:'p3',target:'q2'},{source:'p3',target:'q3'},{source:'p3',target:'q4'},{source:'p3',target:'q7'},
        {source:'p4',target:'q1'},{source:'p4',target:'q3'},{source:'p4',target:'q6'},{source:'p4',target:'q8'},
        {source:'p5',target:'q2'},{source:'p5',target:'q5'},{source:'p5',target:'q9'},
        {source:'p6',target:'q1'},{source:'p6',target:'q4'},{source:'p6',target:'q6'},{source:'p6',target:'q10'},
        {source:'p7',target:'q7'},{source:'p7',target:'q10'},{source:'p7',target:'q11'},
        {source:'p8',target:'q8'},{source:'p8',target:'q12'},
        {source:'p9',target:'q9'},{source:'p9',target:'q13'},
        {source:'p1',target:'q9'},
      ],
    },
  },

  chickens: {
    label: 'Chicken Pecking Order',
    sublabel: 'hierarchy · 11 nodes · directed',
    layout: 'hierarchy',
    graph: {
      directed: true,
      nodes: [
        {id:1, label:'Hen 1',  value:11},
        {id:2, label:'Hen 2',  value:10},
        {id:3, label:'Hen 3',  value:9},
        {id:4, label:'Hen 4',  value:8},
        {id:5, label:'Hen 5',  value:7},
        {id:6, label:'Hen 6',  value:6},
        {id:7, label:'Hen 7',  value:5},
        {id:8, label:'Hen 8',  value:4},
        {id:9, label:'Hen 9',  value:3},
        {id:10,label:'Hen 10', value:2},
        {id:11,label:'Hen 11', value:1},
      ],
      edges: [
        // Expected hierarchy (high → low)
        {source:1,target:3},{source:1,target:4},{source:1,target:5},
        {source:1,target:6},{source:1,target:8},{source:1,target:11},
        {source:2,target:4},{source:2,target:5},{source:2,target:6},
        {source:2,target:7},{source:2,target:9},{source:2,target:11},
        {source:3,target:5},{source:3,target:6},{source:3,target:7},
        {source:3,target:10},{source:3,target:11},
        {source:4,target:6},{source:4,target:7},{source:4,target:8},{source:4,target:11},
        {source:5,target:7},{source:5,target:8},{source:5,target:9},
        {source:6,target:8},{source:6,target:9},{source:6,target:11},
        {source:7,target:9},{source:7,target:10},{source:7,target:11},
        {source:8,target:10},{source:8,target:11},
        {source:9,target:11},{source:10,target:11},
        // Upsets
        {source:2,target:1},{source:3,target:2},{source:5,target:4},{source:9,target:8},
      ],
    },
  },

  orangutan: {
    label: 'Orangutan Dominance',
    sublabel: 'anchored · directed · weighted',
    layout: 'anchored',
    graph: {
      directed: true,
      nodes: [
        {id:'A', label:'Orange',  color:'#e67e22', x0:200, y0:200},
        {id:'B', label:'Magenta', color:'#e91e8c', x0:350, y0:100},
        {id:'C', label:'Red',     color:'#e74c3c', x0:510, y0:155},
        {id:'D', label:'Blue',    color:'#3498db', x0:170, y0:345},
        {id:'E', label:'Navy',    color:'#2c3e8c', x0:375, y0:385},
        {id:'F', label:'Green',   color:'#27ae60', x0:530, y0:310},
      ],
      edges: [
        // Magenta dominant (k_out = 9)
        {source:'B',target:'A',weight:2},
        {source:'B',target:'C',weight:2},
        {source:'B',target:'D',weight:2},
        {source:'B',target:'E',weight:2},
        {source:'B',target:'F',weight:1},
        // Orange (k_out = 4)
        {source:'A',target:'C',weight:1},
        {source:'A',target:'D',weight:1},
        {source:'A',target:'E',weight:1},
        {source:'A',target:'F',weight:1},
        // Lower ranks
        {source:'D',target:'E',weight:1},
        {source:'D',target:'F',weight:1},
        {source:'E',target:'F',weight:1},
      ],
    },
  },

  les_mis: {
    label: 'Les Misérables',
    sublabel: 'force · 58 nodes · weighted',
    layout: 'force',
    graph: {
      directed: false,
      nodes: [
        {id:0, label:'Myriel',       group:0}, {id:1, label:'Napoleon',    group:0},
        {id:2, label:'Baptistine',   group:0}, {id:3, label:'Magloire',    group:0},
        {id:4, label:'Geborand',     group:0}, {id:5, label:'Champtercier',group:0},
        {id:6, label:'Cravatte',     group:0}, {id:7, label:'Count',       group:0},
        {id:8, label:'OldMan',       group:0}, {id:9, label:'Valjean',     group:1},
        {id:10,label:'Marguerite',   group:1}, {id:11,label:'Isabeau',     group:1},
        {id:12,label:'Gervais',      group:1}, {id:13,label:'Javert',      group:1},
        {id:14,label:'Fantine',      group:2}, {id:15,label:'Tholomyes',   group:2},
        {id:16,label:'Listolier',    group:2}, {id:17,label:'Fameuil',     group:2},
        {id:18,label:'Blacheville',  group:2}, {id:19,label:'Favourite',   group:2},
        {id:20,label:'Dahlia',       group:2}, {id:21,label:'Zephine',     group:2},
        {id:22,label:'Bamatabois',   group:1}, {id:23,label:'Perpetue',    group:2},
        {id:24,label:'Simplice',     group:2}, {id:25,label:'Judge',       group:1},
        {id:26,label:'Champmathieu', group:1}, {id:27,label:'Brevet',      group:1},
        {id:28,label:'Chenildieu',   group:1}, {id:29,label:'Cochepaille', group:1},
        {id:30,label:'Pontmercy',    group:4}, {id:31,label:'Cosette',     group:3},
        {id:32,label:'Thenardier',   group:3}, {id:33,label:'MmeThen.',    group:3},
        {id:34,label:'Eponine',      group:3}, {id:35,label:'Anzelma',     group:3},
        {id:36,label:'Gavroche',     group:3}, {id:37,label:'Mabeuf',      group:4},
        {id:38,label:'Enjolras',     group:5}, {id:39,label:'Combeferre',  group:5},
        {id:40,label:'Prouvaire',    group:5}, {id:41,label:'Feuilly',     group:5},
        {id:42,label:'Courfeyrac',   group:5}, {id:43,label:'Bahorel',     group:5},
        {id:44,label:'Bossuet',      group:5}, {id:45,label:'Joly',        group:5},
        {id:46,label:'Grantaire',    group:5}, {id:47,label:'Marius',      group:4},
        {id:48,label:'Gillenormand', group:4}, {id:49,label:'MlleGillen.', group:4},
        {id:50,label:'Fauchelevent', group:0}, {id:51,label:'Toussaint',   group:1},
        {id:52,label:'Gueulemer',    group:3}, {id:53,label:'Babet',       group:3},
        {id:54,label:'Claquesous',   group:3}, {id:55,label:'Montparnasse',group:3},
        {id:56,label:'Brujon',       group:3}, {id:57,label:'MmeHucheloup',group:5},
      ],
      edges: [
        {source:1,target:0},{source:2,target:0,weight:8},{source:3,target:0,weight:10},
        {source:3,target:2,weight:6},{source:4,target:0},{source:5,target:0},
        {source:6,target:0},{source:7,target:0,weight:2},{source:8,target:0},
        {source:9,target:3,weight:3},{source:9,target:2,weight:3},{source:9,target:0,weight:5},
        {source:9,target:13,weight:1},{source:9,target:14,weight:3},{source:9,target:31,weight:1},
        {source:9,target:32,weight:1},{source:9,target:33,weight:1},{source:9,target:22,weight:1},
        {source:9,target:36,weight:1},{source:9,target:51,weight:1},
        {source:10,target:9},{source:11,target:9},{source:12,target:9},
        {source:15,target:14,weight:3},{source:16,target:14,weight:3},{source:16,target:15,weight:4},
        {source:17,target:14,weight:3},{source:17,target:15,weight:4},{source:17,target:16,weight:4},
        {source:18,target:14,weight:3},{source:18,target:15,weight:4},{source:18,target:16,weight:4},
        {source:18,target:17,weight:4},{source:19,target:14,weight:3},{source:19,target:15,weight:3},
        {source:19,target:16,weight:3},{source:19,target:17,weight:3},{source:19,target:18,weight:3},
        {source:20,target:14,weight:3},{source:20,target:15,weight:3},{source:20,target:16,weight:3},
        {source:20,target:17,weight:3},{source:20,target:18,weight:3},{source:20,target:19,weight:3},
        {source:21,target:14,weight:3},{source:21,target:15,weight:3},{source:21,target:16,weight:3},
        {source:21,target:17,weight:3},{source:21,target:18,weight:3},{source:21,target:19,weight:3},
        {source:21,target:20,weight:3},{source:22,target:14,weight:1},{source:23,target:14},
        {source:24,target:14},{source:24,target:9,weight:2},
        {source:25,target:9,weight:3},{source:25,target:22,weight:2},
        {source:26,target:9,weight:3},{source:26,target:25,weight:3},{source:26,target:22,weight:2},
        {source:27,target:9,weight:2},{source:27,target:26,weight:2},{source:27,target:25,weight:2},
        {source:28,target:9,weight:2},{source:28,target:26,weight:2},{source:28,target:25,weight:2},
        {source:28,target:27,weight:2},{source:29,target:9,weight:2},{source:29,target:26,weight:2},
        {source:29,target:25,weight:2},{source:29,target:27,weight:2},{source:29,target:28,weight:2},
        {source:30,target:47,weight:6},{source:31,target:9},{source:31,target:32,weight:4},
        {source:31,target:33,weight:4},{source:31,target:47},
        {source:32,target:33,weight:13},{source:32,target:34,weight:2},{source:32,target:35,weight:2},
        {source:32,target:36},{source:32,target:52},{source:32,target:53},
        {source:32,target:54},{source:32,target:55},{source:32,target:56},
        {source:33,target:34},{source:33,target:35},{source:34,target:36,weight:2},
        {source:34,target:47,weight:3},{source:34,target:42},
        {source:36,target:13},{source:36,target:37},{source:36,target:38},
        {source:36,target:39},{source:36,target:40},{source:36,target:41},
        {source:36,target:42,weight:2},{source:36,target:43},{source:36,target:44},
        {source:36,target:45},{source:36,target:46},{source:36,target:56},
        {source:37,target:38},{source:37,target:42},{source:37,target:43},
        {source:38,target:39,weight:6},{source:38,target:40,weight:3},{source:38,target:41,weight:3},
        {source:38,target:42,weight:6},{source:38,target:43,weight:3},{source:38,target:44,weight:3},
        {source:38,target:45,weight:3},{source:38,target:46,weight:3},
        {source:39,target:40,weight:3},{source:39,target:41,weight:3},{source:39,target:42,weight:3},
        {source:39,target:43,weight:3},{source:39,target:44,weight:3},{source:39,target:45,weight:3},
        {source:39,target:46,weight:3},{source:40,target:41,weight:3},{source:40,target:42,weight:3},
        {source:40,target:43,weight:3},{source:40,target:44,weight:3},{source:40,target:45,weight:3},
        {source:40,target:46,weight:3},{source:41,target:42,weight:3},{source:41,target:43,weight:3},
        {source:41,target:44,weight:3},{source:41,target:45,weight:3},{source:41,target:46,weight:3},
        {source:42,target:43,weight:3},{source:42,target:44,weight:3},{source:42,target:45,weight:3},
        {source:42,target:46,weight:3},{source:43,target:44,weight:3},{source:43,target:45,weight:3},
        {source:43,target:46,weight:3},{source:44,target:45,weight:5},{source:44,target:46,weight:4},
        {source:45,target:46,weight:4},{source:46,target:57,weight:2},
        {source:47,target:42,weight:6},{source:47,target:44,weight:5},
        {source:47,target:45,weight:5},{source:47,target:46,weight:4},
        {source:48,target:47,weight:2},{source:48,target:49,weight:9},{source:49,target:47,weight:6},
        {source:50,target:9},
        {source:52,target:53},{source:52,target:54},{source:52,target:55},
        {source:53,target:54},{source:53,target:55},{source:54,target:55},
        {source:55,target:34},{source:55,target:36},
        {source:56,target:52},{source:56,target:53},{source:56,target:54},{source:56,target:55},
        {source:57,target:38},{source:57,target:42},{source:57,target:43},
        {source:57,target:44},{source:57,target:45},
      ],
    },
  },

};

// ─── UI ───────────────────────────────────────────────────────────────────────

let currentViewer = null;

function loadGraph(ex, filename) {
  const g = ex.graph;
  const layout = ex.layout || 'force';

  // Stats bar
  const stats = document.getElementById('ne-stats');
  const badgeClass = {
    force:     'ne-badge-force',
    anchored:  'ne-badge-anchored',
    bipartite: 'ne-badge-bipartite',
    hierarchy: 'ne-badge-hierarchy',
  }[layout] || 'ne-badge-force';
  stats.style.display = 'flex';
  stats.innerHTML =
    `<span>${filename}&nbsp;·&nbsp;${g.nodes.length} nodes&nbsp;·&nbsp;${g.edges.length} edges&nbsp;·&nbsp;${g.directed ? 'directed' : 'undirected'}</span>` +
    `<span class="ne-layout-badge ${badgeClass}">${layout}</span>`;

  // Show viewer shell
  document.getElementById('ne-viewer').style.display = 'block';

  // Reset to Graph tab
  document.querySelectorAll('.ne-tab-btn').forEach((b, i) => b.classList.toggle('active', i === 0));
  document.getElementById('ne-graph-pane').style.display = '';
  document.getElementById('ne-matrix-pane').style.display = 'none';

  // Clear info panel
  document.getElementById('ne-info-panel').innerHTML =
    '<span class="nip-hint">Hover or click a node for details</span>';

  // Destroy previous simulation
  if (currentViewer) currentViewer.destroy();
  currentViewer = new NetworkViewer({ graph: g, layout });
}

function initExplorer() {
  // Wire tabs (once, not per-viewer)
  document.querySelector('.ne-tab-strip').addEventListener('click', e => {
    const btn = e.target.closest('.ne-tab-btn');
    if (!btn) return;
    document.querySelectorAll('.ne-tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.tab;
    document.getElementById('ne-graph-pane').style.display = tab === 'graph' ? '' : 'none';
    const mp = document.getElementById('ne-matrix-pane');
    mp.style.display = tab === 'matrix' ? '' : 'none';
    if (tab === 'matrix' && currentViewer) currentViewer.renderMatrix(mp);
  });

  // Reset zoom button
  document.getElementById('ne-reset-zoom').addEventListener('click', () => {
    if (currentViewer) {
      d3.select('#ne-svg').transition().duration(400)
        .call(currentViewer._zoom.transform, d3.zoomIdentity);
    }
  });

  // Example selector
  const sel = document.getElementById('ne-example-select');
  sel.addEventListener('change', () => {
    const ex = EXAMPLES[sel.value];
    if (ex) loadGraph(ex, ex.label);
  });

  // Upload zone
  const zone  = document.getElementById('ne-upload-zone');
  const input = document.getElementById('ne-file-input');
  const errEl = document.getElementById('ne-error');

  zone.addEventListener('click', () => input.click());
  input.addEventListener('change', e => { if (e.target.files[0]) readFile(e.target.files[0]); });
  zone.addEventListener('dragover',  e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault(); zone.classList.remove('drag-over');
    if (e.dataTransfer.files[0]) readFile(e.dataTransfer.files[0]);
  });

  function readFile(file) {
    errEl.textContent = '';
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const graph = parseGML(ev.target.result);
        loadGraph({ graph, layout: graph.layout || 'force' }, file.name);
        sel.value = '';
      } catch (err) {
        errEl.textContent = 'Parse error: ' + err.message;
      }
    };
    reader.readAsText(file);
  }

  // Load default on start
  loadGraph(EXAMPLES.karate, EXAMPLES.karate.label);
}

document.addEventListener('DOMContentLoaded', initExplorer);
