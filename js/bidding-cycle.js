(() => {
  const q = (selector) => document.querySelector(selector);
  const qa = (selector) => [...document.querySelectorAll(selector)];

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  }[character]));

  const formatDate = (value, weekday = true) => {
    if (!value) return '—';
    const date = new Date(String(value).slice(0, 10) + 'T12:00:00Z');
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString(undefined, weekday
      ? { weekday: 'short', month: 'short', day: 'numeric' }
      : { month: 'short', day: 'numeric' });
  };

  const slotText = (list) => {
    if (!Array.isArray(list) || !list.length) return '—';
    const first = list[0];
    const last = list[list.length - 1];
    if (list.length === 1) return 'P' + first.page + ' S' + first.slot;
    return 'P' + first.page + ' S' + first.slot + ' → P' + last.page + ' S' + last.slot;
  };

  let state = { cycle: null, events: [], assignments: [], summary: null, userId: null };

  const eventMembers = (eventId) => state.assignments
    .filter((item) => item.eventId === eventId && item.scheduleStatus === 'scheduled')
    .sort((a, b) => Number(a.bidPosition || 999) - Number(b.bidPosition || 999));

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
    summary.textContent = (state.summary?.scheduled || 0) + ' scheduled · ' + (state.summary?.needsReschedule || 0) + ' reschedule';
    limits.innerHTML =
      '<div><span>Illusion Fragments</span><strong>' + state.cycle.limits.fragment + ' / member</strong></div>' +
      '<div><span>Light & Dark</span><strong>' + state.cycle.limits.lightDark + ' / member</strong></div>' +
      '<div><span>Time & Space</span><strong>' + state.cycle.limits.timeSpace + ' / member</strong></div>';
  };

  const renderCalendar = () => {
    const container = q('[data-public-calendar]');
    if (!container) return;
    if (!state.cycle) {
      container.innerHTML = '<div class="placeholder">Council has not opened a bidding cycle yet.</div>';
      return;
    }
    const groups = [state.events.slice(0, 3), state.events.slice(3, 6)];
    container.innerHTML = groups.map((events, index) => {
      const maxRows = Math.max(0, ...events.map((event) => eventMembers(event.id).length));
      const headers = events.map((event) =>
        '<div class="bidding-calendar-head"><small>' + escapeHtml(event.type) + ' · EVENT ' + event.order + '</small>' +
        '<strong>' + escapeHtml(formatDate(event.biddingDate, false)) + '</strong>' +
        '<span>' + escapeHtml(event.label.split(' · ')[0]) + '</span></div>'
      ).join('');
      const columns = events.map((event) => {
        const members = eventMembers(event.id);
        let rows = '';
        for (let i = 0; i < maxRows; i += 1) {
          const member = members[i];
          rows += member
            ? '<div class="bidding-calendar-name"><b>#' + escapeHtml(member.bidPosition || '—') + ' ' + escapeHtml(member.ign) + '</b></div>'
            : '<div class="bidding-calendar-name empty">—</div>';
        }
        return '<div class="bidding-calendar-column">' + rows + '</div>';
      }).join('');
      return '<section class="bidding-calendar-cycle">' +
        '<div class="bidding-calendar-cycle-label">CYCLE ' + (index + 1) + '</div>' +
        '<div class="bidding-calendar-grid bidding-calendar-grid-head">' + headers + '</div>' +
        '<div class="bidding-calendar-grid">' + columns + '</div></section>';
    }).join('');
  };

  const renderList = () => {
    const container = q('[data-public-bidding-list]');
    const count = q('[data-public-list-count]');
    if (!container) return;
    if (!state.cycle) {
      container.innerHTML = '<div class="placeholder">No active bidding cycle.</div>';
      if (count) count.textContent = '';
      return;
    }
    const rows = [...state.assignments].sort((a, b) => {
      const eventDiff = Number(a.eventOrder || 999) - Number(b.eventOrder || 999);
      return eventDiff || Number(a.bidPosition || 999) - Number(b.bidPosition || 999);
    });
    if (count) count.textContent = rows.length + ' members';
    container.innerHTML = rows.length ? rows.map((assignment) =>
      '<article class="member-bidding-row' + (assignment.scheduleStatus !== 'scheduled' ? ' needs-reschedule' : '') + '">' +
        '<div><span>Member</span><strong>' + escapeHtml(assignment.ign) + '</strong><small>' + escapeHtml(assignment.job || '') + '</small></div>' +
        '<div><span>Event</span><strong>' + escapeHtml(assignment.eventLabel) + '</strong><small>' + escapeHtml(formatDate(assignment.biddingDate)) + '</small></div>' +
        '<div><span>Position</span><strong>' + (assignment.bidPosition ? '#' + assignment.bidPosition : '—') + '</strong><small>' + escapeHtml(assignment.scheduleStatus.replaceAll('_', ' ')) + '</small></div>' +
        '<div><span>Fragments</span><strong>' + escapeHtml(slotText(assignment.slotMap?.fragment)) + '</strong></div>' +
        '<div><span>Light & Dark</span><strong>' + escapeHtml(slotText(assignment.slotMap?.lightDark)) + '</strong></div>' +
        '<div><span>Time & Space</span><strong>' + escapeHtml(slotText(assignment.slotMap?.timeSpace)) + '</strong></div>' +
      '</article>'
    ).join('') : '<div class="placeholder">No members are assigned yet.</div>';
  };

  const renderPersonal = () => {
    const container = q('[data-public-personal]');
    if (!container) return;
    if (!state.cycle) {
      container.innerHTML = '<div class="placeholder">No active bidding cycle.</div>';
      return;
    }
    const assignment = state.assignments.find((item) => String(item.discordId) === String(state.userId || ''));
    if (!assignment) {
      container.innerHTML = '<div class="placeholder">You do not have a bidding assignment in the current cycle.</div>';
      return;
    }
    if (assignment.scheduleStatus !== 'scheduled') {
      container.innerHTML = '<article class="personal-bidding-card attention"><span>STATUS</span><h3>Needs Reschedule</h3><p>Your current bidding assignment is waiting for a new event date.</p></article>';
      return;
    }
    container.innerHTML =
      '<article class="personal-bidding-card">' +
        '<div class="personal-bidding-hero"><div><span>NEXT BIDDING EVENT</span><h3>' + escapeHtml(assignment.eventLabel) + '</h3><p>' + escapeHtml(formatDate(assignment.biddingDate)) + '</p></div><strong>#' + escapeHtml(assignment.bidPosition || '—') + '</strong></div>' +
        '<div class="personal-bidding-items">' +
          '<div><span>Illusion Fragments</span><strong>' + escapeHtml(slotText(assignment.slotMap?.fragment)) + '</strong></div>' +
          '<div><span>Light & Dark</span><strong>' + escapeHtml(slotText(assignment.slotMap?.lightDark)) + '</strong></div>' +
          '<div><span>Time & Space</span><strong>' + escapeHtml(slotText(assignment.slotMap?.timeSpace)) + '</strong></div>' +
        '</div>' +
        '<div class="personal-bidding-status"><span>Status</span><strong>' + escapeHtml(assignment.outcomeStatus || 'pending') + '</strong></div>' +
      '</article>';
  };

  const selectView = (name) => {
    qa('[data-bidding-view-tab]').forEach((button) => {
      const active = button.dataset.biddingViewTab === name;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    qa('[data-bidding-view-panel]').forEach((panel) => {
      panel.hidden = panel.dataset.biddingViewPanel !== name;
    });
  };

  qa('[data-bidding-view-tab]').forEach((button) =>
    button.addEventListener('click', () => selectView(button.dataset.biddingViewTab))
  );

  Promise.all([
    fetch('/api/bidding-cycle', { credentials: 'same-origin', cache: 'no-store' }).then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Could not load bidding cycle.');
      return data;
    }),
    fetch('/api/auth/session', { credentials: 'same-origin', cache: 'no-store' })
      .then((response) => response.ok ? response.json() : null)
      .catch(() => null),
  ]).then(([data, session]) => {
    state = {
      cycle: data.cycle || null,
      events: data.events || [],
      assignments: data.assignments || [],
      summary: data.summary || null,
      userId: session?.authenticated ? session.user?.id || null : null,
    };
    renderHeader();
    renderCalendar();
    renderList();
    renderPersonal();
  }).catch((error) => {
    const message = '<div class="placeholder">' + escapeHtml(error.message || 'Could not load bidding.') + '</div>';
    q('[data-public-calendar]').innerHTML = message;
    q('[data-public-bidding-list]').innerHTML = message;
    q('[data-public-personal]').innerHTML = message;
  });

  selectView('calendar');
})();