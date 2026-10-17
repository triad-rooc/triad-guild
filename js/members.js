(() => {
  const directory = document.querySelector('[data-member-directory]');
  const count = document.querySelector('[data-member-count]');
  if (!directory) return;

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }[character]));

  const load = async () => {
    try {
      const response = await fetch('/api/members', { credentials: 'same-origin' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Could not load members.');

      const members = Array.isArray(data.members) ? data.members : [];
      if (count) count.textContent = `${members.length} member${members.length === 1 ? '' : 's'}`;

      if (!members.length) {
        directory.innerHTML = '<div class="placeholder">No member profiles have been submitted yet.</div>';
        return;
      }

      directory.innerHTML = members.map((member) => `
        <article class="member-card">
          <span class="member-card-label">TRIAD MEMBER</span>
          <h3>${escapeHtml(member.ign)}</h3>
          <p>${escapeHtml(member.job)}</p>
        </article>
      `).join('');
    } catch (error) {
      if (count) count.textContent = '';
      directory.innerHTML = `<div class="placeholder">${escapeHtml(error.message || 'Could not load members.')}</div>`;
    }
  };

  load();
})();
