/* bracket.js — generic tournament bracket visualisation
 * Reads predictions.json and renders a FiveThirtyEight-style bracket.
 * Hover over any team to see their path highlighted with round-by-round
 * advancement probabilities. Click a team to advance them; probabilities
 * update analytically via the pairwise KO matrix in predictions.json.
 */

(() => {
  'use strict';

  // ── Layout config ────────────────────────────────────────────────────────
  const C = {
    slotH:   36,
    teamH:   25,
    teamW:   120,
    colGap:  22,
    centerW: 130,
  };
  C.colW = C.teamW + C.colGap;

  // ── Team colours (primary kit / flag colour) ──────────────────────────────
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
  };

  function getTeamColor(name) {
    return TEAM_COLORS[name] ?? '#888';
  }

  // ── State ────────────────────────────────────────────────────────────────
  let DATA          = null;
  let LAYOUT        = {};
  let BOXES         = {};   // teamName → [{ el, roundKey, roundIdx, side, matchIdx, pos }]
  let SLOT_ELS      = {};   // `${side}_${ri}_${mi}_${pos}` → div element
  let USER_PICKS    = {};   // `${side}_${ri}_${mi}` → team name
  let TEAM_POS      = {};   // teamName → { side, r16Mi }
  let LIVE_PROBS    = {};   // teamName → { R16, QF, SF, F, W }
  let activeTeam    = null;
  let hlEls         = [];
  let defaultPathEls = [];
  let PROJECTED_MODE  = false;
  let PROJECTED_FILLS = new Set();  // slot keys filled by projected mode
  let ACTIVE_MATRIX   = 'ds_pele';  // 'ds' | 'ds_pele' | 'pele'

  // ── Entry ────────────────────────────────────────────────────────────────
  async function init() {
    try {
      DATA = await fetch('predictions.json').then(r => r.json());
    } catch (e) {
      document.getElementById('error').textContent =
        'Could not load predictions.json — ' + e.message;
      return;
    }
    // Default active matrix
    DATA.pairwise_ko = DATA.pairwise_ko_ds_pele ?? DATA.pairwise_ko;

    document.getElementById('last-updated').textContent =
      'Predictions as of ' + new Date(DATA.generated_at).toUTCString();
    document.title = DATA.tournament + ' — Bracket';
    document.querySelector('header h1').textContent = DATA.tournament;

    document.getElementById('reset-btn').addEventListener('click', resetAllPicks);

    document.getElementById('projected-checkbox').addEventListener('change', e => {
      PROJECTED_MODE = e.target.checked;
      if (PROJECTED_MODE) applyProjected();
      else clearProjected();
    });

    document.querySelectorAll('input[name="model"]').forEach(radio => {
      radio.addEventListener('change', e => {
        switchMatrix(e.target.value);
      });
    });

    computeLayout();
    buildRoundLabels();
    buildBracket();
    applyKnownResults();
    refreshAllProbs();
  }

  // ── Layout math ──────────────────────────────────────────────────────────
  function computeLayout() {
    const r16 = DATA.bracket.R16;
    const nR16 = r16.length;
    const nPerSide = nR16 / 2;
    const nSlots = nPerSide * 2;
    const nSideRounds = Math.log2(nPerSide) + 2;
    const bracketH = nSlots * C.slotH;
    const leftW    = nSideRounds * C.colW;
    const centerW  = C.centerW;
    const totalW   = leftW * 2 + centerW;
    LAYOUT = { nR16, nPerSide, nSlots, nSideRounds, bracketH, leftW, centerW, totalW };
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
    const roundKeys = ['R16', 'QF', 'SF', 'F'];

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
    const { bracketH, leftW, totalW } = LAYOUT;
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

    renderSide('left',  b.R16.slice(0, nPerSide), b.QF.slice(0, nPerSide / 2), b.SF.slice(0, 1), bracket);
    renderSide('right', b.R16.slice(nPerSide),    b.QF.slice(nPerSide / 2),    b.SF.slice(1),    bracket);

    drawFinalistToCenter(svg);
    buildCenterPanel(bracket);

    const { nPerSide: nps } = LAYOUT;
    b.R16.forEach((match, idx) => {
      const side  = idx < nps ? 'left' : 'right';
      const r16Mi = idx < nps ? idx : idx - nps;
      if (match.team_a) TEAM_POS[match.team_a] = { side, r16Mi };
      if (match.team_b) TEAM_POS[match.team_b] = { side, r16Mi };
    });
  }

  function renderSide(side, r16Matches, qfMatches, sfMatches, bracket) {
    const rounds = [
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
      div.onclick = (e) => { e.stopPropagation(); onClickAdvance(name, side, roundIdx, matchIdx); };
      if (!BOXES[name]) BOXES[name] = [];
      BOXES[name].push({ el: div, roundKey, roundIdx, side, matchIdx, pos });
    }

    SLOT_ELS[`${side}_${roundIdx}_${matchIdx}_${pos}`] = div;
    bracket.appendChild(div);
  }

  // ── Base connector lines ──────────────────────────────────────────────────
  function drawBaseConnectors(svg, b, nPerSide) {
    const sides = {
      left:  { r16: b.R16.slice(0, nPerSide), qf: b.QF.slice(0, nPerSide/2), sf: b.SF.slice(0,1) },
      right: { r16: b.R16.slice(nPerSide),    qf: b.QF.slice(nPerSide/2),    sf: b.SF.slice(1)   },
    };
    ['left','right'].forEach(side => {
      [{ ri:0, matches: sides[side].r16 },
       { ri:1, matches: sides[side].qf  },
       { ri:2, matches: sides[side].sf  }].forEach(({ ri, matches }) => {
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
      edgeX     = bx + C.teamW;
      midX      = edgeX + C.colGap / 2;
      nextEdgeX = bx + C.colW;
    } else {
      edgeX     = bx;
      midX      = edgeX - C.colGap / 2;
      nextEdgeX = bx - C.colGap;
    }
    svgLine(svg, edgeX, topY, midX, topY, cls);
    svgLine(svg, edgeX, botY, midX, botY, cls);
    svgLine(svg, midX, topY, midX, botY, cls);
    svgLine(svg, midX, midY, nextEdgeX, midY, cls);
  }

  function drawFinalistToCenter(svg) {
    const { leftW, centerW, bracketH, nSideRounds } = LAYOUT;
    const midY  = bracketH / 2;
    const finRi = nSideRounds - 1;
    svgLine(svg, teamX(finRi, 'left') + C.teamW, midY, leftW, midY, 'conn-base');
    svgLine(svg, teamX(finRi, 'right'), midY, leftW + centerW, midY, 'conn-base');
  }

  // ── Center panel ──────────────────────────────────────────────────────────
  function buildCenterPanel(bracket) {
    const { leftW, centerW, bracketH } = LAYOUT;
    const panel = document.getElementById('center-panel');
    panel.style.left   = leftW + 'px';
    panel.style.width  = centerW + 'px';
    panel.style.top    = '0';
    panel.style.height = bracketH + 'px';
  }

  // ── Click-to-advance ──────────────────────────────────────────────────────
  function onClickAdvance(name, side, ri, mi) {
    const pickKey = `${side}_${ri}_${mi}`;
    if (USER_PICKS[pickKey] === name) return;
    if (PROJECTED_MODE) { clearProjected(); }
    clearDownstreamPicks(side, ri, mi);
    USER_PICKS[pickKey] = name;
    for (const p of [0, 1]) {
      const div = SLOT_ELS[`${side}_${ri}_${mi}_${p}`];
      if (!div || !div.dataset.team) continue;
      div.classList.toggle('user-winner', div.dataset.team === name);
      div.classList.toggle('user-loser',  div.dataset.team !== name);
    }
    const nextRi  = ri + 1;
    const nextMi  = Math.floor(mi / 2);
    const nextPos = mi % 2;
    if (nextRi < LAYOUT.nSideRounds) promoteToSlot(side, nextRi, nextMi, nextPos, name);
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
    const nextRi  = ri + 1;
    const nextMi  = Math.floor(mi / 2);
    const nextPos = mi % 2;
    if (nextRi < LAYOUT.nSideRounds) {
      clearDownstreamPicks(side, nextRi, nextMi);
      resetSlotToTBD(side, nextRi, nextMi, nextPos);
    }
  }

  function resetAllPicks() {
    clearProjected();
    const { nPerSide } = LAYOUT;
    for (const side of ['left', 'right']) {
      for (let mi = 0; mi < nPerSide; mi++) {
        clearDownstreamPicks(side, 0, mi);
      }
    }
    applyKnownResults();
    if (PROJECTED_MODE) applyProjected();
    refreshAllProbs();
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
    div.style.cursor  = 'pointer';
    div.onmouseenter  = () => onHover(name);
    div.onmouseleave  = onLeave;
    div.onclick       = (e) => { e.stopPropagation(); onClickAdvance(name, side, ri, mi); };
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
    div.dataset.team  = '';
    div.classList.add('tbd');
    div.classList.remove('user-winner', 'user-loser', 'projected');
    div.innerHTML     = '<span class="team-name tbd-text">TBD</span>';
    div.style.cursor  = 'default';
    div.onmouseenter  = null;
    div.onmouseleave  = null;
    div.onclick       = null;
  }

  // ── Projected mode ────────────────────────────────────────────────────────

  function applyProjected() {
    const finalists = {};
    for (const side of ['left', 'right']) {
      const { nPerSide, nSideRounds } = LAYOUT;
      const finRi = nSideRounds - 1;

      // Compute projected R16 winners (already filled in boxes, just pick favorites)
      const roundWinners = [];
      const r0 = [];
      for (let mi = 0; mi < nPerSide; mi++) {
        const pickKey = `${side}_0_${mi}`;
        if (USER_PICKS[pickKey]) {
          r0.push(USER_PICKS[pickKey]);
        } else {
          const match = getR16Match(side, mi);
          const ta = match?.team_a, tb = match?.team_b;
          if (ta && tb) {
            r0.push((DATA.pairwise_ko?.[ta]?.[tb] ?? 0.5) >= 0.5 ? ta : tb);
          } else {
            r0.push(ta || tb || null);
          }
        }
      }
      roundWinners[0] = r0;

      // Fill QF, SF slots; compute projected winners at each level
      for (let ri = 1; ri < finRi; ri++) {
        const prev = roundWinners[ri - 1];
        const nMatches = Math.floor(prev.length / 2);
        const cur = [];
        for (let mi = 0; mi < nMatches; mi++) {
          const teamA = prev[mi * 2];
          const teamB = prev[mi * 2 + 1];
          // Fill the two team boxes for this match slot
          for (const [pos, team] of [[0, teamA], [1, teamB]]) {
            if (!team) continue;
            const key = `${side}_${ri}_${mi}_${pos}`;
            const div = SLOT_ELS[key];
            if (div && !div.dataset.team) promoteToSlotProjected(side, ri, mi, pos, team);
          }
          // Projected winner
          const pickKey = `${side}_${ri}_${mi}`;
          if (USER_PICKS[pickKey]) {
            cur.push(USER_PICKS[pickKey]);
          } else if (teamA && teamB) {
            const p = DATA.pairwise_ko?.[teamA]?.[teamB] ?? 0.5;
            cur.push(p >= 0.5 ? teamA : teamB);
          } else {
            cur.push(teamA || teamB || null);
          }
        }
        roundWinners[ri] = cur;
      }

      // Fill finalist slot with projected SF winner
      const sfWinner = roundWinners[finRi - 1]?.[0];
      if (sfWinner) {
        const key = `${side}_${finRi}_0_0`;
        const div = SLOT_ELS[key];
        if (div && !div.dataset.team) promoteToSlotProjected(side, finRi, 0, 0, sfWinner);
        finalists[side] = sfWinner;
      }
    }

    // Compute and display projected champion
    const { left: teamA, right: teamB } = finalists;
    if (teamA && teamB && !activeTeam) {
      const p = DATA.pairwise_ko?.[teamA]?.[teamB] ?? 0.5;
      const champion = p >= 0.5 ? teamA : teamB;
      updateCenter(champion);
    }
  }

  function clearProjected() {
    if (!activeTeam) drawDefaultPath();
    for (const key of PROJECTED_FILLS) {
      const parts = key.split('_');
      // key format: side_ri_mi_pos  (side may be 'left' or 'right' — both single-word)
      const side = parts[0], ri = +parts[1], mi = +parts[2], pos = +parts[3];
      resetSlotToTBD(side, ri, mi, pos);
    }
    PROJECTED_FILLS.clear();
  }

  function promoteToSlotProjected(side, ri, mi, pos, name) {
    const key = `${side}_${ri}_${mi}_${pos}`;
    const div = SLOT_ELS[key];
    if (!div || div.dataset.team) return;
    const prev = div.dataset.team;
    if (prev && BOXES[prev]) BOXES[prev] = BOXES[prev].filter(b => b.el !== div);
    div.dataset.team = name;
    div.classList.remove('tbd');
    div.classList.add('projected');
    fillBoxContent(div, name);
    div.style.cursor  = 'pointer';
    div.onmouseenter  = () => onHover(name);
    div.onmouseleave  = onLeave;
    div.onclick       = (e) => {
      e.stopPropagation();
      // Convert projected pick to user pick: clear projected first
      clearProjected();
      document.getElementById('projected-checkbox').checked = false;
      PROJECTED_MODE = false;
      onClickAdvance(name, side, ri, mi);
    };
    if (!BOXES[name]) BOXES[name] = [];
    BOXES[name].push({ el: div, roundKey: 'PROJECTED', roundIdx: ri, side, matchIdx: mi, pos });
    PROJECTED_FILLS.add(key);
  }

  // ── Model switch ──────────────────────────────────────────────────────────

  function switchMatrix(key) {
    ACTIVE_MATRIX = key;
    if (key === 'ds')         DATA.pairwise_ko = DATA.pairwise_ko_ds      ?? DATA.pairwise_ko;
    else if (key === 'ds_pele') DATA.pairwise_ko = DATA.pairwise_ko_ds_pele ?? DATA.pairwise_ko;
    else                        DATA.pairwise_ko = DATA.pairwise_ko_pele    ?? DATA.pairwise_ko;
    if (PROJECTED_MODE) { clearProjected(); applyProjected(); }
    refreshAllProbs();
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
    bar.className        = 'prob-bar';
    bar.style.width      = (w * 100).toFixed(1) + '%';
    bar.style.background = getTeamColor(name);
    div.appendChild(bar);
  }

  // ── Conditional probability engine ────────────────────────────────────────

  function getR16Match(side, mi) {
    const { nPerSide } = LAYOUT;
    return DATA.bracket.R16[side === 'left' ? mi : nPerSide + mi];
  }

  function matchWinnerDist(side, ri, mi) {
    const pickKey = `${side}_${ri}_${mi}`;
    if (USER_PICKS[pickKey]) return { [USER_PICKS[pickKey]]: 1.0 };

    if (ri === 0) {
      const match = getR16Match(side, mi);
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

  function computeTeamProbs(name, side, r16Mi) {
    const qfMi      = Math.floor(r16Mi / 2);
    const otherSide = side === 'left' ? 'right' : 'left';

    const p_qf = matchWinnerDist(side, 0, r16Mi)[name] ?? 0;
    const p_sf = matchWinnerDist(side, 1, qfMi)[name]  ?? 0;
    const p_f  = matchWinnerDist(side, 2, 0)[name]     ?? 0;

    const finalDist = matchWinnerDist(otherSide, 2, 0);
    const p_w = p_f * Object.entries(finalDist).reduce(
      (s, [opp, p]) => s + p * (DATA.pairwise_ko?.[name]?.[opp] ?? 0.5), 0
    );

    return { R16: 1.0, QF: p_qf, SF: p_sf, F: p_f, W: p_w };
  }

  function refreshAllProbs() {
    for (const [name, pos] of Object.entries(TEAM_POS)) {
      LIVE_PROBS[name] = computeTeamProbs(name, pos.side, pos.r16Mi);
    }
    for (const [name, boxes] of Object.entries(BOXES)) {
      const w = LIVE_PROBS[name]?.W;
      if (w == null) continue;
      for (const { el } of boxes) {
        const probEl = el.querySelector('.team-win-prob');
        const barEl  = el.querySelector('.prob-bar');
        if (probEl) probEl.textContent = pct(w);
        if (barEl)  { barEl.style.width = (w * 100).toFixed(1) + '%'; barEl.style.background = getTeamColor(name); }
      }
    }
    if (activeTeam) updateCenter(activeTeam);
    drawDefaultPath();
  }

  function clearDefaultPath() {
    defaultPathEls.forEach(e => { if (e._bg) e._bg.remove(); e.remove(); });
    defaultPathEls = [];
    document.querySelectorAll('.team-box').forEach(el => {
      el.classList.remove('dimmed', 'highlighted');
      el.style.borderColor = '';
      el.style.boxShadow   = '';
    });
    resetCenter();
  }

  function drawDefaultPath() {
    clearDefaultPath();
    if (activeTeam) return;
    const entry = Object.entries(LIVE_PROBS)
      .reduce((best, [n, p]) => (!best || p.W > best[1].W) ? [n, p] : best, null);
    if (!entry) return;
    const [name] = entry;
    const teamColor = getTeamColor(name);
    (BOXES[name] || []).forEach(({ el }) => {
      el.classList.add('highlighted');
      el.style.borderColor = teamColor;
      el.style.boxShadow   = `0 0 0 2px ${teamColor}30`;
    });
    updateCenter(name);
    const prevHl = hlEls;
    hlEls = [];
    drawTeamPath(name);
    defaultPathEls = hlEls;
    hlEls = prevHl;
  }

  // ── Auto-apply known results ───────────────────────────────────────────────
  function applyKnownResults() {
    const { nPerSide } = LAYOUT;
    const roundMeta = {
      R16: { ri: 0, perSide: nPerSide },
      QF:  { ri: 1, perSide: nPerSide / 2 },
      SF:  { ri: 2, perSide: 1 },
    };
    for (const [roundKey, { ri, perSide }] of Object.entries(roundMeta)) {
      const fixtures = DATA.bracket[roundKey] || [];
      fixtures.forEach((match, idx) => {
        if (!match.winner) return;
        const side = idx < perSide ? 'left' : 'right';
        const mi   = idx < perSide ? idx : idx - perSide;
        const pickKey = `${side}_${ri}_${mi}`;

        USER_PICKS[pickKey] = match.winner;

        for (const pos of [0, 1]) {
          const div = SLOT_ELS[`${side}_${ri}_${mi}_${pos}`];
          if (!div || !div.dataset.team) continue;
          div.classList.toggle('user-winner', div.dataset.team === match.winner);
          div.classList.toggle('user-loser',  div.dataset.team !== match.winner);
        }

        const nextRi  = ri + 1;
        const nextMi  = Math.floor(mi / 2);
        const nextPos = mi % 2;
        if (nextRi < LAYOUT.nSideRounds) {
          promoteToSlot(side, nextRi, nextMi, nextPos, match.winner);
        }
      });
    }
  }

  // ── Hover interaction ─────────────────────────────────────────────────────
  function onHover(name) {
    if (activeTeam === name) return;
    clearDefaultPath();
    defaultPathEls = [];
    hlEls.forEach(e => { if (e._bg) e._bg.remove(); e.remove(); });
    hlEls = [];
    activeTeam = name;
    document.getElementById('conn-svg').style.zIndex = 3;
    document.querySelectorAll('.team-box[data-team]').forEach(el => {
      if (el.dataset.team && el.dataset.team !== name) el.classList.add('dimmed');
    });
    const teamColor = getTeamColor(name);
    (BOXES[name] || []).forEach(({ el }) => {
      el.classList.add('highlighted');
      el.style.borderColor = teamColor;
      el.style.boxShadow   = `0 0 0 2px ${teamColor}30`;
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
    const r16 = DATA.bracket.R16;
    const r16Idx = r16.findIndex(m => m.team_a === name || m.team_b === name);
    if (r16Idx < 0) return;

    const side    = r16Idx < nPerSide ? 'left' : 'right';
    const isRight = side === 'right';
    const r16Mi   = isRight ? r16Idx - nPerSide : r16Idx;
    const r16Pos  = r16[r16Idx].team_a === name ? 0 : 1;
    const qfMi    = Math.floor(r16Mi / 2);
    const qfPos   = r16Mi % 2;
    const sfPos   = qfMi;

    const path = [
      { ri: 0, mi: r16Mi, pi: r16Pos, probAfter: 'QF' },
      { ri: 1, mi: qfMi,  pi: qfPos,  probAfter: 'SF' },
      { ri: 2, mi: 0,     pi: sfPos,  probAfter: 'F'  },
      { ri: LAYOUT.nSideRounds - 1, mi: 0, pi: 0, probAfter: 'W' },
    ];

    const probs    = LIVE_PROBS[name] || DATA.teams[name].probs;
    const teamColor = getTeamColor(name);

    for (let i = 0; i < path.length - 1; i++) {
      const cur  = path[i];
      const next = path[i + 1];
      const curY      = teamY(cur.ri, cur.mi, cur.pi);
      const matchTopY = teamY(cur.ri, cur.mi, 0);
      const matchBotY = teamY(cur.ri, cur.mi, 1);
      const midY      = (matchTopY + matchBotY) / 2;
      const nextY     = teamY(next.ri, next.mi, next.pi);
      const bx = teamX(cur.ri, side);
      let edgeX, midX, nextEdgeX;
      if (!isRight) {
        edgeX     = bx + C.teamW;
        midX      = edgeX + C.colGap / 2;
        nextEdgeX = bx + C.colW;
      } else {
        edgeX     = bx;
        midX      = edgeX - C.colGap / 2;
        nextEdgeX = bx - C.colGap;
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
    hlEls.push(svgPathHL(svg, `M ${finEdgeX} ${finY} H ${centerEdgeX}`, probToStroke(probs.W), teamColor));
  }

  // ── Center panel updates ──────────────────────────────────────────────────
  function updateCenter(name) {
    const td = DATA.teams[name];
    if (!td) return;
    const w = LIVE_PROBS[name]?.W ?? td.probs?.W ?? 0;
    document.getElementById('center-hint').style.display = 'none';
    document.getElementById('center-team-flag').innerHTML =
      td.iso ? `<img src="https://flagcdn.com/40x30/${td.iso}.png" alt="">` : (td.flag ?? '');
    document.getElementById('center-team-name').textContent  = name;
    const probEl = document.getElementById('center-prob-value');
    probEl.textContent = pct(w);
    probEl.style.color = getTeamColor(name);
    document.getElementById('center-prob-label').style.display = '';
  }
  function resetCenter() {
    document.getElementById('center-hint').style.display = '';
    document.getElementById('center-team-flag').innerHTML = '';
    document.getElementById('center-team-name').textContent  = '';
    const probEl = document.getElementById('center-prob-value');
    probEl.textContent = '';
    probEl.style.color = '';
    document.getElementById('center-prob-label').style.display = 'none';
  }

  // ── SVG helpers ───────────────────────────────────────────────────────────
  const NS = 'http://www.w3.org/2000/svg';

  function svgLine(svg, x1, y1, x2, y2, cls, sw) {
    const el = document.createElementNS(NS, 'line');
    el.setAttribute('x1', x1); el.setAttribute('y1', y1);
    el.setAttribute('x2', x2); el.setAttribute('y2', y2);
    el.setAttribute('class', cls);
    if (sw != null) el.style.strokeWidth = sw + 'px';
    svg.appendChild(el);
    return el;
  }

  function svgPathHL(svg, d, sw, color) {
    const el = document.createElementNS(NS, 'path');
    el.setAttribute('d', d);
    el.setAttribute('class', 'conn-hl');
    el.setAttribute('stroke-linejoin', 'round');
    el.setAttribute('stroke-linecap', 'round');
    el.style.strokeWidth = sw + 'px';
    el.style.stroke      = color;
    svg.appendChild(el);
    return el;
  }

  function svgText(svg, x, y, text, cls) {
    const bg = document.createElementNS(NS, 'rect');
    const tw = text.length * 5.5 + 8;
    bg.setAttribute('x', x - tw / 2); bg.setAttribute('y', y - 8);
    bg.setAttribute('width', tw);     bg.setAttribute('height', 14);
    bg.setAttribute('rx', 3);
    bg.setAttribute('fill', '#fff');
    svg.appendChild(bg);
    const el = document.createElementNS(NS, 'text');
    el.setAttribute('x', x); el.setAttribute('y', y);
    el.setAttribute('class', cls);
    el.textContent = text;
    svg.appendChild(el);
    el._bg = bg;
    return el;
  }

  // ── Utilities ─────────────────────────────────────────────────────────────
  function pct(v) {
    if (v == null) return '';
    return Math.round(v * 100) + '%';
  }

  function probToStroke(p) {
    return 1 + 8 * (p ?? 0);
  }

  // ── Boot ──────────────────────────────────────────────────────────────────
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', init);
  else
    init();
})();
