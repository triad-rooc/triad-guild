(() => {
  const root = document.documentElement;
  const navToggle = document.querySelector('.nav-toggle');
  const nav = document.querySelector('.site-nav');
  const themeToggle = document.querySelector('[data-theme-toggle]');

  const getTheme = () => root.dataset.theme || 'dark';

  const updateThemeButton = () => {
    if (!themeToggle) return;
    const current = getTheme();
    const next = current === 'dark' ? 'LIGHT' : 'DARK';
    themeToggle.textContent = next;
    themeToggle.setAttribute('aria-label', `Switch to ${next.toLowerCase()} theme`);
    themeToggle.setAttribute('title', `Switch to ${next.toLowerCase()} theme`);
  };

  const insertBeforeTheme = (element) => {
    if (!nav) return;
    const theme = nav.querySelector('[data-theme-toggle]');
    if (theme) nav.insertBefore(element, theme);
    else nav.append(element);
  };

  const addLoginLink = () => {
    if (!nav || nav.querySelector('.login-link')) return;
    const login = document.createElement('a');
    login.className = 'login-link';
    login.href = '/login.html';
    login.textContent = 'Login';
    insertBeforeTheme(login);
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

  if (navToggle && nav) {
    navToggle.addEventListener('click', () => {
      const isOpen = nav.classList.toggle('open');
      navToggle.setAttribute('aria-expanded', String(isOpen));
    });
  }

  // Public visitors see Home + Events. Authenticated TRIAD members unlock the rest.
  if (nav && !document.body.classList.contains('login-page-body')) {
    fetch('/api/auth/session', { credentials: 'same-origin' })
      .then((response) => response.ok ? response.json() : null)
      .then((session) => {
        if (!session || !session.authenticated || !session.user) {
          addLoginLink();
          return;
        }

        root.classList.add('auth-member');

        const userBadge = document.createElement('span');
        userBadge.className = 'user-badge';
        userBadge.textContent = session.user.name || 'TRIAD MEMBER';

        const logout = document.createElement('a');
        logout.className = 'logout-link';
        logout.href = '/api/auth/logout';
        logout.textContent = 'Logout';

        insertBeforeTheme(userBadge);
        insertBeforeTheme(logout);
      })
      .catch(() => addLoginLink());
  }

  // Automatic weekly guild event reminder (TRIAD schedule, Japan time).
  const reminder = document.querySelector('.event-reminder');
  if (reminder) {
    const schedule = [
      { day: 2, name: 'Guild League', label: 'Tuesday' },
      { day: 4, name: 'Guild League', label: 'Thursday' },
      { day: 0, name: 'Emperium Overrun', label: 'Sunday' }
    ];

    const weekdayShort = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Tokyo',
      weekday: 'short'
    }).format(new Date());

    const weekdayMap = {
      Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6
    };

    const today = weekdayMap[weekdayShort];
    const ranked = schedule
      .map((event) => ({ ...event, offset: (event.day - today + 7) % 7 }))
      .sort((a, b) => a.offset - b.offset);

    const nextEvent = ranked[0];
    const status = reminder.querySelector('[data-event-status]');
    const name = reminder.querySelector('[data-event-name]');
    const when = reminder.querySelector('[data-event-when]');

    if (name) name.textContent = nextEvent.name;

    if (nextEvent.offset === 0) {
      if (status) status.textContent = 'TODAY';
      if (when) when.textContent = `${nextEvent.label} · Guild event day`;
    } else {
      if (status) status.textContent = 'NEXT EVENT';
      if (when) {
        const daysText = nextEvent.offset === 1 ? '1 day' : `${nextEvent.offset} days`;
        when.textContent = `${nextEvent.label} · In ${daysText}`;
      }
    }

    reminder.querySelectorAll('[data-event-day]').forEach((item) => {
      item.classList.toggle('is-next', Number(item.dataset.eventDay) === nextEvent.day);
    });
  }

})();
