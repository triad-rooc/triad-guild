(() => {
  // TRIAD lightweight preloader: show briefly on full page loads, then fade away.
  const preloader = document.createElement('div');
  preloader.className = 'triad-preloader';
  preloader.setAttribute('aria-hidden', 'true');
  preloader.innerHTML =
    '<div class="triad-preloader-inner">' +
      '<strong>TRIAD</strong>' +
      '<span>RAGNAROK ORIGIN CLASSIC</span>' +
      '<small>LOADING</small>' +
      '<i></i>' +
    '</div>';
  document.body.prepend(preloader);

  const markPageReady = () => {
    window.setTimeout(() => {
      document.body?.classList.add('page-ready');
      preloader.classList.add('is-leaving');
      window.setTimeout(() => preloader.remove(), 700);
    }, 420);
  };

  if (document.readyState === 'complete') {
    markPageReady();
  } else {
    window.addEventListener('load', markPageReady, { once: true });
    window.setTimeout(markPageReady, 1400);
  }

  const root = document.documentElement;
  const navToggle = document.querySelector('.nav-toggle');
  const headerMenu = document.querySelector('[data-header-menu]');
  const themeToggle = document.querySelector('[data-theme-toggle]');
  const dropdown = document.querySelector('[data-nav-dropdown]');
  const dropdownToggle = document.querySelector('[data-nav-dropdown-toggle]');
  const loginLink = document.querySelector('[data-login-link]');
  const accountNav = document.querySelector('.account-nav');

  const getTheme = () => root.dataset.theme || 'dark';

  const ensureAccountLink = (href, label) => {
    if (!accountNav || accountNav.querySelector(`a[href="${href}"]`)) return;
    const link = document.createElement('a');
    link.href = href;
    link.textContent = label;
    link.dataset.authGenerated = 'true';
    if (window.location.pathname.endsWith(`/${href}`)) link.classList.add('active');
    const before = accountNav.querySelector('.profile-link, .logout-link, [data-theme-toggle]');
    accountNav.insertBefore(link, before || null);
  };

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

  const closeMobileMenu = () => {
    if (!headerMenu || !navToggle) return;
    headerMenu.classList.remove('open');
    root.classList.remove('nav-open');
    navToggle.setAttribute('aria-expanded', 'false');
    navToggle.textContent = 'MENU';
  };

  if (navToggle && headerMenu) {
    navToggle.addEventListener('click', () => {
      const isOpen = headerMenu.classList.toggle('open');
      root.classList.toggle('nav-open', isOpen);
      navToggle.setAttribute('aria-expanded', String(isOpen));
      navToggle.textContent = isOpen ? 'CLOSE' : 'MENU';
    });

    headerMenu.addEventListener('click', (event) => {
      const link = event.target.closest('a');
      if (link) closeMobileMenu();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeMobileMenu();
    });

    window.addEventListener('resize', () => {
      if (window.innerWidth > 1100) closeMobileMenu();
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
  //
  // Always reset auth UI before checking the session. This also prevents
  // browser back/forward cache from showing Logout after the session ended.
  const resetAuthUi = () => {
    root.classList.remove('auth-member', 'auth-staff', 'auth-council');
    if (loginLink) loginLink.hidden = false;
    accountNav?.querySelectorAll('[data-auth-generated="true"]').forEach((link) => link.remove());
  };

  const syncAuthUi = () => {
    resetAuthUi();

    if (document.body.classList.contains('login-page-body')) return Promise.resolve();

    return fetch('/api/auth/session', {
      credentials: 'same-origin',
      cache: 'no-store',
    })
      .then((response) => response.ok ? response.json() : null)
      .then((session) => {
        if (!session || !session.authenticated || !session.user) {
          resetAuthUi();
          return;
        }

        root.classList.add('auth-member');
        if (loginLink) loginLink.hidden = true;

        if (session.user.role === 'Council' || session.user.role === 'Officer') {
          root.classList.add('auth-staff');
          ensureAccountLink('bidding-manage.html', 'Bidding Manager');
          ensureAccountLink('mock-bidding.html', 'Mock Bidding');
        }

        if (session.user.role === 'Council') {
          root.classList.add('auth-council');
          ensureAccountLink('admin.html', 'Admin');
        }
      })
      .catch(() => {
        resetAuthUi();
      });
  };

  syncAuthUi();

  // Safari/iOS and other browsers may restore a page from BFCache after Logout.
  // Revalidate the session whenever such a page is restored.
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) syncAuthUi();
  });

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
