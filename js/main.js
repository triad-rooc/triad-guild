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

  // TRIAD member session controls (Vercel only; silently ignored on GitHub Pages).
  if (nav && !document.body.classList.contains('login-page-body')) {
    fetch('/api/auth/session', { credentials: 'same-origin' })
      .then((response) => response.ok ? response.json() : null)
      .then((session) => {
        if (!session || !session.authenticated || !session.user) return;

        const userBadge = document.createElement('span');
        userBadge.className = 'user-badge';
        userBadge.textContent = session.user.name || 'TRIAD MEMBER';

        const logout = document.createElement('a');
        logout.className = 'logout-link';
        logout.href = '/api/auth/logout';
        logout.textContent = 'Logout';

        const theme = nav.querySelector('[data-theme-toggle]');
        if (theme) {
          nav.insertBefore(userBadge, theme);
          nav.insertBefore(logout, theme);
        } else {
          nav.append(userBadge, logout);
        }
      })
      .catch(() => {});
  }

})();
