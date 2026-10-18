(() => {
  const root = document.querySelector('[data-planner]');
  if (!root) return;

  const board = root.querySelector('[data-board]');
  const mapImage = root.querySelector('[data-map-image]');
  const mapSelect = root.querySelector('[data-map-select]');
  const tokenLayer = root.querySelector('[data-token-layer]');
  const partyGrid = root.querySelector('[data-party-grid]');
  const partySplitButton = root.querySelector('[data-toggle-party-split]');
  const partyHelp = root.querySelector('[data-party-help]');
  const notes = root.querySelector('[data-notes]');
  const undoButton = root.querySelector('[data-undo]');
  const redoButton = root.querySelector('[data-redo]');
  const formationName = root.querySelector('[data-formation-name]');
  const formationsEl = root.querySelector('[data-formations]');
  const title = root.querySelector('[data-board-title]');
  const subtitle = root.querySelector('[data-board-subtitle]');
  const saveState = document.querySelector('[data-save-state]');

  const STORAGE_KEY = 'triad-planner-v4';
  const FORMATIONS_KEY = 'triad-planner-formations-v3';
  const MAX_HISTORY = 60;

  const MAPS = {
    EO: [
      { key: 'world', label: 'World Map', src: '/assets/planner/eo-world.webp', ratio: '560 / 315' },
      { key: 'castle', label: 'Inside Castle', src: '/assets/planner/eo-castle.webp', ratio: '560 / 453' },
      { key: 'emp', label: 'Emperium Room', src: '/assets/planner/eo-emperium-room.webp', ratio: '560 / 394' },
    ],
    GL: [
      { key: 'gl', label: 'Vale of Clash', src: '/assets/planner/gl-vale-of-clash.webp', ratio: '600 / 360' },
    ],
  };

  let history = [];
  let future = [];
  let selectedParty = null;
  let drag = null;

  const clamp = (value, min = 3, max = 97) => Math.max(min, Math.min(max, value));
  const clone = (value) => JSON.parse(JSON.stringify(value));

  const partyColor = (party, mode = state?.mode || 'EO') => {
    if (mode === 'EO') return Math.floor((party - 1) / 4) + 1;
    return ((party - 1) % 4) + 1;
  };

  const defaultBoard = (mode) => {
    const count = mode === 'EO' ? 16 : 8;
    const parties = {};

    for (let party = 1; party <= count; party += 1) {
      let x;
      let y;

      if (mode === 'EO') {
        const raid = party <= 8 ? 1 : 2;
        const local = raid === 1 ? party : party - 8;
        const col = (local - 1) % 4;
        const row = Math.floor((local - 1) / 4);
        x = (raid === 1 ? 10 : 56) + col * 9.5;
        y = 24 + row * 48;
      } else {
        const col = (party - 1) % 4;
        const row = Math.floor((party - 1) / 4);
        x = 24 + col * 17;
        y = 26 + row * 48;
      }

      const players = Array.from({ length: 5 }, (_, member) => ({
        x: clamp(x + (member - 2) * 2.7),
        y: clamp(y + 5),
      }));

      parties[party] = { x, y, split: false, players };
    }

    return { parties };
  };

  const fallbackState = () => ({
    mode: 'EO',
    mapByMode: { EO: 'world', GL: 'gl' },
    view: 'full',
    raids: { 1: true, 2: true },
    glRaid: 'main',
    reducedMotion: false,
    boards: {
      'EO:world': defaultBoard('EO'),
      'EO:castle': defaultBoard('EO'),
      'EO:emp': defaultBoard('EO'),
      'GL:gl:main': defaultBoard('GL'),
      'GL:gl:sub': defaultBoard('GL'),
    },
    notesByBoard: {},
  });

  const loadState = () => {
    const fallback = fallbackState();
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (!saved) return fallback;
      const savedView = saved.view === 'mega'
        ? 'full'
        : saved.view === 'split'
          ? 'raids'
          : ['full', 'raids', 'parties'].includes(saved.view)
            ? saved.view
            : fallback.view;
      const safeMode = saved.mode === 'GL' ? 'GL' : 'EO';
      const safeMapByMode = {
        EO: ['world', 'castle', 'emp'].includes(saved.mapByMode?.EO) ? saved.mapByMode.EO : fallback.mapByMode.EO,
        GL: saved.mapByMode?.GL === 'gl' ? 'gl' : fallback.mapByMode.GL,
      };
      return {
        ...fallback,
        ...saved,
        mode: safeMode,
        view: savedView,
        mapByMode: safeMapByMode,
        raids: { ...fallback.raids, ...(saved.raids || {}) },
        boards: { ...fallback.boards, ...(saved.boards || {}) },
        notesByBoard: { ...fallback.notesByBoard, ...(saved.notesByBoard || {}) },
      };
    } catch (_) {
      return fallback;
    }
  };

  let state = loadState();

  const currentMap = () => {
    const key = state.mapByMode[state.mode];
    return MAPS[state.mode].find((item) => item.key === key) || MAPS[state.mode][0];
  };

  const currentBoardKey = () => {
    const map = currentMap().key;
    return state.mode === 'GL' ? `GL:${map}:${state.glRaid}` : `EO:${map}`;
  };

  const ensureBoard = () => {
    const key = currentBoardKey();
    const expectedCount = state.mode === 'EO' ? 16 : 8;
    const boardState = state.boards[key];
    const valid = boardState
      && boardState.parties
      && Array.from({ length: expectedCount }, (_, i) => i + 1).every((partyNumber) => {
        const party = boardState.parties[partyNumber];
        return party
          && Number.isFinite(Number(party.x))
          && Number.isFinite(Number(party.y))
          && Array.isArray(party.players)
          && party.players.length === 5;
      });
    if (!valid) state.boards[key] = defaultBoard(state.mode);
    return state.boards[key];
  };

  const currentBoard = () => ensureBoard();
  const currentPartyCount = () => (state.mode === 'EO' ? 16 : 8);
  const raidForParty = (party) => (party <= 8 ? 1 : 2);

  const checkpoint = () => {
    history.push(clone(state));
    if (history.length > MAX_HISTORY) history.shift();
    future = [];
    updateHistoryButtons();
  };

  const persist = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      if (saveState) {
        saveState.textContent = 'Saved locally';
        clearTimeout(persist.timer);
        persist.timer = setTimeout(() => { saveState.textContent = 'Local autosave active'; }, 1000);
      }
    } catch (_) {}
  };

  const updateHistoryButtons = () => {
    undoButton.disabled = history.length === 0;
    redoButton.disabled = future.length === 0;
  };

  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  }[char]));

  const shiftPartyPlayers = (party, dx, dy) => {
    party.players.forEach((player) => {
      player.x = clamp(player.x + dx);
      player.y = clamp(player.y + dy);
    });
  };

  const splitParty = (partyNumber) => {
    const party = currentBoard().parties[partyNumber];
    if (!party) return;

    if (party.split) {
      party.x = party.players.reduce((sum, player) => sum + player.x, 0) / party.players.length;
      party.y = party.players.reduce((sum, player) => sum + player.y, 0) / party.players.length;
      party.split = false;
    } else {
      party.players.forEach((player, index) => {
        player.x = clamp(party.x + (index - 2) * 3.2);
        player.y = clamp(party.y + 5.5);
      });
      party.split = true;
    }
  };

  const partyNumbersForGroup = (group) => {
    if (group === 'full') return Array.from({ length: 16 }, (_, i) => i + 1);
    if (group === 'raid1') return Array.from({ length: 8 }, (_, i) => i + 1);
    if (group === 'raid2') return Array.from({ length: 8 }, (_, i) => i + 9);
    return [];
  };

  const averagePosition = (partyNumbers) => {
    const boardState = currentBoard();
    const parties = partyNumbers.map((partyNumber) => boardState.parties[partyNumber]).filter(Boolean);
    if (!parties.length) return { x: 50, y: 50 };
    return {
      x: parties.reduce((sum, party) => sum + Number(party.x), 0) / parties.length,
      y: parties.reduce((sum, party) => sum + Number(party.y), 0) / parties.length,
    };
  };

  const shiftPartyGroup = (partyNumbers, requestedDx, requestedDy) => {
    const boardState = currentBoard();
    const points = [];
    partyNumbers.forEach((partyNumber) => {
      const party = boardState.parties[partyNumber];
      if (!party) return;
      points.push({ x: Number(party.x), y: Number(party.y) });
      party.players.forEach((player) => points.push({ x: Number(player.x), y: Number(player.y) }));
    });
    if (!points.length) return { dx: 0, dy: 0 };

    const minX = Math.min(...points.map((point) => point.x));
    const maxX = Math.max(...points.map((point) => point.x));
    const minY = Math.min(...points.map((point) => point.y));
    const maxY = Math.max(...points.map((point) => point.y));

    const dx = Math.max(3 - minX, Math.min(97 - maxX, requestedDx));
    const dy = Math.max(3 - minY, Math.min(97 - maxY, requestedDy));

    partyNumbers.forEach((partyNumber) => {
      const party = boardState.parties[partyNumber];
      if (!party) return;
      party.x += dx;
      party.y += dy;
      party.players.forEach((player) => {
        player.x += dx;
        player.y += dy;
      });
    });
    return { dx, dy };
  };

  const createGroupToken = ({ group, label, position, color = 1 }) => {
    const token = document.createElement('button');
    token.type = 'button';
    token.className = `planner-token aggregate-piece ${group === 'full' ? 'full-raid-piece' : 'raid-piece'}`;
    token.dataset.group = group;
    token.dataset.color = String(color);
    token.dataset.member = '';
    token.style.left = position.x + '%';
    token.style.top = position.y + '%';
    token.style.setProperty('--float-delay', group === 'full' ? '-.6s' : group === 'raid1' ? '-.9s' : '-1.2s');
    token.innerHTML = `<span>${label}</span>`;
    token.title = group === 'full'
      ? 'Full Raid · Parties 1–16 · drag to move all parties together'
      : `${label} · drag to move all 8 parties together`;
    tokenLayer.appendChild(token);
  };

  const createToken = ({ partyNumber, member = null, position }) => {
    const token = document.createElement('button');
    token.type = 'button';
    token.className = `planner-token ${member === null ? 'party-piece' : 'player-piece'}`;
    token.dataset.party = String(partyNumber);
    token.dataset.color = String(partyColor(partyNumber, state.mode));
    token.dataset.raid = String(raidForParty(partyNumber));
    token.dataset.member = member === null ? '' : String(member);
    token.style.left = position.x + '%';
    token.style.top = position.y + '%';
    token.style.setProperty('--float-delay', `${-((partyNumber * 5 + (member || 0)) % 13) * .17}s`);
    token.classList.toggle('selected', selectedParty === partyNumber);

    if (member === null) {
      token.innerHTML = `<span>P${partyNumber}</span>`;
      token.title = `Party ${partyNumber} · drag to position · use Split selected party for players`;
    } else {
      token.innerHTML = `<span>${partyNumber}.${member}</span>`;
      token.title = `Party ${partyNumber} · Player ${member}`;
    }

    const hiddenRaid = state.mode === 'EO'
      && state.view === 'raids'
      && !state.raids[raidForParty(partyNumber)];
    token.classList.toggle('hidden-raid', hiddenRaid);

    tokenLayer.appendChild(token);
  };

  const buildTokens = () => {
    tokenLayer.innerHTML = '';
    const boardState = currentBoard();

    if (state.mode === 'EO' && state.view === 'full') {
      createGroupToken({
        group: 'full',
        label: 'FULL',
        position: averagePosition(partyNumbersForGroup('full')),
        color: 1,
      });
      return;
    }

    if (state.mode === 'EO' && state.view === 'raids') {
      if (state.raids[1]) {
        createGroupToken({
          group: 'raid1',
          label: 'R1',
          position: averagePosition(partyNumbersForGroup('raid1')),
          color: 1,
        });
      }
      if (state.raids[2]) {
        createGroupToken({
          group: 'raid2',
          label: 'R2',
          position: averagePosition(partyNumbersForGroup('raid2')),
          color: 4,
        });
      }
      return;
    }

    for (let partyNumber = 1; partyNumber <= currentPartyCount(); partyNumber += 1) {
      const party = boardState.parties[partyNumber];
      if (!party) continue;

      if (party.split) {
        party.players.forEach((player, index) => {
          createToken({ partyNumber, member: index + 1, position: player });
        });
      } else {
        createToken({ partyNumber, position: party });
      }
    }
  };

  const buildPartyGrid = () => {
    partyGrid.innerHTML = '';
    const boardState = currentBoard();

    for (let party = 1; party <= currentPartyCount(); party += 1) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'party-filter';
      button.dataset.partyFilter = String(party);
      button.style.setProperty('--party-color', ['#6f9df0', '#72bc8b', '#d9ae4b', '#a880d1'][partyColor(party, state.mode) - 1]);
      button.textContent = String(party);
      button.title = `Focus Party ${party}`;
      button.classList.toggle('active', selectedParty === party);
      button.classList.toggle('split', Boolean(boardState.parties[party]?.split));
      partyGrid.appendChild(button);
    }
  };

  const buildMapSelect = () => {
    const map = currentMap();
    mapSelect.innerHTML = MAPS[state.mode].map((item) =>
      `<option value="${escapeHtml(item.key)}" ${item.key === map.key ? 'selected' : ''}>${escapeHtml(item.label)}</option>`
    ).join('');
  };

  const updatePartyAction = () => {
    if (selectedParty === null) {
      partySplitButton.disabled = true;
      partySplitButton.textContent = 'Split selected party';
      partyHelp.textContent = 'Select a party to focus it or split it into five player pieces.';
      return;
    }

    const party = currentBoard().parties[selectedParty];
    partySplitButton.disabled = !party;
    partySplitButton.textContent = party?.split
      ? `Merge Party ${selectedParty}`
      : `Split Party ${selectedParty} into 5 players`;
    partyHelp.textContent = `Party ${selectedParty} selected. Other parties stay visible. Click the same party again or All to clear selection.`;
  };

  const render = () => {
    const map = currentMap();
    ensureBoard();

    root.querySelectorAll('[data-mode]').forEach((button) =>
      button.classList.toggle('active', button.dataset.mode === state.mode)
    );
    root.querySelectorAll('[data-view]').forEach((button) =>
      button.classList.toggle('active', button.dataset.view === state.view)
    );
    root.querySelectorAll('[data-gl-raid]').forEach((button) =>
      button.classList.toggle('active', button.dataset.glRaid === state.glRaid)
    );
    root.querySelectorAll('[data-raid-toggle]').forEach((input) => {
      input.checked = Boolean(state.raids[input.dataset.raid]);
    });
    root.querySelectorAll('[data-raid-zone]').forEach((zone) => {
      const raid = zone.dataset.raidZone;
      zone.hidden = state.mode !== 'EO' || state.view !== 'raids' || !state.raids[raid];
    });
    root.querySelectorAll('[data-eo-only]').forEach((element) => { element.hidden = state.mode !== 'EO'; });
    const raidVisibilityPanel = root.querySelector('[data-eo-raid-visibility]');
    if (raidVisibilityPanel) raidVisibilityPanel.hidden = state.mode !== 'EO' || state.view !== 'raids';
    const partyPanel = root.querySelector('[data-party-panel]');
    if (partyPanel) partyPanel.hidden = state.mode === 'EO' && state.view !== 'parties';
    root.querySelectorAll('[data-gl-only]').forEach((element) => { element.hidden = state.mode !== 'GL'; });

    buildMapSelect();
    mapImage.src = map.src;
    mapImage.alt = `${state.mode} ${map.label} battle map`;
    board.style.aspectRatio = map.ratio;
    board.dataset.view = state.mode === 'EO' ? state.view : 'full';
    board.classList.toggle('reduce-motion', state.reducedMotion);
    root.querySelector('[data-reduced-motion]').checked = state.reducedMotion;

    buildTokens();
    buildPartyGrid();
    updatePartyAction();

    const key = currentBoardKey();
    notes.value = state.notesByBoard[key] || '';

    title.textContent = `${state.mode} — ${map.label}`;
    subtitle.textContent = state.mode === 'EO'
      ? `80 players · 16 parties · ${state.view === 'full' ? '1 full raid' : state.view === 'raids' ? '2 raids · 8 parties each' : '16 individual parties'}`
      : `40 players · 8 parties · ${state.glRaid === 'main' ? 'Main Raid' : 'Sub Raid'}`;

    updateHistoryButtons();
    persist();
  };

  root.addEventListener('click', (event) => {
    const mode = event.target.closest('[data-mode]');
    if (mode) {
      const nextMode = mode.dataset.mode;
      if (nextMode !== state.mode) {
        checkpoint();
        state.mode = nextMode;
        selectedParty = null;
        render();
      }
      return;
    }

    const view = event.target.closest('[data-view]');
    if (view) {
      if (state.mode === 'EO' && view.dataset.view !== state.view) {
        checkpoint();
        state.view = view.dataset.view;
        selectedParty = null;
        render();
      }
      return;
    }

    const glRaid = event.target.closest('[data-gl-raid]');
    if (glRaid) {
      if (glRaid.dataset.glRaid !== state.glRaid) {
        checkpoint();
        state.glRaid = glRaid.dataset.glRaid;
        selectedParty = null;
        render();
      }
      return;
    }

    const partyButton = event.target.closest('[data-party-filter]');
    if (partyButton) {
      const party = Number(partyButton.dataset.partyFilter);
      selectedParty = selectedParty === party ? null : party;
      render();
      return;
    }

    if (event.target.closest('[data-clear-party-filter]')) {
      selectedParty = null;
      render();
      return;
    }

    if (event.target.closest('[data-toggle-party-split]') && selectedParty !== null) {
      checkpoint();
      splitParty(selectedParty);
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
      state.boards[currentBoardKey()] = defaultBoard(state.mode);
      render();
      return;
    }

    if (event.target.closest('[data-undo]') && history.length) {
      future.push(clone(state));
      state = history.pop();
      selectedParty = null;
      render();
      return;
    }

    if (event.target.closest('[data-redo]') && future.length) {
      history.push(clone(state));
      state = future.pop();
      selectedParty = null;
      render();
      return;
    }

    if (event.target.closest('[data-save-formation]')) {
      saveFormation();
      return;
    }

    const load = event.target.closest('[data-load-formation]');
    if (load) {
      loadFormation(load.dataset.loadFormation);
      return;
    }

    const remove = event.target.closest('[data-delete-formation]');
    if (remove) deleteFormation(remove.dataset.deleteFormation);
  });

  root.addEventListener('change', (event) => {
    if (event.target.matches('[data-map-select]')) {
      checkpoint();
      state.mapByMode[state.mode] = event.target.value;
      selectedParty = null;
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
    state.notesByBoard[currentBoardKey()] = notes.value;
    persist();
  });

  const positionFromPointer = (event) => {
    const rect = board.getBoundingClientRect();
    return {
      x: clamp(((event.clientX - rect.left) / rect.width) * 100),
      y: clamp(((event.clientY - rect.top) / rect.height) * 100),
    };
  };

  tokenLayer.addEventListener('pointerdown', (event) => {
    const token = event.target.closest('.planner-token');
    if (!token) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    const group = token.dataset.group || null;
    const pointer = positionFromPointer(event);

    if (group) {
      checkpoint();
      selectedParty = null;
      token.setPointerCapture(event.pointerId);
      token.classList.add('dragging');
      drag = {
        token,
        group,
        partyNumbers: partyNumbersForGroup(group),
        last: pointer,
      };
      event.preventDefault();
      return;
    }

    const partyNumber = Number(token.dataset.party);
    const member = token.dataset.member ? Number(token.dataset.member) : null;
    const party = currentBoard().parties[partyNumber];
    if (!party) return;

    checkpoint();
    selectedParty = partyNumber;
    token.setPointerCapture(event.pointerId);
    token.classList.add('dragging');
    drag = {
      token,
      group: null,
      partyNumber,
      member,
      last: pointer,
    };
    event.preventDefault();
  });

  tokenLayer.addEventListener('pointermove', (event) => {
    if (!drag) return;
    const next = positionFromPointer(event);

    if (drag.group) {
      const requestedDx = next.x - drag.last.x;
      const requestedDy = next.y - drag.last.y;
      const moved = shiftPartyGroup(drag.partyNumbers, requestedDx, requestedDy);
      const currentLeft = parseFloat(drag.token.style.left);
      const currentTop = parseFloat(drag.token.style.top);
      drag.token.style.left = (currentLeft + moved.dx) + '%';
      drag.token.style.top = (currentTop + moved.dy) + '%';
      drag.last = {
        x: drag.last.x + moved.dx,
        y: drag.last.y + moved.dy,
      };
      return;
    }

    const party = currentBoard().parties[drag.partyNumber];

    if (drag.member === null) {
      const dx = next.x - party.x;
      const dy = next.y - party.y;
      party.x = next.x;
      party.y = next.y;
      shiftPartyPlayers(party, dx, dy);
    } else {
      const player = party.players[drag.member - 1];
      player.x = next.x;
      player.y = next.y;
    }

    drag.token.style.left = next.x + '%';
    drag.token.style.top = next.y + '%';
    drag.last = next;
  });

  const endDrag = () => {
    if (!drag) return;
    drag.token.classList.remove('dragging');
    drag = null;
    render();
  };

  tokenLayer.addEventListener('pointerup', endDrag);
  tokenLayer.addEventListener('pointercancel', endDrag);

  const getFormations = () => {
    try { return JSON.parse(localStorage.getItem(FORMATIONS_KEY) || '{}'); }
    catch (_) { return {}; }
  };

  const renderFormations = () => {
    const formations = getFormations();
    const entries = Object.entries(formations);
    formationsEl.innerHTML = entries.length
      ? entries.map(([key, item]) => `
          <div class="formation-row">
            <span class="formation-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span>
            <button class="button" type="button" data-load-formation="${key}">Load</button>
            <button class="button" type="button" data-delete-formation="${key}" aria-label="Delete ${escapeHtml(item.name)}">×</button>
          </div>
        `).join('')
      : '<span class="planner-help">No saved formations yet.</span>';
  };

  const saveFormation = () => {
    const name = formationName.value.trim();
    if (!name) {
      formationName.focus();
      return;
    }
    const formations = getFormations();
    const key = Date.now().toString(36);
    formations[key] = { name, state: clone(state) };
    localStorage.setItem(FORMATIONS_KEY, JSON.stringify(formations));
    formationName.value = '';
    renderFormations();
  };

  const loadFormation = (key) => {
    const item = getFormations()[key];
    if (!item?.state) return;
    checkpoint();
    state = clone(item.state);
    selectedParty = null;
    render();
  };

  const deleteFormation = (key) => {
    const formations = getFormations();
    delete formations[key];
    localStorage.setItem(FORMATIONS_KEY, JSON.stringify(formations));
    renderFormations();
  };

  mapImage.addEventListener('error', () => {
    if (saveState) saveState.textContent = 'Map asset failed to load';
  });

  renderFormations();
  render();
})();