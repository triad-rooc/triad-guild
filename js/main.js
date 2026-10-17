(() => {
  const root = document.documentElement;
  const navToggle = document.querySelector('.nav-toggle');
  const headerMenu = document.querySelector('[data-header-menu]');
  const themeToggle = document.querySelector('[data-theme-toggle]');
  const dropdown = document.querySelector('[data-nav-dropdown]');
  const dropdownToggle = document.querySelector('[data-nav-dropdown-toggle]');
  const loginLink = document.querySelector('[data-login-link]');

  const getTheme = () => root.dataset.theme || 'dark';

  const updateThemeButton = () => {
    if (!themeToggle) return;
    const current = getTheme();
    const next = current === 'dark' ? 'LIGHT' : 'DARK';
    themeToggle.textContent = next;
    themeToggle.setAttribute('aria-label', `Switch to ${next.toLowerCase()} theme`);
    themeToggle.setAttribute('title', `Switch to ${next.toLowerCase()} theme`);
  };

  updateThemeButton();

  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const next = getTheme() === 'dark' ? 'light' : 'dark';
      root.dataset.theme = next;
      try { localStorage.setItem('triad-theme', next); } catch (_) {}
      updateThemeButton();
    });
  }

  if (navToggle && headerMenu) {
    navToggle.addEventListener('click', () => {
      const isOpen = headerMenu.classList.toggle('open');
      navToggle.setAttribute('aria-expanded', String(isOpen));
    });
  }

  if (dropdown && dropdownToggle) {
    dropdownToggle.addEventListener('click', () => {
      const isOpen = dropdown.classList.toggle('open');
      dropdownToggle.setAttribute('aria-expanded', String(isOpen));
    });

    document.addEventListener('click', (event) => {
      if (!dropdown.contains(event.target)) {
        dropdown.classList.remove('open');
        dropdownToggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // Public visitors see Home + Events + Login.
  // Logged-in members unlock Members, Guild Essentials, and My Profile.
  // Council / Officers additionally unlock the staff-only Roster.
  if (!document.body.classList.contains('login-page-body')) {
    fetch('/api/auth/session', { credentials: 'same-origin' })
      .then((response) => response.ok ? response.json() : null)
      .then((session) => {
        if (!session || !session.authenticated || !session.user) return;

        root.classList.add('auth-member');
        if (loginLink) loginLink.hidden = true;

        if (session.user.role === 'Council' || session.user.role === 'Officer') {
          root.classList.add('auth-staff');
        }
      })
      .catch(() => {});
  }

  // Automatic weekly guild event reminder + live countdown.
  // All TRIAD event call times use 20:00 (8:00 PM) GMT+8.
  const reminder = document.querySelector('.event-reminder');
  if (reminder) {
    const GUILD_UTC_OFFSET_HOURS = 8;
    const CALL_HOUR = 20;
    const HOUR_MS = 60 * 60 * 1000;
    const DAY_MS = 24 * HOUR_MS;

    const schedule = [
      { day: 2, name: 'Guild League', label: 'Tuesday' },
      { day: 4, name: 'Guild League', label: 'Thursday' },
      { day: 0, name: 'Emperium Overrun', label: 'Sunday' }
    ];

    const status = reminder.querySelector('[data-event-status]');
    const name = reminder.querySelector('[data-event-name]');
    const when = reminder.querySelector('[data-event-when]');
    const daysEl = reminder.querySelector('[data-countdown-days]');
    const hoursEl = reminder.querySelector('[data-countdown-hours]');
    const minutesEl = reminder.querySelector('[data-countdown-minutes]');
    const secondsEl = reminder.querySelector('[data-countdown-seconds]');

    const pad = (value) => String(value).padStart(2, '0');

    const nextScheduledEvent = (now) => {
      const guildNow = new Date(now.getTime() + GUILD_UTC_OFFSET_HOURS * HOUR_MS);
      const year = guildNow.getUTCFullYear();
      const month = guildNow.getUTCMonth();
      const date = guildNow.getUTCDate();
      const weekday = guildNow.getUTCDay();

      const candidates = schedule.map((event) => {
        const dayOffset = (event.day - weekday + 7) % 7;
        const guildLocalMs = Date.UTC(year, month, date + dayOffset, CALL_HOUR, 0, 0);
        let eventUtcMs = guildLocalMs - GUILD_UTC_OFFSET_HOURS * HOUR_MS;

        if (eventUtcMs <= now.getTime()) {
          eventUtcMs += 7 * DAY_MS;
        }

        return { ...event, timestamp: eventUtcMs };
      });

      return candidates.sort((a, b) => a.timestamp - b.timestamp)[0];
    };

    let highlightedDay = null;

    const updateCountdown = () => {
      const now = new Date();
      const nextEvent = nextScheduledEvent(now);
      const remaining = Math.max(0, nextEvent.timestamp - now.getTime());

      const totalSeconds = Math.floor(remaining / 1000);
      const days = Math.floor(totalSeconds / 86400);
      const hours = Math.floor((totalSeconds % 86400) / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;

      if (name) name.textContent = nextEvent.name;
      if (status) status.textContent = 'NEXT CALL TIME';
      if (when) when.textContent = `${nextEvent.label} · 20:00 GMT+8 · 21:00 JST`;

      if (daysEl) daysEl.textContent = pad(days);
      if (hoursEl) hoursEl.textContent = pad(hours);
      if (minutesEl) minutesEl.textContent = pad(minutes);
      if (secondsEl) secondsEl.textContent = pad(seconds);

      if (highlightedDay !== nextEvent.day) {
        highlightedDay = nextEvent.day;
        reminder.querySelectorAll('[data-event-day]').forEach((item) => {
          item.classList.toggle('is-next', Number(item.dataset.eventDay) === nextEvent.day);
        });
      }
    };

    updateCountdown();
    window.setInterval(updateCountdown, 1000);
  }
})();
