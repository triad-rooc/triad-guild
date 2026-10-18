(() => {
  const q = (selector) => document.querySelector(selector);

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
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
    return 'P' + first.page + ' S' + first.slot + ' → P' + last.page + ' S' + last.slot;
  };

  let state = { cycle: null, events: [], assignments: [], summary: null };
  let selectedEventId = null;

  const renderHeader = () => {
    const title = q('[data-public-cycle-title]');
    const summary = q('[data-public-cycle-summary]');
    const limits = q('[data-public-limits]');

    if (!state.cycle) {
      title.textContent = 'No active bidding cycle';
      summary.textContent = '';
      limits.innerHTML = '';
      return;
    }

    title.textContent = formatDate(state.cycle.startDate) + ' → ' + formatDate(state.cycle.endDate);
    summary.textContent =
      (state.summary?.scheduled || 0) + ' scheduled · ' +
      (state.summary?.needsReschedule || 0) + ' reschedule';

    limits.innerHTML =
      '<div><span>Illusion Fragments</span><strong>' + state.cycle.limits.fragment + ' / member</strong></div>' +
      '<div><span>Light & Dark</span><strong>' + state.cycle.limits.lightDark + ' / member</strong></div>' +
      '<div><span>Time & Space</span><strong>' + state.cycle.limits.timeSpace + ' / member</strong></div>';
  };

  const renderSchedule = () => {
    const schedule = q('[data-public-schedule]');
    if (!state.cycle) {
      schedule.innerHTML = '<div class="placeholder">Council has not opened a bidding cycle yet.</div>';
      return;
    }

    schedule.innerHTML = state.events.map((event) => {
      const members = state.assignments.filter((a) => a.eventId === event.id && a.scheduleStatus === 'scheduled');
      const full = members.length >= event.effectiveCapacity && event.effectiveCapacity > 0;
      return (
        '<article class="bidding-schedule-card">' +
          '<div class="bidding-schedule-card-head">' +
            '<span>' + escapeHtml(event.type) + ' · EVENT ' + event.order + '</span>' +
            '<strong>' + escapeHtml(event.label) + '</strong>' +
            '<small>' + escapeHtml(formatDate(event.biddingDate)) + '</small>' +
          '</div>' +
          '<div class="bidding-schedule-count">' +
            '<strong>' + members.length + '/' + event.effectiveCapacity + '</strong>' +
            '<span>' + (full ? 'FULL' : 'ASSIGNED') + '</span>' +
          '</div>' +
          '<div class="bidding-schedule-stock">' +
            '<span>Fragments ' + event.stock.fragment + '</span>' +
            '<span>L&D ' + event.stock.lightDark + '</span>' +
            '<span>T&S ' + event.stock.timeSpace + '</span>' +
          '</div>' +
          '<button class="button ' + (selectedEventId === event.id ? 'primary' : '') + '" type="button" data-view-bidders="' + event.id + '">View Bidders</button>' +
        '</article>'
      );
    }).join('');
  };

  const renderBidders = () => {
    const section = q('[data-public-bidders-section]');
    const container = q('[data-public-events]');
    const title = q('[data-public-bidders-title]');
    const event = state.events.find((item) => item.id === selectedEventId);

    if (!event) {
      section.hidden = true;
      container.innerHTML = '';
      return;
    }

    const members = state.assignments
      .filter((a) => a.eventId === event.id && a.scheduleStatus === 'scheduled')
      .sort((a, b) => Number(a.bidPosition || 999) - Number(b.bidPosition || 999));

    title.textContent = event.label + ' · ' + members.length + ' Bidders';

    let html =
      '<section class="public-event-card">' +
        '<div class="public-event-head">' +
          '<div><span>' + escapeHtml(event.type) + ' · ' + escapeHtml(formatDate(event.biddingDate)) + '</span><h3>' + escapeHtml(event.label) + '</h3></div>' +
          '<strong>' + members.length + '/' + event.effectiveCapacity + '</strong>' +
        '</div>' +
        '<div class="public-event-stock">' +
          '<span>Fragments ' + event.stock.fragment + '</span>' +
          '<span>L&D ' + event.stock.lightDark + '</span>' +
          '<span>T&S ' + event.stock.timeSpace + '</span>' +
        '</div>';

    if (!members.length) {
      html += '<div class="placeholder">No bidders assigned to this event.</div>';
    } else {
      members.forEach((assignment) => {
        html +=
          '<article class="public-bid-row">' +
            '<b>#' + escapeHtml(assignment.bidPosition || '—') + '</b>' +
            '<div><strong>' + escapeHtml(assignment.ign) + '</strong><small>' + escapeHtml(assignment.job || '') + '</small></div>' +
            '<div><span>Fragments</span><small>' + escapeHtml(slotText(assignment.slotMap?.fragment)) + '</small></div>' +
            '<div><span>L&D</span><small>' + escapeHtml(slotText(assignment.slotMap?.lightDark)) + '</small></div>' +
            '<div><span>T&S</span><small>' + escapeHtml(slotText(assignment.slotMap?.timeSpace)) + '</small></div>' +
            '<em>' + escapeHtml(assignment.outcomeStatus) + '</em>' +
          '</article>';
      });
    }

    html += '</section>';
    container.innerHTML = html;
    section.hidden = false;
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  q('[data-public-schedule]')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-view-bidders]');
    if (!button) return;
    selectedEventId = Number(button.dataset.viewBidders);
    renderSchedule();
    renderBidders();
  });

  q('[data-public-close-bidders]')?.addEventListener('click', () => {
    selectedEventId = null;
    renderSchedule();
    renderBidders();
    q('[data-public-schedule]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  fetch('/api/bidding-cycle', { credentials: 'same-origin' })
    .then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Could not load bidding cycle.');
      return data;
    })
    .then((data) => {
      state = {
        cycle: data.cycle || null,
        events: data.events || [],
        assignments: data.assignments || [],
        summary: data.summary || null,
      };
      renderHeader();
      renderSchedule();
    })
    .catch((error) => {
      q('[data-public-schedule]').innerHTML = '<div class="placeholder">' + escapeHtml(error.message || 'Could not load bidding cycle.') + '</div>';
    });
})();