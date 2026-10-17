(() => {
  const monitor = document.querySelector('[data-bidding-monitor]');
  const count = document.querySelector('[data-bidding-count]');
  const search = document.querySelector('[data-bidding-search]');
  const filter = document.querySelector('[data-bidding-filter]');
  if (!monitor) return;

  let assignments = [];

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }[character]));

  const formatDate = (value) => {
    const date = new Date(`${value}T12:00:00Z`);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  const render = () => {
    const term = String(search?.value || '').trim().toLowerCase();
    const category = filter?.value || 'all';

    const filtered = assignments.filter((assignment) => {
      const matchesCategory = category === 'all' || assignment.category === category;
      const haystack = [
        assignment.ign,
        assignment.job,
        assignment.category,
        assignment.eventLabel,
        assignment.eventShortLabel,
      ].join(' ').toLowerCase();

      return matchesCategory && (!term || haystack.includes(term));
    });

    if (count) count.textContent = `${filtered.length} / ${assignments.length} scheduled`;

    if (!filtered.length) {
      monitor.innerHTML = '<div class="placeholder">No bidding schedules match this view.</div>';
      return;
    }

    monitor.innerHTML = filtered.map((assignment) => `
      <article class="bidding-monitor-row">
        <div>
          <span class="member-card-label">${escapeHtml(assignment.job)}</span>
          <strong>${escapeHtml(assignment.ign)}</strong>
        </div>
        <div><span>Category</span><strong>${escapeHtml(assignment.category)}</strong></div>
        <div><span>Page / Slot</span><strong>Page ${assignment.page} · Slot ${assignment.slot}</strong></div>
        <div><span>Guild Event</span><strong>${escapeHtml(assignment.eventShortLabel)}</strong></div>
        <div><span>Bidding Date</span><strong>${escapeHtml(formatDate(assignment.biddingDate))}</strong></div>
      </article>
    `).join('');
  };

  search?.addEventListener('input', render);
  filter?.addEventListener('change', render);

  fetch('/api/bidding', { credentials: 'same-origin' })
    .then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Could not load bidding schedule.');
      return data;
    })
    .then((data) => {
      assignments = Array.isArray(data.assignments) ? data.assignments : [];
      render();
    })
    .catch((error) => {
      if (count) count.textContent = '';
      monitor.innerHTML = `<div class="placeholder">${escapeHtml(error.message || 'Could not load bidding schedule.')}</div>`;
    });
})();
