(() => {
  const q = (selector) => document.querySelector(selector);
  const qa = (selector) => [...document.querySelectorAll(selector)];
  const view = document.body.dataset.mockBiddingView || 'calendar';

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  }[character]));

  const formatDate = (value) => {
    if (!value) return '—';
    const date = new Date(String(value).slice(0, 10) + 'T12:00:00Z');
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const slotText = (list) => {
    if (!Array.isArray(list) || !list.length) return '—';
    const first = list[0];
    const last = list[list.length - 1];
    if (list.length === 1) return 'P' + first.page + ' S' + first.slot;
    return 'P' + first.page + ' S' + first.slot + ' → P' + last.page + ' S' + last.slot;
  };

  let state = { cycle: null, events: [], assignments: [], roster: [], requests: [] };

  const api = async (payload) => {
    const response = await fetch('/api/bidding-cycle?mock=1', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || data.error || 'Request failed.');
    return data;
  };

  const latestRequestByMember = () => {
    const map = new Map();
    for (const item of state.requests || []) {
      if (!map.has(item.discordId)) map.set(item.discordId, item);
    }
    return map;
  };

  const responseBadge = (request) => {
    if (!request) return '';
    if (request.responseType === 'can_bid') return '<span class="bid-response-badge can">CAN BID</span>';
    if (request.responseType === 'cannot_bid') return '<span class="bid-response-badge cannot">CANNOT BID</span>';
    return '<span class="bid-response-badge change">CHANGE REQUESTED</span>';
  };

  const renderCalendar = () => {
    const container = q('[data-mock-calendar]');
    if (!container) return;
    if (!state.cycle) {
      container.innerHTML = '<div class="placeholder">No mock cycle yet.</div>';
      return;
    }

    const latest = latestRequestByMember();
    const groups = [state.events.slice(0, 3), state.events.slice(3, 6)];

    container.innerHTML = groups.map((events, index) => {
      const maxRows = Math.max(0, ...events.map((event) =>
        state.assignments.filter((a) => a.eventId === event.id && a.scheduleStatus === 'scheduled').length
      ));

      const headers = events.map((event) =>
        '<div class="bidding-calendar-head"><small>' + escapeHtml(event.type) + '</small><strong>' + escapeHtml(formatDate(event.biddingDate)) + '</strong><span>' + escapeHtml(event.label.split(' · ')[0]) + '</span></div>'
      ).join('');

      const columns = events.map((event) => {
        const members = state.assignments
          .filter((a) => a.eventId === event.id && a.scheduleStatus === 'scheduled')
          .sort((a, b) => Number(a.bidPosition || 999) - Number(b.bidPosition || 999));
        let rows = '';
        for (let i = 0; i < maxRows; i += 1) {
          const member = members[i];
          rows += member
            ? '<div class="bidding-calendar-name"><b>' + escapeHtml(member.ign) + '</b>' + responseBadge(latest.get(member.discordId)) + '</div>'
            : '<div class="bidding-calendar-name empty">—</div>';
        }
        return '<div class="bidding-calendar-column">' + rows + '</div>';
      }).join('');

      return (
        '<section class="bidding-calendar-cycle">' +
          '<div class="bidding-calendar-cycle-label">CYCLE ' + (index + 1) + '</div>' +
          '<div class="bidding-calendar-grid bidding-calendar-grid-head">' + headers + '</div>' +
          '<div class="bidding-calendar-grid">' + columns + '</div>' +
        '</section>'
      );
    }).join('');
  };

  const renderSchedule = () => {
    const container = q('[data-mock-schedule]');
    if (!container) return;
    if (!state.cycle) {
      container.innerHTML = '<div class="placeholder">No mock cycle yet.</div>';
      return;
    }

    container.innerHTML = state.events.map((event) => {
      const members = state.assignments
        .filter((a) => a.eventId === event.id && a.scheduleStatus === 'scheduled')
        .sort((a, b) => Number(a.bidPosition || 999) - Number(b.bidPosition || 999));

      return (
        '<article class="mock-schedule-card">' +
          '<div class="mock-schedule-head">' +
            '<div><small>' + escapeHtml(event.type) + ' · ' + escapeHtml(formatDate(event.biddingDate)) + '</small><h3>' + escapeHtml(event.label) + '</h3></div>' +
            '<strong>' + members.length + '/' + event.effectiveCapacity + '</strong>' +
          '</div>' +
          '<div class="mock-schedule-stock"><span>Fragments ' + event.stock.fragment + '</span><span>L&D ' + event.stock.lightDark + '</span><span>T&S ' + event.stock.timeSpace + '</span></div>' +
          '<div class="mock-schedule-bidders">' +
            (members.length ? members.map((member) =>
              '<div class="mock-schedule-bidder">' +
                '<b>#' + member.bidPosition + '</b>' +
                '<strong>' + escapeHtml(member.ign) + '</strong>' +
                '<span>Frag ' + escapeHtml(slotText(member.slotMap?.fragment)) + '</span>' +
                '<span>L&D ' + escapeHtml(slotText(member.slotMap?.lightDark)) + '</span>' +
                '<span>T&S ' + escapeHtml(slotText(member.slotMap?.timeSpace)) + '</span>' +
              '</div>'
            ).join('') : '<div class="placeholder">No bidders assigned.</div>') +
          '</div>' +
        '</article>'
      );
    }).join('');
  };

  const renderRequestTester = () => {
    const player = q('[data-request-player]');
    if (!player) return;

    const currentValue = player.value;
    player.innerHTML = (state.roster || []).map((member) =>
      '<option value="' + escapeHtml(member.discordId) + '">' + escapeHtml(member.ign) + '</option>'
    ).join('');
    if ([...player.options].some((option) => option.value === currentValue)) player.value = currentValue;

    const target = q('[data-request-target]');
    const assignment = state.assignments.find((a) => a.discordId === player.value);
    target.innerHTML = state.events
      .filter((event) => event.id !== assignment?.eventId)
      .map((event) => '<option value="' + event.id + '">' + escapeHtml(event.label) + ' · ' + escapeHtml(formatDate(event.biddingDate)) + '</option>')
      .join('');

    const assignmentEl = q('[data-request-assignment]');
    if (!assignment) {
      assignmentEl.innerHTML = '<div class="placeholder">This player has no mock assignment yet.</div>';
    } else {
      assignmentEl.innerHTML =
        '<div><span>Current Bidding Date</span><strong>' + escapeHtml(assignment.eventLabel) + '</strong><small>' + escapeHtml(formatDate(assignment.biddingDate)) + '</small></div>' +
        '<div><span>Position</span><strong>' + (assignment.bidPosition ? '#' + assignment.bidPosition : '—') + '</strong><small>' + escapeHtml(assignment.scheduleStatus) + '</small></div>';
    }

    const latest = (state.requests || []).find((item) => item.discordId === player.value);
    q('[data-request-current-status]').innerHTML = latest
      ? responseBadge(latest) + '<small>' + escapeHtml(latest.status.toUpperCase()) + (latest.reason ? ' · ' + escapeHtml(latest.reason) : '') + '</small>'
      : '<span class="bid-response-badge">NO RESPONSE</span>';
  };

  const renderOfficerQueue = () => {
    const container = q('[data-request-queue]');
    if (!container) return;
    const pending = (state.requests || []).filter((item) => item.status === 'pending');

    if (!pending.length) {
      container.innerHTML = '<div class="placeholder">No pending bidding requests.</div>';
      return;
    }

    container.innerHTML = pending.map((item) =>
      '<article class="bid-request-row" data-request-id="' + item.id + '">' +
        '<div><small>' + escapeHtml(item.job || '') + '</small><strong>' + escapeHtml(item.ign) + '</strong></div>' +
        '<div><span>Current</span><strong>' + escapeHtml(item.currentEventLabel) + '</strong></div>' +
        '<div><span>Request</span><strong>' +
          (item.responseType === 'change_date' ? 'Change to ' + escapeHtml(item.requestedEventLabel) : 'Cannot Bid') +
          '</strong><small>' + escapeHtml(item.reason || 'No reason') + '</small></div>' +
        '<div class="bid-request-actions"><button class="button primary" type="button" data-review="approve">Approve</button><button class="button" type="button" data-review="reject">Reject</button></div>' +
      '</article>'
    ).join('');
  };

  const renderRequestHistory = () => {
    const container = q('[data-request-history]');
    if (!container) return;
    const items = (state.requests || []).slice(0, 20);
    container.innerHTML = items.length ? items.map((item) =>
      '<div class="bid-request-history-row">' +
        '<strong>' + escapeHtml(item.ign) + '</strong>' +
        '<span>' + escapeHtml(item.responseType.replaceAll('_', ' ')) + '</span>' +
        '<span>' + escapeHtml(item.status) + '</span>' +
      '</div>'
    ).join('') : '<div class="placeholder">No request history yet.</div>';
  };

  const render = () => {
    q('[data-mock-cycle-label]') && (q('[data-mock-cycle-label]').textContent = state.cycle
      ? formatDate(state.cycle.startDate) + ' → ' + formatDate(state.cycle.endDate)
      : 'No active mock cycle');

    if (view === 'calendar') renderCalendar();
    if (view === 'schedule') renderSchedule();
    if (view === 'requests') {
      renderRequestTester();
      renderOfficerQueue();
      renderRequestHistory();
    }
  };

  const load = async () => {
    const response = await fetch('/api/bidding-cycle?manage=1&mock=1', { credentials: 'same-origin' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'Could not load mock bidding.');
    state = {
      cycle: data.cycle || null,
      events: data.events || [],
      assignments: data.assignments || [],
      roster: data.roster || [],
      requests: data.requests || [],
    };
    render();
  };

  q('[data-request-player]')?.addEventListener('change', renderRequestTester);

  qa('[data-member-response]').forEach((button) => {
    button.addEventListener('click', async () => {
      const player = q('[data-request-player]').value;
      const responseType = button.dataset.memberResponse;
      const status = q('[data-request-message]');
      try {
        status.textContent = 'Saving...';
        const payload = {
          action: 'submit_bid_response',
          cycleId: state.cycle.id,
          discordId: player,
          responseType,
          reason: responseType === 'cannot_bid' ? q('[data-cannot-reason]').value : '',
          requestedEventId: responseType === 'change_date' ? Number(q('[data-request-target]').value) : null,
          note: q('[data-request-note]').value,
        };
        await api(payload);
        await load();
        status.textContent = responseType === 'can_bid' ? 'Availability confirmed.' : 'Request sent for Officer/Council approval.';
      } catch (error) {
        status.textContent = error.message;
      }
    });
  });

  q('[data-request-queue]')?.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-review]');
    if (!button) return;
    const row = button.closest('[data-request-id]');
    const status = q('[data-request-message]');
    try {
      status.textContent = 'Updating request...';
      await api({
        action: 'review_bid_request',
        cycleId: state.cycle.id,
        requestId: Number(row.dataset.requestId),
        decision: button.dataset.review,
      });
      await load();
      status.textContent = button.dataset.review === 'approve' ? 'Request approved.' : 'Request rejected.';
    } catch (error) {
      status.textContent = error.message;
    }
  });

  load().catch((error) => {
    const target = q('[data-mock-calendar], [data-mock-schedule], [data-request-queue]');
    if (target) target.innerHTML = '<div class="placeholder">' + escapeHtml(error.message) + '</div>';
  });
})();