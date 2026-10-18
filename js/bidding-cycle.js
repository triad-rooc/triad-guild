
(() => {
  const q = (selector) => document.querySelector(selector);

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
    return date.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  const slotText = (list) => {
    if (!Array.isArray(list) || !list.length) return '—';
    const first = list[0];
    const last = list[list.length - 1];
    if (list.length === 1) return 'P' + first.page + ' S' + first.slot;
    return 'P' + first.page + ' S' + first.slot + ' → P' + last.page + ' S' + last.slot;
  };

  let state = {
    cycle: null,
    events: [],
    assignments: [],
    summary: null,
  };

  const render = () => {
    const title = q('[data-public-cycle-title]');
    const summary = q('[data-public-cycle-summary]');
    const limits = q('[data-public-limits]');
    const container = q('[data-public-events]');

    if (!state.cycle) {
      title.textContent = 'No active bidding cycle';
      summary.textContent = '';
      limits.innerHTML = '';
      container.innerHTML = '<div class="placeholder">Council has not opened a bidding cycle yet.</div>';
      return;
    }

    title.textContent = formatDate(state.cycle.startDate) + ' → ' + formatDate(state.cycle.endDate);
    summary.textContent =
      (state.summary?.scheduled || 0) +
      ' scheduled · ' +
      (state.summary?.needsReschedule || 0) +
      ' reschedule';

    limits.innerHTML =
      '<div><span>Illusion Fragments</span><strong>' + state.cycle.limits.fragment + ' / member</strong></div>' +
      '<div><span>Light & Dark</span><strong>' + state.cycle.limits.lightDark + ' / member</strong></div>' +
      '<div><span>Time & Space</span><strong>' + state.cycle.limits.timeSpace + ' / member</strong></div>';

    const eventSelect = q('[data-public-event]');
    const previous = eventSelect.value;
    eventSelect.innerHTML = '<option value="all">All Events</option>';
    state.events.forEach((event) => {
      eventSelect.innerHTML += '<option value="' + event.id + '">' + escapeHtml(event.label) + '</option>';
    });
    eventSelect.innerHTML += '<option value="reschedule">Needs Reschedule</option>';
    if ([...eventSelect.options].some((option) => option.value === previous)) eventSelect.value = previous;

    const term = String(q('[data-public-search]').value || '').trim().toLowerCase();
    const filter = eventSelect.value;

    let html = '';

    state.events
      .filter((event) => filter === 'all' || String(event.id) === filter)
      .forEach((event) => {
        const members = state.assignments.filter((assignment) => {
          const inEvent = assignment.eventId === event.id;
          const matches =
            !term ||
            [assignment.ign, assignment.job, assignment.eventLabel]
              .join(' ')
              .toLowerCase()
              .includes(term);
          return inEvent && matches;
        });

        html +=
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
          html += '<div class="placeholder">No members in this event.</div>';
        } else {
          members.forEach((assignment) => {
            html +=
              '<article class="public-bid-row">' +
                '<b>#' + assignment.bidPosition + '</b>' +
                '<div><strong>' + escapeHtml(assignment.ign) + '</strong><small>' + escapeHtml(assignment.job || '') + '</small></div>' +
                '<div><span>Fragments</span><small>' + escapeHtml(slotText(assignment.slotMap?.fragment)) + '</small></div>' +
                '<div><span>L&D</span><small>' + escapeHtml(slotText(assignment.slotMap?.lightDark)) + '</small></div>' +
                '<div><span>T&S</span><small>' + escapeHtml(slotText(assignment.slotMap?.timeSpace)) + '</small></div>' +
                '<em>' + escapeHtml(assignment.outcomeStatus) + '</em>' +
              '</article>';
          });
        }

        html += '</section>';
      });

    const reschedule = state.assignments.filter((assignment) => {
      const needs = assignment.scheduleStatus === 'needs_reschedule';
      const matches =
        !term ||
        [assignment.ign, assignment.job]
          .join(' ')
          .toLowerCase()
          .includes(term);
      return needs && matches;
    });

    if ((filter === 'all' || filter === 'reschedule') && reschedule.length) {
      html +=
        '<section class="public-event-card">' +
          '<div class="public-event-head"><div><span>CALENDAR</span><h3>Needs Reschedule</h3></div><strong>' + reschedule.length + '</strong></div>';

      reschedule.forEach((assignment) => {
        html +=
          '<article class="public-bid-row reschedule">' +
            '<b>—</b>' +
            '<div><strong>' + escapeHtml(assignment.ign) + '</strong><small>' + escapeHtml(assignment.job || '') + '</small></div>' +
            '<div class="public-reschedule-note">Waiting for another event with a complete equal-allocation package.</div>' +
          '</article>';
      });

      html += '</section>';
    }

    container.innerHTML = html || '<div class="placeholder">No schedules match this view.</div>';
  };

  q('[data-public-search]')?.addEventListener('input', render);
  q('[data-public-event]')?.addEventListener('change', render);

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
      render();
    })
    .catch((error) => {
      q('[data-public-events]').innerHTML = '<div class="placeholder">' + escapeHtml(error.message || 'Could not load bidding cycle.') + '</div>';
    });
})();
