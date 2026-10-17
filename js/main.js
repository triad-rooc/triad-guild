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
})();
