/* bracket.js — generic tournament bracket visualisation */

(() => {
  'use strict';

  // ── Layout config ────────────────────────────────────────────────────────
  const C = {
    slotH:   30,
    teamH:   22,
    teamW:   108,
    colGap:  18,
    centerW: 130,
    stemH:         28,   // upward T stem height in projection view
    stemHComplete: 60,   // taller T stem in the complete/finished view
  };
  C.colW = C.teamW + C.colGap;

  // ── Team colours ──────────────────────────────────────────────────────────
  const TEAM_COLORS = {
    'France':      '#002395',
    'Brazil':      '#009C3B',
    'England':     '#CF091E',
    'Argentina':   '#4EAFDA',
    'Spain':       '#FCBF00',
    'Portugal':    '#006600',
    'Belgium':     '#1A1A1A',
    'Norway':      '#EF2B2D',
    'Colombia':    '#FCD116',
    'USA':         '#002868',
    'Morocco':     '#C1272D',
    'Mexico':      '#007A33',
    'Switzerland': '#FF0000',
    'Canada':      '#D52B1E',
    'Paraguay':    '#0038A8',
    'Australia':   '#FFCD00',
    'Egypt':       '#CE1126',
    'Germany':     '#1a1a1a',
    'Netherlands': '#FF6600',
    'Japan':       '#003087',
    'Sweden':      '#006AA7',
    'Ecuador':     '#FFD100',
    'DR Congo':    '#007FFF',
    'Senegal':     '#00853F',
    'Bosnia & Herz.': '#002395',
    'Austria':     '#ED2939',
    'Croatia':     '#FF0000',
    'Algeria':     '#006233',
    'South Africa':'#007A4D',
    'Ivory Coast': '#F77F00',
    'Cape Verde':  '#003893',
    'Ghana':       '#006B3F',
  };

  function getTeamColor(name) { return TEAM_COLORS[name] ?? '#888'; }

  // ── State ────────────────────────────────────────────────────────────────
  let DATA          = null;
  let LAYOUT        = {};
  let BOXES         = {};
  let SLOT_ELS      = {};
  let USER_PICKS    = {};
  let TEAM_POS      = {};
  let LIVE_PROBS    = {};
  let activeTeam    = null;
  let hlEls         = [];
  let defaultPathEls = [];
  let PROJECTED_MODE  = false;
  let RANDOM_MODE     = false;
  let PROJECTED_FILLS = new Set();
  let RANDOM_FILLS    = new Set();
  let ACTIVE_MATRIX   = 'ds';

  let LIVE_MATRICES     = null;
  let SNAP_MATRICES     = null;  // non-null when a historical snapshot is active
  let LIVE_BRACKET      = null;
  let HISTORY           = null;
  let SELECTED_SNAP     = -1;
  let CHOSEN_CHAMPION   = null;
  let PROJECTION_CENTER = null;

  // ── Entry ────────────────────────────────────────────────────────────────
  async function init() {
    try {
      DATA = await fetch('predictions.json').then(r => r.json());
    } catch (e) {
      document.getElementById('error').textContent =
        'Could not load predictions.json — ' + e.message;
      return;
    }
    LIVE_BRACKET  = DATA.bracket;
    LIVE_MATRICES = {
      ds_pele: DATA.pairwise_ko_ds_pele,
      pele:    DATA.pairwise_ko_pele,
      ds:      DATA.pairwise_ko_ds,
      // fall back to basic BT (original pairwise_ko) when matches-only matrix isn't in the file
      matches: DATA.pairwise_ko_matches ?? DATA.pairwise_ko,
    };
    // Default active matrix: grouped hierarchy (ds), falling back to basic BT
    DATA.pairwise_ko = DATA.pairwise_ko_ds ?? DATA.pairwise_ko;

    document.getElementById('last-updated').textContent =
      'Predictions as of ' + new Date(DATA.generated_at).toUTCString();
    document.title = DATA.tournament + ' — Bracket';
    document.querySelector('header h1').textContent = DATA.tournament;

    document.getElementById('reset-btn').addEventListener('click', resetAllPicks);
    document.getElementById('random-btn').addEventListener('click', simulateRandom);

    document.getElementById('projected-btn').addEventListener('click', () => {
      if (PROJECTED_MODE) {
        clearProjected();
        clearRandom();
        PROJECTED_MODE = false;
        document.getElementById('projected-btn').classList.remove('active');
        refreshAllProbs();
      } else {
        clearRandom();
        PROJECTED_MODE = true;
        document.getElementById('projected-btn').classList.add('active');
        applyProjected();
        refreshAllProbs();
      }
      applyOutcomeIndicators();
    });

    try {
      HISTORY = await fetch('predictions_history.json').then(r => r.json());
    } catch (_) { HISTORY = null; }
    buildForecastDropdown();

    // Custom dropdown: forecast
    document.getElementById('forecast-display').addEventListener('click', e => {
      e.stopPropagation();
      const panel = document.getElementById('forecast-panel');
      const isOpen = !panel.hasAttribute('hidden');
      closeAllCsels();
      if (!isOpen) panel.removeAttribute('hidden');
    });
    document.getElementById('forecast-panel').addEventListener('click', e => {
      const opt = e.target.closest('.csel-opt');
      if (!opt) return;
      const val = parseInt(opt.dataset.val, 10);
      document.querySelectorAll('#forecast-panel .csel-opt').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      document.getElementById('forecast-display').textContent = opt.textContent;
      document.getElementById('forecast-panel').setAttribute('hidden', '');
      switchForecast(val);
    });

    // Custom dropdown: model
    document.getElementById('model-display').addEventListener('click', e => {
      e.stopPropagation();
      if (document.getElementById('model-ctrl').classList.contains('disabled')) return;
      const panel = document.getElementById('model-panel');
      const isOpen = !panel.hasAttribute('hidden');
      closeAllCsels();
      if (!isOpen) panel.removeAttribute('hidden');
    });
    document.getElementById('model-panel').addEventListener('click', e => {
      const opt = e.target.closest('.csel-opt');
      if (!opt) return;
      document.querySelectorAll('#model-panel .csel-opt').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      document.getElementById('model-display').textContent = opt.textContent;
      document.getElementById('model-panel').setAttribute('hidden', '');
      switchMatrix(opt.dataset.val);
    });

    // Default to first snapshot (Before Round of 32).
    // Pre-set DATA.bracket before buildBracket() so slots are created with
    // snapshot teams (no winners), not the complete live bracket.
    const defaultSnap = HISTORY?.snapshots?.[0];
    if (defaultSnap) {
      DATA.bracket = defaultSnap.bracket;
      const displayText = defaultSnap.label.replace(/^Before\s+/i, '');
      document.getElementById('forecast-display').textContent = displayText;
      document.querySelectorAll('#forecast-panel .csel-opt').forEach(o => {
        o.classList.toggle('selected', parseInt(o.dataset.val, 10) === 0);
      });
    }

    computeLayout();
    buildRoundLabels();
    buildBracket();

    if (defaultSnap) {
      switchForecast(0);
    } else {
      applyKnownResults();
      refreshAllProbs();
      applyOutcomeIndicators();
    }
    applyResponsiveLayout();

    window.addEventListener('resize', applyResponsiveLayout);
    document.addEventListener('click', e => {
      if (!e.target.closest('.csel')) closeAllCsels();
      if (activeTeam) onLeave();
    });
  }

  // ── Forecast / model custom dropdowns ────────────────────────────────────
  function closeAllCsels() {
    document.querySelectorAll('.csel-panel').forEach(p => p.setAttribute('hidden', ''));
  }

  function buildForecastDropdown() {
    const panel = document.getElementById('forecast-panel');
    if (!HISTORY?.snapshots?.length) return;
    [...HISTORY.snapshots].reverse().forEach((snap, revIdx) => {
      const origIdx = HISTORY.snapshots.length - 1 - revIdx;
      const opt = document.createElement('div');
      opt.className = 'csel-opt';
      opt.dataset.val = origIdx;
      opt.textContent = snap.label.replace(/^Before\s+/i, '');
      panel.appendChild(opt);
    });
  }

  function switchForecast(idx) {
    SELECTED_SNAP = idx;

    // Reset all picks and mode state first
    clearProjected();
    clearRandom();
    PROJECTED_MODE = false;
    document.getElementById('projected-btn').classList.remove('active');
    const { nPerSide } = LAYOUT;
    for (const side of ['left', 'right'])
      for (let mi = 0; mi < nPerSide; mi++)
        clearDownstreamPicks(side, 0, mi);

    if (idx === -1) {
      SNAP_MATRICES = null;
      DATA.pairwise_ko = LIVE_MATRICES[ACTIVE_MATRIX] ?? DATA.pairwise_ko;
      DATA.bracket = LIVE_BRACKET;
      // Enable model selector when ds and matches matrices are distinct
      const liveHasVariants = !!(LIVE_MATRICES.ds && LIVE_MATRICES.matches &&
                                  LIVE_MATRICES.ds !== LIVE_MATRICES.matches);
      document.getElementById('model-ctrl').classList.toggle('disabled', !liveHasVariants);
    } else {
      const snap = HISTORY.snapshots[idx];
      SNAP_MATRICES = {
        ds_pele: snap.pairwise_ko_ds_pele ?? snap.pairwise_ko,
        pele:    snap.pairwise_ko_pele    ?? snap.pairwise_ko,
        ds:      snap.pairwise_ko_ds      ?? snap.pairwise_ko,
        matches: snap.pairwise_ko_matches ?? snap.pairwise_ko,
      };
      DATA.pairwise_ko = SNAP_MATRICES[ACTIVE_MATRIX] ?? snap.pairwise_ko;
      DATA.bracket = snap.bracket;
      const snapHasVariants = snap.pairwise_ko_ds && snap.pairwise_ko_matches &&
                              Object.keys(snap.pairwise_ko_matches).length > 0;
      const liveHasVariants = !!(LIVE_MATRICES.ds && LIVE_MATRICES.matches &&
                                  LIVE_MATRICES.ds !== LIVE_MATRICES.matches);
      document.getElementById('model-ctrl').classList.toggle('disabled', !(snapHasVariants || liveHasVariants));
    }

    if (idx >= 0) {
      PROJECTED_MODE = true;
      document.getElementById('projected-btn').classList.add('active');
    }
    applyKnownResults();
    refreshAllProbs();
    if (idx >= 0) {
      applyProjected();
    }
    applyOutcomeIndicators();
  }

  // ── Responsive layout ─────────────────────────────────────────────────────
  const MIN_SCROLL_WIDTH = 520;

  function applyResponsiveLayout() {
    const outer   = document.getElementById('bracket-outer');
    const wrapper = document.getElementById('bracket-scroll');
    if (!outer || !wrapper) return;
    const available = wrapper.clientWidth;
    const totalW    = LAYOUT.totalW;
    if (available >= totalW) {
      outer.style.zoom = ''; outer.style.marginLeft = 'auto'; outer.style.marginRight = 'auto';
    } else if (available >= MIN_SCROLL_WIDTH) {
      outer.style.zoom = available / totalW; outer.style.marginLeft = '0'; outer.style.marginRight = '0';
    } else {
      outer.style.zoom = ''; outer.style.marginLeft = '0'; outer.style.marginRight = '0';
      wrapper.scrollLeft = (wrapper.scrollWidth - wrapper.clientWidth) / 2;
    }
  }

  // ── Layout math ──────────────────────────────────────────────────────────
  function computeLayout() {
    const r32 = DATA.bracket.R32;
    const nR32 = r32.length;
    const nPerSide = nR32 / 2;
    const nSlots = nPerSide * 2;
    const nSideRounds = Math.log2(nPerSide) + 2;
    const bracketH = nSlots * C.slotH;
    const leftW    = nSideRounds * C.colW;
    const centerW  = C.centerW;
    const totalW   = leftW * 2 + centerW;
    LAYOUT = { nR32, nPerSide, nSlots, nSideRounds, bracketH, leftW, centerW, totalW };
  }

  function teamY(roundIdx, matchIdxInSide, pos) {
    if (roundIdx >= LAYOUT.nSideRounds - 1) return LAYOUT.bracketH / 2;
    const mult = Math.pow(2, roundIdx);
    return (mult * matchIdxInSide * 2 + mult * pos + mult / 2) * C.slotH;
  }

  function teamX(roundIdx, side) {
    const { leftW, nSideRounds } = LAYOUT;
    if (side === 'left') return roundIdx * C.colW;
    return leftW + C.centerW + (nSideRounds - 1 - roundIdx) * C.colW;
  }

  // ── Round labels ──────────────────────────────────────────────────────────
  function buildRoundLabels() {
    const row = document.getElementById('round-labels-row');
    const { totalW, nSideRounds } = LAYOUT;
    const labels = DATA.round_labels;
    const roundKeys = ['R32', 'R16', 'QF', 'SF', 'F'];

    for (let ri = 0; ri < nSideRounds - 1; ri++) {
      const span = document.createElement('div');
      span.className = 'round-label';
      span.style.width = C.colW + 'px';
      span.textContent = labels[roundKeys[ri]] || roundKeys[ri];
      row.appendChild(span);
    }
    const finL = document.createElement('div');
    finL.className = 'round-label';
    finL.style.width = C.colW + 'px';
    row.appendChild(finL);

    const center = document.createElement('div');
    center.className = 'round-label-center';
    center.style.width = C.centerW + 'px';
    center.textContent = labels['W'] || 'Champion';
    row.appendChild(center);

    const rightLabels = [...roundKeys].reverse();
    for (let ri = 0; ri < nSideRounds; ri++) {
      const span = document.createElement('div');
      span.className = 'round-label';
      span.style.width = C.colW + 'px';
      if (ri > 0) span.textContent = labels[rightLabels[ri]] || rightLabels[ri];
      row.appendChild(span);
    }
    row.style.width = totalW + 'px';
  }

  // ── Build bracket ─────────────────────────────────────────────────────────
  function buildBracket() {
    const { bracketH, totalW } = LAYOUT;
    const bracket = document.getElementById('bracket');
    bracket.style.width  = totalW + 'px';
    bracket.style.height = bracketH + 'px';

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'conn-svg';
    svg.setAttribute('width', totalW);
    svg.setAttribute('height', bracketH);
    svg.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;z-index:1;';
    bracket.appendChild(svg);

    const b = DATA.bracket;
    const { nPerSide } = LAYOUT;

    drawBaseConnectors(svg, b, nPerSide);

    renderSide('left',  b.R32.slice(0, nPerSide), b.R16.slice(0, nPerSide/2), b.QF.slice(0, nPerSide/4), b.SF.slice(0, 1), bracket);
    renderSide('right', b.R32.slice(nPerSide),    b.R16.slice(nPerSide/2),    b.QF.slice(nPerSide/4),    b.SF.slice(1),    bracket);

    drawFinalistToCenter(svg);
    buildCenterPanel(bracket);

    b.R32.forEach((match, idx) => {
      const side  = idx < nPerSide ? 'left' : 'right';
      const r32Mi = idx < nPerSide ? idx : idx - nPerSide;
      if (match.team_a) TEAM_POS[match.team_a] = { side, r32Mi };
      if (match.team_b) TEAM_POS[match.team_b] = { side, r32Mi };
    });
  }

  function renderSide(side, r32Matches, r16Matches, qfMatches, sfMatches, bracket) {
    const rounds = [
      { key: 'R32', matches: r32Matches },
      { key: 'R16', matches: r16Matches },
      { key: 'QF',  matches: qfMatches  },
      { key: 'SF',  matches: sfMatches  },
    ];
    rounds.forEach(({ key, matches }, ri) => {
      matches.forEach((match, mi) => {
        addTeamBox(match.team_a, key, side, mi, 0, ri, bracket);
        addTeamBox(match.team_b, key, side, mi, 1, ri, bracket);
      });
    });
    const sfWinner = sfMatches[0]?.winner || null;
    const finRi = LAYOUT.nSideRounds - 1;
    addTeamBox(sfWinner, 'FINALIST', side, 0, 0, finRi, bracket);
  }

  function addTeamBox(name, roundKey, side, matchIdx, pos, roundIdx, bracket) {
    const x = teamX(roundIdx, side);
    const y = teamY(roundIdx, matchIdx, pos);
    const div = document.createElement('div');
    div.className = 'team-box' + (name ? '' : ' tbd');
    div.dataset.team  = name || '';
    div.dataset.round = roundKey;
    div.dataset.side  = side;
    div.style.left   = x + 'px';
    div.style.top    = (y - C.teamH / 2) + 'px';
    div.style.width  = C.teamW + 'px';
    div.style.height = C.teamH + 'px';
    if (!name) {
      div.innerHTML = '<span class="team-name tbd-text">TBD</span>';
    } else {
      fillBoxContent(div, name);
      div.onmouseenter = () => onHover(name);
      div.onmouseleave = onLeave;
      div.onclick = (e) => {
        e.stopPropagation();
        if (window.matchMedia('(pointer: coarse)').matches && activeTeam !== name) onHover(name);
        else onClickAdvance(name, side, roundIdx, matchIdx);
      };
      if (!BOXES[name]) BOXES[name] = [];
      BOXES[name].push({ el: div, roundKey, roundIdx, side, matchIdx, pos });
    }
    SLOT_ELS[`${side}_${roundIdx}_${matchIdx}_${pos}`] = div;
    bracket.appendChild(div);
  }

  // ── Base connector lines ──────────────────────────────────────────────────
  function drawBaseConnectors(svg, b, nPerSide) {
    const sides = {
      left:  { r32: b.R32.slice(0, nPerSide), r16: b.R16.slice(0, nPerSide/2), qf: b.QF.slice(0, nPerSide/4), sf: b.SF.slice(0,1) },
      right: { r32: b.R32.slice(nPerSide),    r16: b.R16.slice(nPerSide/2),    qf: b.QF.slice(nPerSide/4),    sf: b.SF.slice(1)   },
    };
    ['left','right'].forEach(side => {
      [{ ri:0, matches: sides[side].r32 },
       { ri:1, matches: sides[side].r16 },
       { ri:2, matches: sides[side].qf  },
       { ri:3, matches: sides[side].sf  }].forEach(({ ri, matches }) => {
        matches.forEach((_, mi) => drawMatchConnector(svg, ri, mi, side, 'conn-base'));
      });
    });
  }

  function drawMatchConnector(svg, ri, mi, side, cls) {
    const topY = teamY(ri, mi, 0);
    const botY = teamY(ri, mi, 1);
    const midY = (topY + botY) / 2;
    const bx = teamX(ri, side);
    let edgeX, midX, nextEdgeX;
    if (side === 'left') {
      edgeX = bx + C.teamW; midX = edgeX + C.colGap / 2; nextEdgeX = bx + C.colW;
    } else {
      edgeX = bx; midX = edgeX - C.colGap / 2; nextEdgeX = bx - C.colGap;
    }
    svgLine(svg, edgeX, topY, midX, topY, cls);
    svgLine(svg, edgeX, botY, midX, botY, cls);
    svgLine(svg, midX, topY, midX, botY, cls);
    svgLine(svg, midX, midY, nextEdgeX, midY, cls);
  }

  function drawFinalistToCenter(svg) {
    const { leftW, centerW, bracketH, nSideRounds } = LAYOUT;
    const midY   = bracketH / 2;
    const finRi  = nSideRounds - 1;
    const cx     = leftW + centerW / 2;
    // Horizontal bar connecting both finalist boxes through center
    svgLine(svg, teamX(finRi, 'left') + C.teamW, midY, teamX(finRi, 'right'), midY, 'conn-base');
    // Vertical stem rising from T junction toward champion display
    const stemLine = svgLine(svg, cx, midY, cx, midY - C.stemH, 'conn-base');
    stemLine.id = 'final-stem-line';
  }

  function buildCenterPanel(bracket) {
    const { leftW, centerW, bracketH } = LAYOUT;
    const panel = document.getElementById('center-panel');
    panel.style.left = leftW + 'px'; panel.style.width = centerW + 'px';
    panel.style.top = '0'; panel.style.height = bracketH + 'px';
    // Default (non-complete): center content well above the T-stem; updated by applyKnownResults
    panel.style.paddingBottom = (2 * (C.stemH + 72)) + 'px';
  }

  // ── Click-to-advance ──────────────────────────────────────────────────────
  function onClickAdvance(name, side, ri, mi) {
    const pickKey = `${side}_${ri}_${mi}`;
    if (USER_PICKS[pickKey] === name) return;
    if (PROJECTED_MODE) clearProjected();
    clearDownstreamPicks(side, ri, mi);
    USER_PICKS[pickKey] = name;
    for (const p of [0, 1]) {
      const div = SLOT_ELS[`${side}_${ri}_${mi}_${p}`];
      if (!div || !div.dataset.team) continue;
      div.classList.toggle('user-winner', div.dataset.team === name);
      div.classList.toggle('user-loser',  div.dataset.team !== name);
    }
    const nextRi = ri + 1, nextMi = Math.floor(mi / 2), nextPos = mi % 2;
    if (nextRi < LAYOUT.nSideRounds) promoteToSlot(side, nextRi, nextMi, nextPos, name);
    else CHOSEN_CHAMPION = name; // finalist slot → pick as champion
    if (PROJECTED_MODE) applyProjected();
    refreshAllProbs();
  }

  function clearDownstreamPicks(side, ri, mi) {
    const pickKey = `${side}_${ri}_${mi}`;
    if (!USER_PICKS[pickKey]) return;
    delete USER_PICKS[pickKey];
    for (const p of [0, 1]) {
      const div = SLOT_ELS[`${side}_${ri}_${mi}_${p}`];
      if (div) div.classList.remove('user-winner', 'user-loser');
    }
    const nextRi = ri + 1, nextMi = Math.floor(mi / 2), nextPos = mi % 2;
    if (nextRi < LAYOUT.nSideRounds) {
      clearDownstreamPicks(side, nextRi, nextMi);
      resetSlotToTBD(side, nextRi, nextMi, nextPos);
    }
  }

  function resetAllPicks() {
    clearProjected();
    clearRandom();
    PROJECTED_MODE = false;
    document.getElementById('projected-btn').classList.remove('active');
    CHOSEN_CHAMPION = null;
    const { nPerSide } = LAYOUT;
    for (const side of ['left', 'right'])
      for (let mi = 0; mi < nPerSide; mi++)
        clearDownstreamPicks(side, 0, mi);
    applyKnownResults();
    refreshAllProbs();
    applyOutcomeIndicators();
  }

  // ── Random outcome simulation ─────────────────────────────────────────────
  function setCenterChampBox(cls) {
    const box = document.getElementById('center-champion-box');
    box.classList.remove('projected-champ', 'random-champ');
    if (cls) box.classList.add(cls);
  }

  function clearRandom() {
    PROJECTION_CENTER = null;
    for (const key of RANDOM_FILLS) {
      const parts = key.split('_');
      resetSlotToTBD(parts[0], +parts[1], +parts[2], +parts[3]);
    }
    RANDOM_FILLS.clear();
    RANDOM_MODE = false;
    document.getElementById('random-btn').classList.remove('active');
    setCenterChampBox(null);
  }

  function promoteToSlotRandom(side, ri, mi, pos, name) {
    const key = `${side}_${ri}_${mi}_${pos}`;
    const div = SLOT_ELS[key];
    if (!div || div.dataset.team) return;
    const prev = div.dataset.team;
    if (prev && BOXES[prev]) BOXES[prev] = BOXES[prev].filter(b => b.el !== div);
    div.dataset.team = name;
    div.classList.remove('tbd'); div.classList.add('random');
    fillBoxContent(div, name);
    div.style.cursor = 'pointer';
    div.onmouseenter = () => onHover(name);
    div.onmouseleave = onLeave;
    div.onclick = (e) => {
      e.stopPropagation();
      clearRandom();
      onClickAdvance(name, side, ri, mi);
    };
    if (!BOXES[name]) BOXES[name] = [];
    BOXES[name].push({ el: div, roundKey: 'RANDOM', roundIdx: ri, side, matchIdx: mi, pos });
    RANDOM_FILLS.add(key);
  }

  function simulateRandom() {
    clearRandom();
    clearProjected();
    PROJECTED_MODE = false;
    document.getElementById('projected-btn').classList.remove('active');

    // Works like applyProjected() but samples winners randomly instead of taking most likely
    const { nPerSide, nSideRounds } = LAYOUT;
    const finRi = nSideRounds - 1;
    const finalists = {};

    for (const side of ['left', 'right']) {
      const roundWinners = [];
      const r0 = [];
      for (let mi = 0; mi < nPerSide; mi++) {
        const pickKey = `${side}_0_${mi}`;
        if (USER_PICKS[pickKey]) { r0.push(USER_PICKS[pickKey]); continue; }
        const match = getR32Match(side, mi);
        const ta = match?.team_a, tb = match?.team_b;
        if (ta && tb) { const p = DATA.pairwise_ko?.[ta]?.[tb] ?? 0.5; r0.push(Math.random() < p ? ta : tb); }
        else r0.push(ta || tb || null);
      }
      roundWinners[0] = r0;

      for (let ri = 1; ri < finRi; ri++) {
        const prev = roundWinners[ri - 1];
        const nMatches = Math.floor(prev.length / 2);
        const cur = [];
        for (let mi = 0; mi < nMatches; mi++) {
          const teamA = prev[mi * 2], teamB = prev[mi * 2 + 1];
          for (const [pos, team] of [[0, teamA], [1, teamB]]) {
            if (!team) continue;
            const div = SLOT_ELS[`${side}_${ri}_${mi}_${pos}`];
            if (div && !div.dataset.team) promoteToSlotRandom(side, ri, mi, pos, team);
          }
          const pickKey = `${side}_${ri}_${mi}`;
          if (USER_PICKS[pickKey]) { cur.push(USER_PICKS[pickKey]); continue; }
          if (teamA && teamB) { const p = DATA.pairwise_ko?.[teamA]?.[teamB] ?? 0.5; cur.push(Math.random() < p ? teamA : teamB); }
          else cur.push(teamA || teamB || null);
        }
        roundWinners[ri] = cur;
      }

      const sfWinner = roundWinners[finRi - 1]?.[0];
      if (sfWinner) {
        const div = SLOT_ELS[`${side}_${finRi}_0_0`];
        if (div && !div.dataset.team) promoteToSlotRandom(side, finRi, 0, 0, sfWinner);
        finalists[side] = sfWinner;
      }
    }

    const { left: teamA, right: teamB } = finalists;
    if (teamA && teamB) {
      const p = DATA.pairwise_ko?.[teamA]?.[teamB] ?? 0.5;
      const champion = Math.random() < p ? teamA : teamB;
      PROJECTION_CENTER = champion;
      if (!activeTeam) updateCenter(champion);
      setCenterChampBox('random-champ');
    }

    RANDOM_MODE = true;
    document.getElementById('random-btn').classList.add('active');
    refreshAllProbs();
    clearOutcomeIndicators();
  }

  function promoteToSlot(side, ri, mi, pos, name) {
    const key = `${side}_${ri}_${mi}_${pos}`;
    const div = SLOT_ELS[key];
    if (!div) return;
    const prev = div.dataset.team;
    if (prev && BOXES[prev]) BOXES[prev] = BOXES[prev].filter(b => b.el !== div);
    div.dataset.team = name;
    div.classList.remove('tbd', 'user-winner', 'user-loser', 'projected');
    fillBoxContent(div, name);
    div.style.cursor = 'pointer';
    div.onmouseenter = () => onHover(name);
    div.onmouseleave = onLeave;
    div.onclick = (e) => {
      e.stopPropagation();
      if (window.matchMedia('(pointer: coarse)').matches && activeTeam !== name) onHover(name);
      else onClickAdvance(name, side, ri, mi);
    };
    if (!BOXES[name]) BOXES[name] = [];
    BOXES[name].push({ el: div, roundKey: 'PICK', roundIdx: ri, side, matchIdx: mi, pos });
  }

  function resetSlotToTBD(side, ri, mi, pos) {
    const key = `${side}_${ri}_${mi}_${pos}`;
    const div = SLOT_ELS[key];
    if (!div) return;
    const prev = div.dataset.team;
    if (prev && BOXES[prev]) BOXES[prev] = BOXES[prev].filter(b => b.el !== div);
    PROJECTED_FILLS.delete(key);
    RANDOM_FILLS.delete(key);
    if (prev === CHOSEN_CHAMPION) CHOSEN_CHAMPION = null;
    div.dataset.team = '';
    div.classList.add('tbd');
    div.classList.remove('user-winner', 'user-loser', 'projected', 'random');
    div.innerHTML = '<span class="team-name tbd-text">TBD</span>';
    div.style.cursor = 'default';
    div.onmouseenter = null; div.onmouseleave = null; div.onclick = null;
  }

  // ── Projected mode ────────────────────────────────────────────────────────
  function applyProjected() {
    const finalists = {};
    for (const side of ['left', 'right']) {
      const { nPerSide, nSideRounds } = LAYOUT;
      const finRi = nSideRounds - 1;
      const roundWinners = [];
      const r0 = [];
      for (let mi = 0; mi < nPerSide; mi++) {
        const pickKey = `${side}_0_${mi}`;
        if (USER_PICKS[pickKey]) {
          r0.push(USER_PICKS[pickKey]);
        } else {
          const match = getR32Match(side, mi);
          const ta = match?.team_a, tb = match?.team_b;
          if (ta && tb) r0.push((DATA.pairwise_ko?.[ta]?.[tb] ?? 0.5) >= 0.5 ? ta : tb);
          else r0.push(ta || tb || null);
        }
      }
      roundWinners[0] = r0;
      for (let ri = 1; ri < finRi; ri++) {
        const prev = roundWinners[ri - 1];
        const nMatches = Math.floor(prev.length / 2);
        const cur = [];
        for (let mi = 0; mi < nMatches; mi++) {
          const teamA = prev[mi * 2], teamB = prev[mi * 2 + 1];
          for (const [pos, team] of [[0, teamA], [1, teamB]]) {
            if (!team) continue;
            const key = `${side}_${ri}_${mi}_${pos}`;
            const div = SLOT_ELS[key];
            if (div && !div.dataset.team) promoteToSlotProjected(side, ri, mi, pos, team);
          }
          const pickKey = `${side}_${ri}_${mi}`;
          if (USER_PICKS[pickKey]) cur.push(USER_PICKS[pickKey]);
          else if (teamA && teamB) cur.push((DATA.pairwise_ko?.[teamA]?.[teamB] ?? 0.5) >= 0.5 ? teamA : teamB);
          else cur.push(teamA || teamB || null);
        }
        roundWinners[ri] = cur;
      }
      const sfWinner = roundWinners[finRi - 1]?.[0];
      if (sfWinner) {
        const key = `${side}_${finRi}_0_0`;
        const div = SLOT_ELS[key];
        if (div && !div.dataset.team) promoteToSlotProjected(side, finRi, 0, 0, sfWinner);
        finalists[side] = sfWinner;
      }
    }
    const { left: teamA, right: teamB } = finalists;
    if (teamA && teamB) {
      const p = DATA.pairwise_ko?.[teamA]?.[teamB] ?? 0.5;
      const champion = p >= 0.5 ? teamA : teamB;
      PROJECTION_CENTER = champion;
      if (!activeTeam) updateCenter(champion);
      setCenterChampBox('projected-champ');
    }
  }

  function clearProjected() {
    PROJECTION_CENTER = null;
    if (!activeTeam) drawDefaultPath();
    for (const key of PROJECTED_FILLS) {
      const parts = key.split('_');
      resetSlotToTBD(parts[0], +parts[1], +parts[2], +parts[3]);
    }
    PROJECTED_FILLS.clear();
    setCenterChampBox(null);
  }

  function promoteToSlotProjected(side, ri, mi, pos, name) {
    const key = `${side}_${ri}_${mi}_${pos}`;
    const div = SLOT_ELS[key];
    if (!div || div.dataset.team) return;
    const prev = div.dataset.team;
    if (prev && BOXES[prev]) BOXES[prev] = BOXES[prev].filter(b => b.el !== div);
    div.dataset.team = name;
    div.classList.remove('tbd'); div.classList.add('projected');
    fillBoxContent(div, name);
    div.style.cursor = 'pointer';
    div.onmouseenter = () => onHover(name);
    div.onmouseleave = onLeave;
    div.onclick = (e) => {
      e.stopPropagation();
      clearProjected();
      document.getElementById('projected-btn').classList.remove('active');
      PROJECTED_MODE = false;
      onClickAdvance(name, side, ri, mi);
    };
    if (!BOXES[name]) BOXES[name] = [];
    BOXES[name].push({ el: div, roundKey: 'PROJECTED', roundIdx: ri, side, matchIdx: mi, pos });
    PROJECTED_FILLS.add(key);
  }

  // ── Model / forecast switch ───────────────────────────────────────────────
  function switchMatrix(key) {
    ACTIVE_MATRIX = key;
    // Prefer snap matrices when they have distinct variants; fall back to live matrices
    const snapDs = SNAP_MATRICES?.ds, snapMatches = SNAP_MATRICES?.matches;
    const snapHasVariants = snapDs && snapMatches && snapDs !== snapMatches;
    const matrices = (SNAP_MATRICES && snapHasVariants) ? SNAP_MATRICES : LIVE_MATRICES;
    DATA.pairwise_ko = matrices[key] ?? DATA.pairwise_ko;
    if (PROJECTED_MODE) { clearProjected(); applyProjected(); }
    refreshAllProbs();
    applyOutcomeIndicators();
  }

  // ── Box content ───────────────────────────────────────────────────────────
  function fillBoxContent(div, name) {
    const td  = DATA.teams[name];
    const w   = LIVE_PROBS[name]?.W ?? td?.probs?.W ?? 0;
    const iso = td?.iso;
    const flagHtml = iso
      ? `<img class="team-flag-img" src="https://flagcdn.com/20x15/${iso}.png" alt="">`
      : `<span class="team-flag">${td?.flag ?? ''}</span>`;
    div.innerHTML =
      flagHtml +
      `<span class="team-name">${name}</span>` +
      `<span class="team-win-prob">${pct(w)}</span>`;
    const bar = document.createElement('div');
    bar.className = 'prob-bar';
    bar.style.width = (w * 100).toFixed(1) + '%';
    bar.style.background = getTeamColor(name);
    div.appendChild(bar);
  }

  // ── Known results ─────────────────────────────────────────────────────────
  function applyKnownResults() {
    const { nPerSide } = LAYOUT;
    const roundMeta = {
      R32: { ri: 0, perSide: nPerSide },
      R16: { ri: 1, perSide: nPerSide / 2 },
      QF:  { ri: 2, perSide: nPerSide / 4 },
      SF:  { ri: 3, perSide: 1 },
    };
    for (const [roundKey, { ri, perSide }] of Object.entries(roundMeta)) {
      const fixtures = DATA.bracket[roundKey] || [];
      fixtures.forEach((match, idx) => {
        if (!match.winner) return;
        const side = idx < perSide ? 'left' : 'right';
        const mi   = idx < perSide ? idx : idx - perSide;
        USER_PICKS[`${side}_${ri}_${mi}`] = match.winner;
        for (const pos of [0, 1]) {
          const div = SLOT_ELS[`${side}_${ri}_${mi}_${pos}`];
          if (!div || !div.dataset.team) continue;
          div.classList.toggle('user-winner', div.dataset.team === match.winner);
          div.classList.toggle('user-loser',  div.dataset.team !== match.winner);
        }
        const nextRi = ri + 1, nextMi = Math.floor(mi / 2), nextPos = mi % 2;
        if (nextRi < LAYOUT.nSideRounds) promoteToSlot(side, nextRi, nextMi, nextPos, match.winner);
      });
    }
    // Final (F): set champion and mark finalist slots
    const fMatch = DATA.bracket.F?.[0];
    if (fMatch?.winner) {
      const finRi = LAYOUT.nSideRounds - 1;
      const loser = fMatch.winner === fMatch.team_a ? fMatch.team_b : fMatch.team_a;
      CHOSEN_CHAMPION = fMatch.winner;
      for (const side of ['left', 'right']) {
        const div = SLOT_ELS[`${side}_${finRi}_0_0`];
        if (!div || !div.dataset.team) continue;
        div.classList.toggle('user-winner', div.dataset.team === fMatch.winner);
        div.classList.toggle('user-loser',  div.dataset.team === loser);
      }
    }
    // Center panel padding and T stem: taller in complete view (no overlap with path highlights)
    const { bracketH } = LAYOUT;
    // "over" = live tournament is complete, not just that this bracket has a final result
    const over = SELECTED_SNAP < 0 && !!LIVE_BRACKET?.F?.[0]?.winner;
    const activeStemH = over ? C.stemHComplete : C.stemH;
    const pb = over ? 2 * (C.stemHComplete + 24) : 2 * (C.stemH + 72);
    document.getElementById('center-panel').style.paddingBottom = pb + 'px';
    const stemLine = document.getElementById('final-stem-line');
    if (stemLine) stemLine.setAttribute('y2', bracketH / 2 - activeStemH);
    // Complete view: hide interactive controls and hover instruction; don't dim losers
    document.getElementById('controls').style.display    = over ? 'none' : '';
    document.getElementById('center-hint').style.display = over ? 'none' : '';
    document.getElementById('header-subtitle').textContent = over
      ? 'Final results'
      : 'Predictions based only on match outcomes · hover a team to see their path · click to advance';
    document.getElementById('last-updated').style.display = over ? 'none' : '';
    document.body.classList.toggle('tournament-over', over);
    // Mark eliminated teams as crossed-out in ALL their bracket slots
    markAllEliminatedBoxes();
  }

  // After known results are applied, any team with user-loser on any box
  // is definitively eliminated — mark all their boxes as loser.
  function markAllEliminatedBoxes() {
    for (const [, boxes] of Object.entries(BOXES)) {
      if (!boxes.some(b => b.el.classList.contains('user-loser'))) continue;
      for (const { el } of boxes) {
        el.classList.add('user-loser');
        el.classList.remove('user-winner');
      }
    }
  }

  // ── Conditional probability engine ────────────────────────────────────────
  function getR32Match(side, mi) {
    const { nPerSide } = LAYOUT;
    return DATA.bracket.R32[side === 'left' ? mi : nPerSide + mi];
  }

  // Return the known winner for (side, ri, mi) from DATA.bracket, or null.
  // nPerSide >> ri = number of fixtures per side in round ri.
  function _knownWinner(side, ri, mi) {
    const { nPerSide } = LAYOUT;
    const rndKeys = ['R32', 'R16', 'QF', 'SF'];
    if (ri >= rndKeys.length) return null;
    const nps = nPerSide >> ri;
    const idx = side === 'left' ? mi : nps + mi;
    return DATA.bracket?.[rndKeys[ri]]?.[idx]?.winner ?? null;
  }

  function matchWinnerDist(side, ri, mi) {
    const pickKey = `${side}_${ri}_${mi}`;
    if (USER_PICKS[pickKey]) return { [USER_PICKS[pickKey]]: 1.0 };
    // Short-circuit for known bracket results — winner has probability 1
    const known = _knownWinner(side, ri, mi);
    if (known) return { [known]: 1.0 };
    if (ri === 0) {
      const match = getR32Match(side, mi);
      if (!match?.team_a || !match?.team_b) return {};
      const p = DATA.pairwise_ko?.[match.team_a]?.[match.team_b] ?? 0.5;
      return { [match.team_a]: p, [match.team_b]: 1 - p };
    }
    const topDist = matchWinnerDist(side, ri - 1, mi * 2);
    const botDist = matchWinnerDist(side, ri - 1, mi * 2 + 1);
    const result  = {};
    for (const [a, pa] of Object.entries(topDist)) {
      for (const [b, pb] of Object.entries(botDist)) {
        const p = DATA.pairwise_ko?.[a]?.[b] ?? 0.5;
        result[a] = (result[a] || 0) + pa * pb * p;
        result[b] = (result[b] || 0) + pa * pb * (1 - p);
      }
    }
    return result;
  }

  function computeTeamProbs(name, side, r32Mi) {
    const r16Mi = Math.floor(r32Mi / 2);
    const qfMi  = Math.floor(r16Mi / 2);
    const otherSide = side === 'left' ? 'right' : 'left';
    const p_r16 = matchWinnerDist(side, 0, r32Mi)[name] ?? 0;
    const p_qf  = matchWinnerDist(side, 1, r16Mi)[name] ?? 0;
    const p_sf  = matchWinnerDist(side, 2, qfMi)[name]  ?? 0;
    const p_f   = matchWinnerDist(side, 3, 0)[name]     ?? 0;
    const finalDist = matchWinnerDist(otherSide, 3, 0);
    const p_w = p_f * Object.entries(finalDist).reduce(
      (s, [opp, p]) => s + p * (DATA.pairwise_ko?.[name]?.[opp] ?? 0.5), 0
    );
    return { R32: 1.0, R16: p_r16, QF: p_qf, SF: p_sf, F: p_f, W: CHOSEN_CHAMPION === name ? 1.0 : p_w };
  }

  function refreshAllProbs() {
    const tournamentOver = SELECTED_SNAP < 0 && !!LIVE_BRACKET?.F?.[0]?.winner;
    for (const [name, pos] of Object.entries(TEAM_POS))
      LIVE_PROBS[name] = computeTeamProbs(name, pos.side, pos.r32Mi);
    for (const [name, boxes] of Object.entries(BOXES)) {
      const w = LIVE_PROBS[name]?.W;
      if (w == null) continue;
      for (const { el } of boxes) {
        const probEl = el.querySelector('.team-win-prob');
        const barEl  = el.querySelector('.prob-bar');
        if (probEl) probEl.textContent = tournamentOver ? '' : pct(w);
        if (barEl)  { barEl.style.width = tournamentOver ? '0' : (w * 100).toFixed(1) + '%'; barEl.style.background = getTeamColor(name); }
      }
    }
    if (activeTeam) updateCenter(activeTeam);
    drawDefaultPath();
  }

  // ── Outcome indicators (✓/✗ badges at bracket junctures) ───────────────────

  // Return the pairwise matrix from BEFORE a given round started, so badges
  // reflect out-of-sample predictions rather than a model trained on the result.
  // Round → snapshot index: R32→0, R16→1, QF→2, SF→3, F→4.
  function _preRoundMatrix(roundKey) {
    const idx = { R32: 0, R16: 1, QF: 2, SF: 3, F: 4 }[roundKey];
    if (idx === undefined || !HISTORY?.snapshots?.[idx]) return DATA.pairwise_ko;
    const snap = HISTORY.snapshots[idx];
    return snap[`pairwise_ko_${ACTIVE_MATRIX}`] ?? snap.pairwise_ko ?? DATA.pairwise_ko;
  }

  function applyOutcomeIndicators() {
    clearOutcomeIndicators();
    const tournamentOver = SELECTED_SNAP < 0 && !!LIVE_BRACKET?.F?.[0]?.winner;
    // Badges only in snapshot projected view or when tournament is fully complete
    const showBadges = tournamentOver || (SELECTED_SNAP >= 0 && PROJECTED_MODE && !RANDOM_MODE);
    if (!showBadges) return;
    const { nPerSide, nSideRounds, leftW, bracketH } = LAYOUT;
    const bracket = document.getElementById('bracket');
    // Deduplicate: prevent two loops from placing a badge at the same juncture
    const badgedJunctures = new Set();
    const addJunctureBadgeOnce = (cx, cy, isCorrect, opacity) => {
      const key = `${Math.round(cx)}_${Math.round(cy)}`;
      if (badgedJunctures.has(key)) return;
      badgedJunctures.add(key);
      addJunctureBadge(bracket, cx, cy, isCorrect, opacity);
    };

    // R32/R16/QF/SF: one badge per match, placed at the V-connector juncture.
    // p is taken from the pre-round snapshot so badges reflect out-of-sample predictions:
    // ✓ = model correctly predicted the winner (p >= 0.5), opacity = p
    // ✗ = upset (model favoured the loser), opacity = p(favoured loser)
    const roundMeta = {
      R32: { ri: 0, perSide: nPerSide },
      R16: { ri: 1, perSide: nPerSide / 2 },
      QF:  { ri: 2, perSide: nPerSide / 4 },
      SF:  { ri: 3, perSide: 1 },
    };
    for (const [roundKey, { ri, perSide }] of Object.entries(roundMeta)) {
      const matrix = _preRoundMatrix(roundKey);
      (DATA.bracket[roundKey] || []).forEach((match, idx) => {
        if (!match.winner) return;
        const loser = match.winner === match.team_a ? match.team_b : match.team_a;
        if (!loser) return;
        const p    = matrix?.[match.winner]?.[loser] ?? 0.5;
        const side = idx < perSide ? 'left' : 'right';
        const mi   = idx < perSide ? idx : idx - perSide;
        // Juncture = midpoint of the match connector (where the two arms converge)
        const bx   = teamX(ri, side);
        const midX = side === 'left' ? bx + C.teamW + C.colGap / 2
                                     : bx - C.colGap / 2;
        const midY = (teamY(ri, mi, 0) + teamY(ri, mi, 1)) / 2;
        const correct = p >= 0.5;
        addJunctureBadgeOnce(midX, midY, correct, correct ? p : 1 - p);
      });
    }

    // Final: badge at the T-junction (center of horizontal bar)
    const fMatch = DATA.bracket.F?.[0];
    if (fMatch?.winner) {
      const loser   = fMatch.winner === fMatch.team_a ? fMatch.team_b : fMatch.team_a;
      const matrix  = _preRoundMatrix('F');
      const p       = matrix?.[fMatch.winner]?.[loser] ?? 0.5;
      const correct = p >= 0.5;
      const { centerW } = LAYOUT;
      addJunctureBadgeOnce(leftW + centerW / 2, bracketH / 2,
                           correct, correct ? p : 1 - p);
    }

    if (SELECTED_SNAP >= 0) {
      const { centerW } = LAYOUT;

      // Projected juncture badges: rounds completed after the snapshot
      // Badge at the V-connector where model projected a winner vs what actually happened
      const projRoundMeta = {
        R32: { ri: 0, perSide: nPerSide },
        R16: { ri: 1, perSide: nPerSide / 2 },
        QF:  { ri: 2, perSide: nPerSide / 4 },
        SF:  { ri: 3, perSide: 1 },
      };
      for (const [roundKey, { ri, perSide }] of Object.entries(projRoundMeta)) {
        (LIVE_BRACKET[roundKey] || []).forEach((liveMatch, idx) => {
          if (!liveMatch.winner) return;
          const snapMatch = (DATA.bracket[roundKey] || [])[idx];
          if (snapMatch?.winner) return; // already covered by known-results badges above
          const side = idx < perSide ? 'left' : 'right';
          const mi   = idx < perSide ? idx : idx - perSide;
          // Projected winner = team that was promoted from this slot
          const nextDiv   = SLOT_ELS[`${side}_${ri + 1}_${Math.floor(mi / 2)}_${mi % 2}`];
          const projWinner = nextDiv?.dataset.team;
          if (!projWinner) return;
          const correct  = projWinner === liveMatch.winner;
          // Confidence: p(projWinner) from the two teams in the projected slot
          const ta = SLOT_ELS[`${side}_${ri}_${mi}_0`]?.dataset.team;
          const tb = SLOT_ELS[`${side}_${ri}_${mi}_1`]?.dataset.team;
          const projLoser = projWinner === ta ? tb : ta;
          const p = projLoser ? (DATA.pairwise_ko?.[projWinner]?.[projLoser] ?? 0.5) : 0.5;
          const bx   = teamX(ri, side);
          const midX = side === 'left' ? bx + C.teamW + C.colGap / 2 : bx - C.colGap / 2;
          const midY = (teamY(ri, mi, 0) + teamY(ri, mi, 1)) / 2;
          addJunctureBadgeOnce(midX, midY, correct, correct ? p : 1 - p);
        });
      }

      // Projected Final badge at the T-junction
      const liveFinal = LIVE_BRACKET.F?.[0];
      if (liveFinal?.winner && !DATA.bracket.F?.[0]?.winner) {
        const leftFin  = SLOT_ELS[`left_${nSideRounds - 1}_0_0`]?.dataset.team;
        const rightFin = SLOT_ELS[`right_${nSideRounds - 1}_0_0`]?.dataset.team;
        if (leftFin && rightFin) {
          const p = DATA.pairwise_ko?.[leftFin]?.[rightFin] ?? 0.5;
          const projWinner = p >= 0.5 ? leftFin : rightFin;
          const correct    = projWinner === liveFinal.winner;
          const conf       = Math.max(p, 1 - p);
          addJunctureBadgeOnce(leftW + centerW / 2, bracketH / 2, correct, conf);
        }
      }

    }
  }

  function addJunctureBadge(container, cx, cy, isCorrect, opacity) {
    const R = 7;
    const badge = document.createElement('div');
    badge.className = 'outcome-badge ' + (isCorrect ? 'outcome-correct' : 'outcome-wrong');
    badge.style.left    = (cx - R) + 'px';
    badge.style.top     = (cy - R) + 'px';
    badge.style.opacity = Math.max(0.2, opacity);
    badge.textContent   = isCorrect ? '✓' : '✗';
    container.appendChild(badge);
  }

  function clearOutcomeIndicators() {
    document.querySelectorAll('.outcome-badge').forEach(el => el.remove());
  }

  function clearDefaultPath() {
    defaultPathEls.forEach(e => { if (e._bg) e._bg.remove(); e.remove(); });
    defaultPathEls = [];
    document.querySelectorAll('.team-box').forEach(el => {
      el.classList.remove('dimmed', 'highlighted');
      el.style.borderColor = ''; el.style.boxShadow = '';
    });
    resetCenter();
  }

  function drawDefaultPath() {
    clearDefaultPath();
    if (activeTeam) return;
    if (SELECTED_SNAP < 0 && LIVE_BRACKET?.F?.[0]?.winner) {
      if (CHOSEN_CHAMPION) updateCenter(CHOSEN_CHAMPION);  // show winner, no path
      return;
    }
    if (PROJECTED_MODE || RANDOM_MODE) {
      if (PROJECTION_CENTER) updateCenter(PROJECTION_CENTER);
      return;
    }
    let name;
    if (CHOSEN_CHAMPION && LIVE_PROBS[CHOSEN_CHAMPION]) {
      name = CHOSEN_CHAMPION;
    } else {
      const entry = Object.entries(LIVE_PROBS)
        .reduce((best, [n, p]) => (!best || p.W > best[1].W) ? [n, p] : best, null);
      if (!entry) return;
      name = entry[0];
    }
    const teamColor = getTeamColor(name);
    (BOXES[name] || []).forEach(({ el }) => {
      el.classList.add('highlighted');
      el.style.borderColor = teamColor;
      el.style.boxShadow = `0 0 0 2px ${teamColor}30`;
    });
    updateCenter(name);
    const prevHl = hlEls; hlEls = [];
    drawTeamPath(name);
    defaultPathEls = hlEls; hlEls = prevHl;
  }

  // ── Hover interaction ─────────────────────────────────────────────────────
  function onHover(name) {
    if (SELECTED_SNAP < 0 && LIVE_BRACKET?.F?.[0]?.winner) return;  // complete view: no hover highlights
    if (activeTeam === name) return;
    clearDefaultPath(); defaultPathEls = [];
    hlEls.forEach(e => { if (e._bg) e._bg.remove(); e.remove(); });
    hlEls = [];
    activeTeam = name;
    document.getElementById('conn-svg').style.zIndex = 5;  // above outcome badges (z-index 2)
    document.querySelectorAll('.team-box[data-team]').forEach(el => {
      if (el.dataset.team && el.dataset.team !== name) el.classList.add('dimmed');
    });
    const teamColor = getTeamColor(name);
    (BOXES[name] || []).forEach(({ el }) => {
      el.classList.add('highlighted');
      el.style.borderColor = teamColor;
      el.style.boxShadow = `0 0 0 2px ${teamColor}30`;
    });
    drawTeamPath(name);
    updateCenter(name);
  }

  function onLeave() {
    if (!activeTeam) return;
    activeTeam = null;
    document.getElementById('conn-svg').style.zIndex = '1';
    hlEls.forEach(e => { if (e._bg) e._bg.remove(); e.remove(); });
    hlEls = [];
    drawDefaultPath();
  }

  // ── Path drawing ──────────────────────────────────────────────────────────
  function drawTeamPath(name) {
    const svg = document.getElementById('conn-svg');
    if (!DATA.teams[name]) return;
    const { nPerSide, bracketH, leftW, centerW } = LAYOUT;
    const r32 = DATA.bracket.R32;
    const r32Idx = r32.findIndex(m => m.team_a === name || m.team_b === name);
    if (r32Idx < 0) return;
    const side    = r32Idx < nPerSide ? 'left' : 'right';
    const isRight = side === 'right';
    const r32Mi   = isRight ? r32Idx - nPerSide : r32Idx;
    const r32Pos  = r32[r32Idx].team_a === name ? 0 : 1;
    const r16Mi   = Math.floor(r32Mi / 2);
    const r16Pos  = r32Mi % 2;
    const qfMi    = Math.floor(r16Mi / 2);
    const qfPos   = r16Mi % 2;
    const sfPos   = qfMi;
    const path = [
      { ri: 0, mi: r32Mi, pi: r32Pos, probAfter: 'R16' },
      { ri: 1, mi: r16Mi, pi: r16Pos, probAfter: 'QF'  },
      { ri: 2, mi: qfMi,  pi: qfPos,  probAfter: 'SF'  },
      { ri: 3, mi: 0,     pi: sfPos,  probAfter: 'F'   },
      { ri: LAYOUT.nSideRounds - 1, mi: 0, pi: 0, probAfter: 'W' },
    ];
    const probs = LIVE_PROBS[name] || DATA.teams[name].probs;
    const teamColor = getTeamColor(name);

    // Skip segments for rounds the team has already won
    let startIdx = 0;
    for (let i = 0; i < path.length - 1; i++) {
      const cur = path[i];
      if (USER_PICKS[`${side}_${cur.ri}_${cur.mi}`] === name) startIdx = i + 1;
      else break;
    }

    for (let i = startIdx; i < path.length - 1; i++) {
      const cur = path[i], next = path[i + 1];
      const curY      = teamY(cur.ri, cur.mi, cur.pi);
      const matchTopY = teamY(cur.ri, cur.mi, 0);
      const matchBotY = teamY(cur.ri, cur.mi, 1);
      const midY      = (matchTopY + matchBotY) / 2;
      const nextY     = teamY(next.ri, next.mi, next.pi);
      const bx = teamX(cur.ri, side);
      let edgeX, midX, nextEdgeX;
      if (!isRight) {
        edgeX = bx + C.teamW; midX = edgeX + C.colGap / 2; nextEdgeX = bx + C.colW;
      } else {
        edgeX = bx; midX = edgeX - C.colGap / 2; nextEdgeX = bx - C.colGap;
      }
      const sw = probToStroke(probs[cur.probAfter]);
      let d = `M ${edgeX} ${curY} H ${midX} V ${midY} H ${nextEdgeX}`;
      if (Math.abs(midY - nextY) > 0.5) d += ` V ${nextY}`;
      hlEls.push(svgPathHL(svg, d, sw, teamColor));
      const prob = probs[cur.probAfter];
      if (prob !== undefined) {
        const labelX = (midX + nextEdgeX) / 2;
        const t = svgText(svg, labelX, midY, pct(prob), 'path-prob-label');
        t.style.fill = teamColor;
        hlEls.push(t);
      }
    }
    const finRi = LAYOUT.nSideRounds - 1;
    const finX  = teamX(finRi, side);
    const finY  = bracketH / 2;
    const finEdgeX    = isRight ? finX : finX + C.teamW;
    const centerEdgeX = leftW + centerW / 2;
    // Trace horizontal across center gap then up the vertical T-stem
    hlEls.push(svgPathHL(svg,
      `M ${finEdgeX} ${finY} H ${centerEdgeX} V ${finY - C.stemH}`,
      probToStroke(probs.W), teamColor));
  }

  // ── Center panel ──────────────────────────────────────────────────────────
  function updateCenter(name) {
    const td = DATA.teams[name];
    if (!td) return;
    const w = LIVE_PROBS[name]?.W ?? td.probs?.W ?? 0;
    document.getElementById('center-hint').style.display = 'none';
    document.getElementById('center-team-flag').innerHTML =
      td.iso ? `<img src="https://flagcdn.com/40x30/${td.iso}.png" alt="">` : (td.flag ?? '');
    document.getElementById('center-team-name').textContent = name;
    const tournamentOver = SELECTED_SNAP < 0 && !!LIVE_BRACKET?.F?.[0]?.winner;
    const probEl = document.getElementById('center-prob-value');
    probEl.textContent = tournamentOver ? '' : pct(w);
    probEl.style.color = getTeamColor(name);
    document.getElementById('center-prob-label').style.display = tournamentOver ? 'none' : '';
  }
  function resetCenter() {
    if (SELECTED_SNAP < 0 && LIVE_BRACKET?.F?.[0]?.winner) return;  // complete view: keep champion display
    document.getElementById('center-hint').style.display = '';
    document.getElementById('center-team-flag').innerHTML = '';
    document.getElementById('center-team-name').textContent = '';
    const probEl = document.getElementById('center-prob-value');
    probEl.textContent = ''; probEl.style.color = '';
    document.getElementById('center-prob-label').style.display = 'none';
  }

  // ── SVG helpers ───────────────────────────────────────────────────────────
  const NS = 'http://www.w3.org/2000/svg';

  function svgLine(svg, x1, y1, x2, y2, cls) {
    const el = document.createElementNS(NS, 'line');
    el.setAttribute('x1', x1); el.setAttribute('y1', y1);
    el.setAttribute('x2', x2); el.setAttribute('y2', y2);
    el.setAttribute('class', cls);
    svg.appendChild(el); return el;
  }

  function svgPathHL(svg, d, sw, color) {
    const el = document.createElementNS(NS, 'path');
    el.setAttribute('d', d); el.setAttribute('class', 'conn-hl');
    el.setAttribute('stroke-linejoin', 'round'); el.setAttribute('stroke-linecap', 'round');
    el.style.strokeWidth = sw + 'px'; el.style.stroke = color;
    svg.appendChild(el); return el;
  }

  function svgText(svg, x, y, text, cls) {
    const bg = document.createElementNS(NS, 'rect');
    const tw = text.length * 5.5 + 8;
    bg.setAttribute('x', x - tw / 2); bg.setAttribute('y', y - 8);
    bg.setAttribute('width', tw); bg.setAttribute('height', 14);
    bg.setAttribute('rx', 3); bg.setAttribute('fill', '#fff');
    svg.appendChild(bg);
    const el = document.createElementNS(NS, 'text');
    el.setAttribute('x', x); el.setAttribute('y', y);
    el.setAttribute('class', cls); el.textContent = text;
    svg.appendChild(el); el._bg = bg; return el;
  }

  function pct(v) { return v == null ? '' : Math.round(v * 100) + '%'; }
  function probToStroke(p) { return 1 + 8 * (p ?? 0); }

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', init);
  else
    init();
})();
