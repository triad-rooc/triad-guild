(() => {
  const root = document.querySelector('[data-planner]');
  if (!root) return;

  const board = root.querySelector('[data-board]');
  const tokenLayer = root.querySelector('[data-token-layer]');
  const mapImage = root.querySelector('[data-map-image]');
  const mapSelect = root.querySelector('[data-map-select]');
  const partyGrid = root.querySelector('[data-party-grid]');
  const notes = root.querySelector('[data-notes]');
  const undoButton = root.querySelector('[data-undo]');
  const redoButton = root.querySelector('[data-redo]');
  const formationName = root.querySelector('[data-formation-name]');
  const formationsEl = root.querySelector('[data-formations]');
  const title = root.querySelector('[data-board-title]');
  const subtitle = root.querySelector('[data-board-subtitle]');
  const saveState = document.querySelector('[data-save-state]');
  const eoStructure = root.querySelector('[data-eo-structure]');
  const raidVisibility = root.querySelector('[data-raid-visibility]');

  const STORAGE_KEY = 'triad-planner-v3';
  const FORMATIONS_KEY = 'triad-planner-formations-v3';
  const MAX_HISTORY = 50;

  const MAPS = {
    EO: [
      { key: 'world', label: 'World Map', src: 'assets/planner/eo-world.webp', ratio: '1648 / 928' },
      { key: 'castle', label: 'Inside Castle', src: 'assets/planner/eo-castle.webp', ratio: '1394 / 1128' },
      { key: 'emp', label: 'Emperium Room', src: 'assets/planner/eo-emperium-room.webp', ratio: '1400 / 960' },
    ],
    GL: [
      { key: 'gl', label: 'Vale of Clash', src: 'assets/planner/gl-vale-of-clash.webp', ratio: '1329 / 797' },
    ],
  };

  let history = [];
  let future = [];
  let partyFilter = null;
  let drag = null;

  const defaultPositions = () => {
    const positions = {};
    for (let raid = 1; raid <= 2; raid += 1) {
      for (let party = 1; party <= 8; party += 1) {
        for (let member = 1; member <= 5; member += 1) {
          const globalParty = raid === 1 ? party : party + 8;
          const id = `r${raid}p${party}m${member}`;
          const col = (party - 1) % 4;
          const row = Math.floor((party - 1) / 4);
          const baseX = raid === 1 ? 10 : 58;
          positions[id] = {
            x: baseX + col * 9 + (member - 1) * 1.15,
            y: 22 + row * 40 + (member - 1) * 4.3,
            raid,
            party: globalParty,
            localParty: party,
            member,
          };
        }
      }
    }
    return positions;
  };

  const defaultBoards = () => ({
    'EO:world': defaultPositions(),
    'EO:castle': defaultPositions(),
    'EO:emp': defaultPositions(),
    'GL:gl': defaultPositions(),
  });

  const loadState = () => {
    const fallback = {
      mode: 'EO',
      map: 'world',
      view: 'mega',
      raids: { 1: true, 2: true },
      reducedMotion: false,
      notes: {},
      boards: defaultBoards(),
    };
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (!saved) return fallback;
      return {
        ...fallback,
        ...saved,
        raids: { ...fallback.raids, ...(saved.raids || {}) },
        notes: { ...fallback.notes, ...(saved.notes || {}) },
        boards: { ...fallback.boards, ...(saved.boards || {}) },
      };
    } catch (_) {
      return fallback;
    }
  };

  let state = loadState();
  const boardKey = () => `${state.mode}:${state.map}`;
  const positions = () => state.boards[boardKey()];

  const cloneState = () => JSON.parse(JSON.stringify(state));
  const checkpoint = () => {
    history.push(cloneState());
    if (history.length > MAX_HISTORY) history.shift();
    future = [];
    updateHistoryButtons();
  };

  const persist = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    if (saveState) {
      saveState.textContent = 'Saved locally';
      clearTimeout(persist.timer);
      persist.timer = setTimeout(() => { saveState.textContent = 'Local autosave active'; }, 1200);
    }
  };

  const updateHistoryButtons = () => {
    undoButton.disabled = history.length === 0;
    redoButton.disabled = future.length === 0;
  };

  const colorForParty = (party) => ((party - 1) % 4) + 1;

  const buildTokens = () => {
    tokenLayer.innerHTML = '';
    Object.entries(positions()).forEach(([id, pos], index) => {
      const token = document.createElement('button');
      token.type = 'button';
      token.className = 'planner-token';
      token.dataset.tokenId = id;
      token.dataset.raid = String(pos.raid);
      token.dataset.party = String(pos.party);
      token.dataset.color = String(colorForParty(pos.party));
      token.style.left = pos.x + '%';
      token.style.top = pos.y + '%';
      token.style.setProperty('--float-delay', `${-(index % 11) * .19}s`);
      token.title = `Raid ${pos.raid} · Party ${pos.party} · Player ${pos.member}`;
      token.innerHTML = `<span>${pos.party}.${pos.member}</span>`;
      tokenLayer.appendChild(token);
    });
  };

  const buildPartyFilters = () => {
    partyGrid.innerHTML = '';
    for (let party = 1; party <= 16; party += 1) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'party-filter';
      btn.dataset.partyFilter = String(party);
      btn.style.setProperty('--party-color', ['#7aa7ff','#83d7a0','#ffd166','#d59cff'][colorForParty(party)-1]);
      btn.textContent = String(party);
      btn.title = `Show Party ${party}`;
      partyGrid.appendChild(btn);
    }
  };

  const renderMapSelect = () => {
    const maps = MAPS[state.mode];
    if (!maps.some((item) => item.key === state.map)) state.map = maps[0].key;
    mapSelect.innerHTML = maps.map((item) => `<option value="${item.key}">${item.label}</option>`).join('');
    mapSelect.value = state.map;
    const current = maps.find((item) => item.key === state.map) || maps[0];
    mapImage.src = current.src;
    mapImage.alt = `${state.mode} ${current.label} map`;
    board.style.aspectRatio = current.ratio;
  };

  const render = () => {
    renderMapSelect();
    document.querySelectorAll('[data-mode]').forEach((button) => button.classList.toggle('active', button.dataset.mode === state.mode));
    document.querySelectorAll('[data-view]').forEach((button) => button.classList.toggle('active', button.dataset.view === state.view));
    document.querySelectorAll('[data-raid-toggle]').forEach((input) => { input.checked = Boolean(state.raids[input.dataset.raid]); });

    const isEO = state.mode === 'EO';
    eoStructure.hidden = !isEO;
    raidVisibility.hidden = !isEO;
    board.dataset.view = isEO ? state.view : 'mega';
    board.classList.toggle('reduce-motion', state.reducedMotion);
    root.querySelector('[data-reduced-motion]').checked = state.reducedMotion;
    notes.value = state.notes[boardKey()] || '';

    buildTokens();

    root.querySelectorAll('.planner-token').forEach((token) => {
      const pos = positions()[token.dataset.tokenId];
      token.style.left = pos.x + '%';
      token.style.top = pos.y + '%';
      const raidHidden = isEO && state.view === 'split' && !state.raids[token.dataset.raid];
      token.classList.toggle('hidden-raid', raidHidden);
      token.classList.toggle('filtered', partyFilter !== null && Number(token.dataset.party) !== partyFilter);
    });

    root.querySelectorAll('[data-party-filter]').forEach((button) => button.classList.toggle('active', Number(button.dataset.partyFilter) === partyFilter));

    const mapMeta = MAPS[state.mode].find((item) => item.key === state.map);
    title.textContent = isEO
      ? `EO — ${mapMeta.label} — ${state.view === 'mega' ? 'Mega Raid' : '2 Raids'}`
      : `GL — ${mapMeta.label}`;
    subtitle.textContent = isEO
      ? '80 players · 16 parties · 2 raids'
      : 'Vale of Clash tactical board';

    updateHistoryButtons();
    persist();
  };

  const setState = (next) => {
    state = next;
    render();
  };

  root.addEventListener('click', (event) => {
    const mode = event.target.closest('[data-mode]');
    if (mode) {
      if (state.mode !== mode.dataset.mode) checkpoint();
      state.mode = mode.dataset.mode;
      state.map = MAPS[state.mode][0].key;
      partyFilter = null;
      render();
      return;
    }

    const view = event.target.closest('[data-view]');
    if (view) {
      if (state.view !== view.dataset.view) checkpoint();
      state.view = view.dataset.view;
      render();
      return;
    }

    const party = event.target.closest('[data-party-filter]');
    if (party) {
      const value = Number(party.dataset.partyFilter);
      partyFilter = partyFilter === value ? null : value;
      render();
      return;
    }

    if (event.target.closest('[data-clear-party-filter]')) {
      partyFilter = null;
      render();
      return;
    }

    if (event.target.closest('[data-show-all]')) {
      checkpoint();
      state.raids = { 1: true, 2: true };
      render();
      return;
    }

    if (event.target.closest('[data-reset-layout]')) {
      checkpoint();
      state.boards[boardKey()] = defaultPositions();
      render();
      return;
    }

    if (event.target.closest('[data-undo]') && history.length) {
      future.push(cloneState());
      setState(history.pop());
      return;
    }

    if (event.target.closest('[data-redo]') && future.length) {
      history.push(cloneState());
      setState(future.pop());
      return;
    }

    if (event.target.closest('[data-save-formation]')) saveFormation();

    const load = event.target.closest('[data-load-formation]');
    if (load) loadFormation(load.dataset.loadFormation);

    const remove = event.target.closest('[data-delete-formation]');
    if (remove) deleteFormation(remove.dataset.deleteFormation);
  });

  root.addEventListener('change', (event) => {
    if (event.target.matches('[data-map-select]')) {
      checkpoint();
      state.map = event.target.value;
      partyFilter = null;
      render();
      return;
    }

    const raidToggle = event.target.closest('[data-raid-toggle]');
    if (raidToggle) {
      checkpoint();
      state.raids[raidToggle.dataset.raid] = raidToggle.checked;
      render();
      return;
    }

    if (event.target.matches('[data-reduced-motion]')) {
      checkpoint();
      state.reducedMotion = event.target.checked;
      render();
    }
  });

  notes.addEventListener('input', () => {
    state.notes[boardKey()] = notes.value;
    persist();
  });

  const positionFromPointer = (event) => {
    const rect = board.getBoundingClientRect();
    return {
      x: Math.max(2, Math.min(98, ((event.clientX - rect.left) / rect.width) * 100)),
      y: Math.max(3, Math.min(97, ((event.clientY - rect.top) / rect.height) * 100)),
    };
  };

  tokenLayer.addEventListener('pointerdown', (event) => {
    const token = event.target.closest('.planner-token');
    if (!token || token.classList.contains('filtered')) return;
    checkpoint();
    token.setPointerCapture(event.pointerId);
    token.classList.add('dragging');
    drag = { token, id: token.dataset.tokenId };
    event.preventDefault();
  });

  tokenLayer.addEventListener('pointermove', (event) => {
    if (!drag) return;
    const pos = positionFromPointer(event);
    positions()[drag.id].x = pos.x;
    positions()[drag.id].y = pos.y;
    drag.token.style.left = pos.x + '%';
    drag.token.style.top = pos.y + '%';
  });

  const endDrag = () => {
    if (!drag) return;
    drag.token.classList.remove('dragging');
    drag = null;
    persist();
  };

  tokenLayer.addEventListener('pointerup', endDrag);
  tokenLayer.addEventListener('pointercancel', endDrag);

  const getFormations = () => {
    try { return JSON.parse(localStorage.getItem(FORMATIONS_KEY) || '{}'); } catch (_) { return {}; }
  };

  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
  }[char]));

  const renderFormations = () => {
    const entries = Object.entries(getFormations());
    formationsEl.innerHTML = entries.length ? entries.map(([key, item]) => `
      <div class="formation-row">
        <span class="formation-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span>
        <button class="button" type="button" data-load-formation="${key}">Load</button>
        <button class="button" type="button" data-delete-formation="${key}">×</button>
      </div>
    `).join('') : '<span class="planner-help">No saved formations yet.</span>';
  };

  const saveFormation = () => {
    const name = formationName.value.trim();
    if (!name) {
      formationName.focus();
      return;
    }
    const formations = getFormations();
    const key = Date.now().toString(36);
    formations[key] = { name, state: cloneState() };
    localStorage.setItem(FORMATIONS_KEY, JSON.stringify(formations));
    formationName.value = '';
    renderFormations();
  };

  const loadFormation = (key) => {
    const item = getFormations()[key];
    if (!item?.state) return;
    checkpoint();
    setState(JSON.parse(JSON.stringify(item.state)));
  };

  const deleteFormation = (key) => {
    const formations = getFormations();
    delete formations[key];
    localStorage.setItem(FORMATIONS_KEY, JSON.stringify(formations));
    renderFormations();
  };

  buildPartyFilters();
  renderFormations();
  render();
})();