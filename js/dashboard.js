(() => {
  const root = document.documentElement;
  const dashboard = document.querySelector('[data-guild-dashboard]');
  if (!dashboard) return;

  const q = (selector) => dashboard.querySelector(selector);
  const formatDate = (value) => {
    if (!value) return '';
    const date = new Date(String(value).slice(0, 10) + 'T12:00:00Z');
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  };
  const countdownText = (value) => {
    if (!value) return '';
    const target = new Date(String(value).slice(0, 10) + 'T12:00:00Z');
    const diff = target.getTime() - Date.now();
    if (diff <= 0) return 'TODAY / PASSED';
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(hours / 24);
    return days > 0 ? days + 'D ' + (hours % 24) + 'H AWAY' : hours + 'H AWAY';
  };
  const verificationLabel = (status) => ({
    verified: 'VERIFIED',
    pending: 'PENDING',
    update_required: 'UPDATE REQUIRED',
    unverified: 'UNVERIFIED',
  }[status] || 'UNVERIFIED');

  const nextGuildEvent = () => {
    const offsetHours = 8, callHour = 20, hourMs = 3600000, dayMs = 86400000;
    const now = new Date();
    const guildNow = new Date(now.getTime() + offsetHours * hourMs);
    const year = guildNow.getUTCFullYear(), month = guildNow.getUTCMonth(), date = guildNow.getUTCDate(), weekday = guildNow.getUTCDay();
    const schedule = [
      { day: 2, name: 'Guild League', label: 'Tuesday' },
      { day: 4, name: 'Guild League', label: 'Thursday' },
      { day: 0, name: 'Emperium Overrun', label: 'Sunday' },
    ];
    return schedule.map((event) => {
      const dayOffset = (event.day - weekday + 7) % 7;
      const guildLocal = Date.UTC(year, month, date + dayOffset, callHour, 0, 0);
      let timestamp = guildLocal - offsetHours * hourMs;
      if (timestamp <= now.getTime()) timestamp += 7 * dayMs;
      return { ...event, timestamp };
    }).sort((a, b) => a.timestamp - b.timestamp)[0];
  };

  const renderEvent = () => {
    const event = nextGuildEvent();
    const remaining = Math.max(0, event.timestamp - Date.now());
    const totalMinutes = Math.floor(remaining / 60000);
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;

    q('[data-dashboard-event-name]').textContent = event.name;
    q('[data-dashboard-event-time]').textContent = event.label + ' · 20:00 GMT+8 · 21:00 JST';
    q('[data-dashboard-event-countdown]').textContent = (days ? days + 'D ' : '') + hours + 'H ' + minutes + 'M';
  };

  renderEvent();
  window.setInterval(renderEvent, 60000);

  fetch('/api/dashboard', { credentials: 'same-origin' })
    .then(async (response) => {
      if (response.status === 401) return null;
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Could not load dashboard.');
      return data;
    })
    .then((data) => {
      if (!data) return;

      q('[data-dashboard-role]').textContent = String(data.role || 'Member').toUpperCase();
      q('[data-dashboard-member-count]').textContent = String(data.memberCount || 0);

      const profileStatus = data.profile?.verificationStatus || 'unverified';
      q('[data-dashboard-profile-status]').textContent = verificationLabel(profileStatus);
      q('[data-dashboard-profile-detail]').textContent =
        profileStatus === 'verified' ? 'Your current stats are verified.' :
        profileStatus === 'pending' ? 'Your stats are waiting for staff review.' :
        profileStatus === 'update_required' ? 'Staff requested an updated stat submission.' :
        'Submit your character stats for verification.';

      if (data.myBidding?.scheduleStatus === 'needs_reschedule') {
        q('[data-dashboard-bidding-date]').textContent = 'Needs Reschedule';
        q('[data-dashboard-bidding-detail]').textContent = 'Council is finding an event with a complete equal-allocation package.';
      } else if (data.myBidding?.biddingDate) {
        q('[data-dashboard-bidding-date]').textContent = formatDate(data.myBidding.biddingDate);
        q('[data-dashboard-bidding-detail]').textContent =
          (data.myBidding.eventLabel || 'Guild Event') +
          (data.myBidding.bidPosition ? ' · Position #' + data.myBidding.bidPosition : '');
        q('[data-dashboard-bidding-cycle]').textContent = countdownText(data.myBidding.biddingDate);
      } else {
        q('[data-dashboard-bidding-date]').textContent = 'No Bidding Scheduled';
        q('[data-dashboard-bidding-detail]').textContent = 'No current cycle assignment is available yet.';
      }

      if (data.cycle) {
        q('[data-dashboard-cycle-status]').textContent = String(data.cycle.status || '').toUpperCase();
        q('[data-dashboard-cycle-detail]').textContent =
          formatDate(data.cycle.startDate) + ' → ' + formatDate(data.cycle.endDate) +
          ' · ' + data.cycle.scheduled + ' scheduled' +
          (data.cycle.needsReschedule ? ' · ' + data.cycle.needsReschedule + ' reschedule' : '');
      } else {
        q('[data-dashboard-cycle-status]').textContent = 'NO ACTIVE CYCLE';
        q('[data-dashboard-cycle-detail]').textContent = 'Create or open a bidding cycle from the manager.';
      }

      if (data.role === 'Council' || data.role === 'Officer') {
        root.classList.add('auth-staff');
        q('[data-dashboard-pending]').textContent = String(data.pendingVerificationCount || 0);
      }
    })
    .catch(() => {
      q('[data-dashboard-member-count]').textContent = '—';
      q('[data-dashboard-profile-status]').textContent = 'UNAVAILABLE';
      q('[data-dashboard-bidding-date]').textContent = 'Unavailable';
    });
})();
