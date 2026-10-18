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
    const offsetHours = 8;
    const callHour = 20;
    const hourMs = 3600000;
    const dayMs = 86400000;
    const now = new Date();
    const guildNow = new Date(now.getTime() + offsetHours * hourMs);
    const year = guildNow.getUTCFullYear();
    const month = guildNow.getUTCMonth();
    const date = guildNow.getUTCDate();
    const weekday = guildNow.getUTCDay();
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
    q('[data-dashboard-event-countdown]').textContent =
      (days ? days + 'D ' : '') + hours + 'H ' + minutes + 'M';
  };

  const getJson = async (url) => {
    const response = await fetch(url, { credentials: 'same-origin' });
    if (response.status === 401) return null;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || data.error || 'Request failed.');
    return data;
  };

  const renderBidding = (bidding) => {
    const assignment = Array.isArray(bidding?.assignments) ? bidding.assignments[0] : null;

    if (assignment?.scheduleStatus === 'needs_reschedule') {
      q('[data-dashboard-bidding-date]').textContent = 'Needs Reschedule';
      q('[data-dashboard-bidding-detail]').textContent =
        'Council is finding an event with a complete equal-allocation package.';
    } else if (assignment?.biddingDate) {
      q('[data-dashboard-bidding-date]').textContent = formatDate(assignment.biddingDate);
      q('[data-dashboard-bidding-detail]').textContent =
        (assignment.eventLabel || 'Guild Event') +
        (assignment.bidPosition ? ' · Position #' + assignment.bidPosition : '');
      q('[data-dashboard-bidding-cycle]').textContent = countdownText(assignment.biddingDate);
    } else {
      q('[data-dashboard-bidding-date]').textContent = 'No Bidding Scheduled';
      q('[data-dashboard-bidding-detail]').textContent = 'No current cycle assignment is available yet.';
    }

    if (bidding?.cycle) {
      q('[data-dashboard-cycle-status]').textContent = String(bidding.cycle.status || '').toUpperCase();
      q('[data-dashboard-cycle-detail]').textContent =
        formatDate(bidding.cycle.startDate) + ' → ' + formatDate(bidding.cycle.endDate) +
        ' · ' + (bidding.summary?.scheduled || 0) + ' scheduled' +
        (bidding.summary?.needsReschedule ? ' · ' + bidding.summary.needsReschedule + ' reschedule' : '');
    } else {
      q('[data-dashboard-cycle-status]').textContent = 'NO ACTIVE CYCLE';
      q('[data-dashboard-cycle-detail]').textContent = 'Create or open a bidding cycle from the manager.';
    }
  };

  renderEvent();
  window.setInterval(renderEvent, 60000);

  Promise.all([
    getJson('/api/auth/session'),
    getJson('/api/members'),
    getJson('/api/profile/me'),
    getJson('/api/bidding-cycle?mine=1'),
  ])
    .then(async ([session, members, profileData, bidding]) => {
      if (!session?.authenticated || !session.user) return;

      const role = session.user.role || 'Member';
      q('[data-dashboard-role]').textContent = String(role).toUpperCase();
      q('[data-dashboard-member-count]').textContent = String(members?.members?.length || 0);

      const profileStatus = profileData?.profile?.verificationStatus || 'unverified';
      q('[data-dashboard-profile-status]').textContent = verificationLabel(profileStatus);
      q('[data-dashboard-profile-detail]').textContent =
        profileStatus === 'verified' ? 'Your current stats are verified.' :
        profileStatus === 'pending' ? 'Your stats are waiting for staff review.' :
        profileStatus === 'update_required' ? 'Staff requested an updated stat submission.' :
        'Submit your character stats for verification.';

      renderBidding(bidding);

      if (role === 'Council' || role === 'Officer') {
        root.classList.add('auth-staff');
        try {
          const roster = await getJson('/api/roster');
          const pending = Array.isArray(roster?.roster)
            ? roster.roster.filter((member) => member.verificationStatus === 'pending').length
            : 0;
          q('[data-dashboard-pending]').textContent = String(pending);
        } catch (_) {
          q('[data-dashboard-pending]').textContent = '—';
        }
      }
    })
    .catch(() => {
      q('[data-dashboard-member-count]').textContent = '—';
      q('[data-dashboard-profile-status]').textContent = 'UNAVAILABLE';
      q('[data-dashboard-bidding-date]').textContent = 'Unavailable';
    });
})();
