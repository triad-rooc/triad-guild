(() => {
  const dateEl = document.querySelector('[data-next-bidding-date]');
  const detailEl = document.querySelector('[data-next-bidding-detail]');
  if (!dateEl || !detailEl) return;

  const formatDate = (value) => {
    if (!value) return '';
    const date = new Date(String(value).slice(0, 10) + 'T12:00:00Z');
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });
  };

  const countdown = (value) => {
    if (!value) return '';
    const target = new Date(String(value).slice(0, 10) + 'T12:00:00Z');
    const diff = target.getTime() - Date.now();
    if (diff <= 0) return 'today / passed';
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(hours / 24);
    return days > 0 ? days + 'd ' + (hours % 24) + 'h away' : hours + 'h away';
  };

  fetch('/api/bidding-cycle?mine=1', { credentials: 'same-origin' })
    .then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Could not load bidding schedule.');
      return data;
    })
    .then((data) => {
      const assignment = Array.isArray(data.assignments) ? data.assignments[0] : null;

      if (!assignment) {
        dateEl.textContent = 'No bidding scheduled';
        detailEl.textContent = 'Council will assign your next bidding cycle schedule.';
        return;
      }

      if (assignment.scheduleStatus === 'needs_reschedule') {
        dateEl.textContent = 'Needs Reschedule';
        detailEl.textContent = 'Council is finding an event with a complete equal-allocation package for you.';
        return;
      }

      dateEl.textContent = formatDate(assignment.biddingDate);
      detailEl.textContent =
        assignment.eventLabel +
        ' · Position #' + assignment.bidPosition +
        ' · ' + (data.cycle?.limits?.fragment || 3) + ' Fragments' +
        ' + ' + (data.cycle?.limits?.lightDark || 12) + ' L&D' +
        ' + ' + (data.cycle?.limits?.timeSpace || 15) + ' T&S' +
        ' · ' + countdown(assignment.biddingDate);
    })
    .catch(() => {
      dateEl.textContent = 'Bidding schedule unavailable';
      detailEl.textContent = 'Please check the Bidding page later.';
    });
})();
