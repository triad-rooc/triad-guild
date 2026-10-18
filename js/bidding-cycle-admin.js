
(() => {
  const q = (selector) => document.querySelector(selector);
  const isMock = document.body.dataset.biddingMode === 'mock';
  const apiBase = isMock ? '/api/bidding-cycle?mock=1' : '/api/bidding-cycle';
  const loadUrl = isMock ? '/api/bidding-cycle?manage=1&mock=1' : '/api/bidding-cycle?manage=1';
  const workspace = q('[data-cycle-workspace]');
  const status = q('[data-cycle-status]');
  const eventsEl = q('[data-cycle-events]');
  const shortagesEl = q('[data-cycle-shortages]');
  const assignmentsEl = q('[data-cycle-assignments]');

  let state = {
    cycle: null,
    events: [],
    assignments: [],
    roster: [],
    shortages: [],
    summary: null,
    rouletteHistory: [],
  };

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }[character]));

  const formatDate = (value) => {
    if (!value) return '—';
    const date = new Date(String(value).slice(0, 10) + 'T12:00:00Z');
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const slotText = (list) => {
    if (!Array.isArray(list) || !list.length) return '—';
    const first = list[0];
    const last = list[list.length - 1];
    if (list.length === 1) return 'P' + first.page + ' S' + first.slot;
    return 'P' + first.page + ' S' + first.slot + ' → P' + last.page + ' S' + last.slot + ' (' + list.length + ')';
  };

  const setStatus = (message, type = '') => {
    if (!status) return;
    status.textContent = message;
    status.dataset.statusType = type;
  };

  const api = async (payload) => {
    const response = await fetch(apiBase, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || data.error || 'Bidding request failed.');
    return data;
  };

  const eventOptions = (selected) => {
    let html = '<option value="">Needs Reschedule</option>';
    state.events.forEach((event) => {
      html += '<option value="' + event.id + '"' + (Number(selected) === event.id ? ' selected' : '') + '>' + escapeHtml(event.label) + '</option>';
    });
    return html;
  };

  const memberOptions = (members) => {
    return members.map((member) => '<option value="' + escapeHtml(member.discordId) + '">' + escapeHtml(member.ign) + '</option>').join('');
  };

  const renderOverview = () => {
    if (!state.cycle) {
      workspace.hidden = true;
      setStatus('No bidding cycle yet. Create a draft cycle to begin.');
      return;
    }

    workspace.hidden = false;
    const cycle = state.cycle;
    q('[data-cycle-overview]').innerHTML =
      '<div><span>Cycle</span><strong>' + escapeHtml(formatDate(cycle.startDate)) + ' → ' + escapeHtml(formatDate(cycle.endDate)) + '</strong></div>' +
      '<div><span>Status</span><strong>' + escapeHtml(cycle.status.toUpperCase()) + '</strong></div>' +
      '<div><span>Scheduled</span><strong>' + (state.summary?.scheduled || 0) + ' / ' + (state.summary?.baseCapacity || 80) + '</strong></div>' +
      '<div><span>Needs Reschedule</span><strong>' + (state.summary?.needsReschedule || 0) + '</strong></div>';

    q('[data-cycle-status-select]').value = cycle.status;
    q('[data-active-limit="fragment"]').value = cycle.limits.fragment;
    q('[data-active-limit="lightDark"]').value = cycle.limits.lightDark;
    q('[data-active-limit="timeSpace"]').value = cycle.limits.timeSpace;
    q('[data-capacity-summary]').textContent = (state.summary?.totalCapacity || 0) + ' complete packages available / 80 base slots';
  };

  const renderEvents = () => {
    if (!state.cycle) return;

    eventsEl.innerHTML = state.events.map((event) => {
      const requiredFragment = event.baseCapacity * state.cycle.limits.fragment;
      const requiredLightDark = event.baseCapacity * state.cycle.limits.lightDark;
      const requiredTimeSpace = event.baseCapacity * state.cycle.limits.timeSpace;
      const used = state.assignments.filter((item) => item.eventId === event.id && item.scheduleStatus === 'scheduled').length;

      return (
        '<article class="cycle-event-card" data-event-card="' + event.id + '">' +
          '<div class="cycle-event-head">' +
            '<div><span>' + escapeHtml(event.type) + ' · EVENT ' + event.order + '</span><strong>' + escapeHtml(event.label) + '</strong><small>' + escapeHtml(formatDate(event.biddingDate)) + '</small></div>' +
            '<b>' + used + '/' + event.effectiveCapacity + '</b>' +
          '</div>' +
          '<div class="cycle-stock-grid">' +
            '<label><span>Fragments <small>need ' + requiredFragment + '</small></span><input type="number" min="0" value="' + event.stock.fragment + '" data-stock="fragment" /></label>' +
            '<label><span>Light & Dark <small>need ' + requiredLightDark + '</small></span><input type="number" min="0" value="' + event.stock.lightDark + '" data-stock="lightDark" /></label>' +
            '<label><span>Time & Space <small>need ' + requiredTimeSpace + '</small></span><input type="number" min="0" value="' + event.stock.timeSpace + '" data-stock="timeSpace" /></label>' +
          '</div>' +
          '<div class="cycle-event-foot"><span>Base ' + event.baseCapacity + ' · Stock supports ' + event.effectiveCapacity + '</span><button class="button" type="button" data-save-stock="' + event.id + '">Save Stock</button></div>' +
        '</article>'
      );
    }).join('');

    if (state.shortages?.length) {
      shortagesEl.innerHTML =
        '<div class="cycle-warning"><strong>Calendar adjustment required</strong>' +
        state.shortages.map((item) => {
          const button = item.targetEventId
            ? '<button class="button" type="button" data-confirm-move="' + escapeHtml(item.member.discordId) + '" data-target-event="' + item.targetEventId + '">Move to ' + escapeHtml(item.targetEventLabel) + '</button>'
            : '<button class="button" type="button" data-confirm-move="' + escapeHtml(item.member.discordId) + '" data-target-event="">Move to Needs Reschedule</button>';

          return '<div class="cycle-shortage-row"><span>' + escapeHtml(item.eventLabel) + ' cannot fully cover <b>' + escapeHtml(item.member.ign) + '</b>.</span>' + button + '</div>';
        }).join('') +
        '</div>';
    } else {
      shortagesEl.innerHTML = '';
    }
  };

  const renderAssignments = () => {
    const filter = q('[data-cycle-filter]');
    const previousFilter = filter.value;

    filter.innerHTML = '<option value="all">All Events</option>';
    state.events.forEach((event) => {
      filter.innerHTML += '<option value="' + event.id + '">' + escapeHtml(event.label) + '</option>';
    });
    filter.innerHTML += '<option value="reschedule">Needs Reschedule</option>';

    if ([...filter.options].some((option) => option.value === previousFilter)) filter.value = previousFilter;

    const term = String(q('[data-cycle-search]').value || '').trim().toLowerCase();
    const selectedFilter = filter.value;

    const visible = state.assignments.filter((assignment) => {
      const matchesSearch = !term || [assignment.ign, assignment.job, assignment.eventLabel].join(' ').toLowerCase().includes(term);
      const matchesEvent =
        selectedFilter === 'all' ||
        (selectedFilter === 'reschedule' && assignment.scheduleStatus === 'needs_reschedule') ||
        String(assignment.eventId) === selectedFilter;
      return matchesSearch && matchesEvent;
    });

    q('[data-cycle-assignment-count]').textContent = visible.length + ' / ' + state.assignments.length + ' members';

    if (!visible.length) {
      assignmentsEl.innerHTML = '<div class="placeholder">No members match this view.</div>';
      return;
    }

    assignmentsEl.innerHTML = visible.map((assignment) => {
      return (
        '<article class="cycle-member-row" data-member="' + escapeHtml(assignment.discordId) + '">' +
          '<div class="cycle-member-name"><span>' + escapeHtml(assignment.guildRole || 'Member') + '</span><strong>' + escapeHtml(assignment.ign) + '</strong><small>' + escapeHtml(assignment.job || '') + '</small></div>' +
          '<div><span>Event</span><strong>' + escapeHtml(assignment.eventLabel) + '</strong><small>' + (assignment.biddingDate ? escapeHtml(formatDate(assignment.biddingDate)) : 'Waiting for a complete package') + '</small></div>' +
          '<div><span>Position</span><strong>' + (assignment.bidPosition ? '#' + assignment.bidPosition : '—') + '</strong><small>' + (assignment.locked ? 'LOCKED' : 'Flexible') + '</small></div>' +
          '<div class="cycle-slot-summary"><span>Pages / Slots</span><small>Fragments: ' + escapeHtml(slotText(assignment.slotMap?.fragment)) + '</small><small>L&D: ' + escapeHtml(slotText(assignment.slotMap?.lightDark)) + '</small><small>T&S: ' + escapeHtml(slotText(assignment.slotMap?.timeSpace)) + '</small></div>' +
          '<label><span>Move</span><select data-move-select>' + eventOptions(assignment.eventId) + '</select></label>' +
          '<div class="cycle-row-actions"><button class="button" type="button" data-move-member>Move</button><button class="button" type="button" data-lock-member>' + (assignment.locked ? 'Unlock' : 'Lock') + '</button></div>' +
          '<label><span>Result</span><select data-outcome>' +
            '<option value="pending"' + (assignment.outcomeStatus === 'pending' ? ' selected' : '') + '>Pending</option>' +
            '<option value="won"' + (assignment.outcomeStatus === 'won' ? ' selected' : '') + '>Won</option>' +
            '<option value="lost"' + (assignment.outcomeStatus === 'lost' ? ' selected' : '') + '>Lost</option>' +
            '<option value="missed"' + (assignment.outcomeStatus === 'missed' ? ' selected' : '') + '>Missed</option>' +
          '</select></label>' +
        '</article>'
      );
    }).join('');
  };

  const renderSwapAndRoulette = () => {
    const scheduled = state.assignments.filter((item) => item.scheduleStatus === 'scheduled');
    q('[data-swap-a]').innerHTML = memberOptions(scheduled);
    q('[data-swap-b]').innerHTML = memberOptions(scheduled);

    q('[data-roulette-event]').innerHTML = '<option value="">No specific event</option>' +
      state.events.map((event) => '<option value="' + event.id + '">' + escapeHtml(event.label) + '</option>').join('');

    q('[data-roulette-selected]').innerHTML = memberOptions(state.roster || []);

    const history = q('[data-roulette-history]');
    if (state.rouletteHistory?.length) {
      history.innerHTML = '<div class="roulette-history-title">Recent results</div>' +
        state.rouletteHistory.map((item) => '<span>' + escapeHtml(item.ign) + ' · ' + escapeHtml(item.category || 'Extra / Excess') + '</span>').join('');
    } else {
      history.innerHTML = '';
    }
  };

  const render = () => {
    renderOverview();
    if (!state.cycle) return;
    renderEvents();
    renderAssignments();
    renderSwapAndRoulette();
  };

  const load = async () => {
    const response = await fetch(loadUrl, { credentials: 'same-origin' });
    const data = await response.json().catch(() => ({}));

    if (response.status === 403) {
      window.location.replace('/members.html');
      return;
    }
    if (!response.ok) throw new Error(data.message || 'Could not load bidding cycle.');

    state = {
      cycle: data.cycle || null,
      events: data.events || [],
      assignments: data.assignments || [],
      roster: data.roster || [],
      shortages: data.shortages || [],
      summary: data.summary || null,
      rouletteHistory: data.rouletteHistory || [],
    };
    render();
  };

  q('[data-cycle-create]')?.addEventListener('click', async () => {
    try {
      setStatus('Creating cycle...');
      await api({
        action: 'create_cycle',
        startDate: q('[data-cycle-start]').value,
        fragmentPerMember: Number(q('[data-cycle-limit="fragment"]').value),
        lightDarkPerMember: Number(q('[data-cycle-limit="lightDark"]').value),
        timeSpacePerMember: Number(q('[data-cycle-limit="timeSpace"]').value),
      });
      await load();
      setStatus(isMock ? 'Mock cycle created with Player 1–80. Live roster and live bidding data were not touched.' : 'Draft cycle created. Default stock exactly covers the base 80-member cycle.', 'success');
    } catch (error) {
      setStatus(error.message, 'error');
    }
  });

  q('[data-save-limits]')?.addEventListener('click', async () => {
    try {
      await api({
        action: 'update_limits',
        cycleId: state.cycle.id,
        fragmentPerMember: Number(q('[data-active-limit="fragment"]').value),
        lightDarkPerMember: Number(q('[data-active-limit="lightDark"]').value),
        timeSpacePerMember: Number(q('[data-active-limit="timeSpace"]').value),
      });
      await load();
      setStatus('Equal per-member limits updated.', 'success');
    } catch (error) {
      setStatus(error.message, 'error');
    }
  });

  q('[data-randomize]')?.addEventListener('click', async () => {
    if (!window.confirm(isMock ? 'Randomize Player 1–80 in the mock sandbox? Locked test players stay in their current events.' : 'Rebuild the preview using previous-cycle fairness? Locked members stay in their current events.')) return;
    try {
      setStatus('Randomizing members...');
      await api({ action: 'randomize', cycleId: state.cycle.id });
      await load();
      setStatus('Preview randomized. Review and adjust it before changing the cycle to Open.', 'success');
    } catch (error) {
      setStatus(error.message, 'error');
    }
  });

  q('[data-undo-randomize]')?.addEventListener('click', async () => {
    try {
      await api({ action: 'undo_randomize', cycleId: state.cycle.id });
      await load();
      setStatus('Last randomization restored.', 'success');
    } catch (error) {
      setStatus(error.message, 'error');
    }
  });

  q('[data-cycle-save-status]')?.addEventListener('click', async () => {
    try {
      await api({
        action: 'set_status',
        cycleId: state.cycle.id,
        status: q('[data-cycle-status-select]').value,
      });
      await load();
      setStatus('Cycle status updated.', 'success');
    } catch (error) {
      setStatus(error.message, 'error');
    }
  });

  eventsEl?.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-save-stock]');
    if (!button) return;

    const card = button.closest('[data-event-card]');
    try {
      await api({
        action: 'update_event_stock',
        cycleId: state.cycle.id,
        eventId: Number(button.dataset.saveStock),
        fragmentStock: Number(card.querySelector('[data-stock="fragment"]').value),
        lightDarkStock: Number(card.querySelector('[data-stock="lightDark"]').value),
        timeSpaceStock: Number(card.querySelector('[data-stock="timeSpace"]').value),
      });
      await load();
      setStatus('Stock saved. Capacity recalculated without reducing anyone’s package.', 'success');
    } catch (error) {
      setStatus(error.message, 'error');
    }
  });

  shortagesEl?.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-confirm-move]');
    if (!button) return;

    try {
      await api({
        action: 'move',
        cycleId: state.cycle.id,
        discordId: button.dataset.confirmMove,
        eventId: button.dataset.targetEvent ? Number(button.dataset.targetEvent) : null,
      });
      await load();
      setStatus('Suggested calendar move confirmed.', 'success');
    } catch (error) {
      setStatus(error.message, 'error');
    }
  });

  assignmentsEl?.addEventListener('click', async (event) => {
    const row = event.target.closest('[data-member]');
    if (!row) return;

    try {
      if (event.target.closest('[data-move-member]')) {
        const value = row.querySelector('[data-move-select]').value;
        await api({
          action: 'move',
          cycleId: state.cycle.id,
          discordId: row.dataset.member,
          eventId: value ? Number(value) : null,
        });
      } else if (event.target.closest('[data-lock-member]')) {
        const assignment = state.assignments.find((item) => item.discordId === row.dataset.member);
        await api({
          action: 'set_lock',
          cycleId: state.cycle.id,
          discordId: row.dataset.member,
          locked: !assignment?.locked,
        });
      } else {
        return;
      }

      await load();
      setStatus('Schedule updated.', 'success');
    } catch (error) {
      setStatus(error.message, 'error');
    }
  });

  assignmentsEl?.addEventListener('change', async (event) => {
    const select = event.target.closest('[data-outcome]');
    if (!select) return;

    const row = select.closest('[data-member]');
    try {
      await api({
        action: 'set_outcome',
        cycleId: state.cycle.id,
        discordId: row.dataset.member,
        outcome: select.value,
      });
      await load();
    } catch (error) {
      setStatus(error.message, 'error');
    }
  });

  q('[data-swap]')?.addEventListener('click', async () => {
    try {
      await api({
        action: 'swap',
        cycleId: state.cycle.id,
        a: q('[data-swap-a]').value,
        b: q('[data-swap-b]').value,
      });
      await load();
      setStatus('Assignments swapped.', 'success');
    } catch (error) {
      setStatus(error.message, 'error');
    }
  });

  q('[data-cycle-search]')?.addEventListener('input', renderAssignments);
  q('[data-cycle-filter]')?.addEventListener('change', renderAssignments);

  const runRoulette = async (animated) => {
    const display = q('[data-roulette-display]');
    const scope = q('[data-roulette-scope]').value;
    const eventValue = q('[data-roulette-event]').value;
    const selectedIds = [...q('[data-roulette-selected]').selectedOptions].map((option) => option.value);

    let timer = null;
    try {
      if (animated) {
        display.classList.add('spinning');
        const names = (state.roster || []).map((member) => member.ign);
        let index = 0;
        timer = window.setInterval(() => {
          display.textContent = names[index % Math.max(names.length, 1)] || 'TRIAD';
          index += 1;
        }, 70);
        await new Promise((resolve) => window.setTimeout(resolve, 900));
        window.clearInterval(timer);
      }

      const data = await api({
        action: 'roulette',
        cycleId: state.cycle.id,
        scope,
        eventId: eventValue ? Number(eventValue) : null,
        selectedIds,
        category: q('[data-roulette-category]').value,
        excludeWinners: q('[data-exclude-winners]').checked,
        excludeAssignedEvent: q('[data-exclude-event]').checked,
      });

      display.classList.remove('spinning');
      display.innerHTML = '<span>SELECTED</span><strong>' + escapeHtml(data.winner.ign) + '</strong><small>' + escapeHtml(data.winner.job || '') + '</small>';
      await load();
    } catch (error) {
      if (timer) window.clearInterval(timer);
      display.classList.remove('spinning');
      display.textContent = error.message;
      setStatus(error.message, 'error');
    }
  };

  q('[data-roulette-spin]')?.addEventListener('click', () => runRoulette(true));
  q('[data-roulette-quick]')?.addEventListener('click', () => runRoulette(false));

  load().catch((error) => setStatus(error.message, 'error'));
})();
