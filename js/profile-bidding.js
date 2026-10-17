(() => {
  const dateEl = document.querySelector('[data-next-bidding-date]');
  const detailEl = document.querySelector('[data-next-bidding-detail]');
  if (!dateEl || !detailEl) return;

  const formatDate = (value) => {
    if (!value) return '';
    const date = new Date(`${value}T12:00:00Z`);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });
  };

  fetch('/api/bidding?mine=1', { credentials: 'same-origin' })
    .then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Could not load bidding schedule.');
      return data;
    })
    .then((data) => {
      const assignment = Array.isArray(data.assignments) ? data.assignments[0] : null;
      if (!assignment) {
        dateEl.textContent = 'No bidding scheduled';
        detailEl.textContent = 'Council will assign your next bidding schedule.';
        return;
      }

      dateEl.textContent = formatDate(assignment.biddingDate);
      detailEl.textContent = `${assignment.eventShortLabel} · ${assignment.category} · Page ${assignment.page} · Slot ${assignment.slot}`;
    })
    .catch(() => {
      dateEl.textContent = 'Bidding schedule unavailable';
      detailEl.textContent = 'Please check the Bidding page later.';
    });
})();
