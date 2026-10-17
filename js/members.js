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

  const GROUPS = [
    { role: 'Council', title: 'Council', cardLabel: 'COUNCIL' },
    { role: 'Officer', title: 'Officers', cardLabel: 'OFFICER' },
    { role: 'Member', title: 'Triad Members', cardLabel: 'TRIAD MEMBER' },
  ];

  const memberCard = (member, label) => `
    <article class="member-card">
      <span class="member-card-label">${escapeHtml(label)}</span>
      <h3>${escapeHtml(member.ign)}</h3>
      <p>${escapeHtml(member.job)}</p>
    </article>
  `;

  const roleSection = (group, members) => {
    const groupMembers = members.filter((member) => member.role === group.role);
    return `
      <section class="member-role-group" data-member-role="${escapeHtml(group.role)}">
        <div class="member-role-heading">
          <div>
            <p class="eyebrow"><span class="section-marker">⟁</span>${escapeHtml(group.title)}</p>
            <h3>${escapeHtml(group.title)}</h3>
          </div>
          <span class="member-role-count">${groupMembers.length}</span>
        </div>
        <div class="member-role-grid">
          ${groupMembers.length
            ? groupMembers.map((member) => memberCard(member, group.cardLabel)).join('')
            : '<div class="member-role-empty">No profiles in this group yet.</div>'}
        </div>
      </section>
    `;
  };

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

      directory.innerHTML = GROUPS.map((group) => roleSection(group, members)).join('');
    } catch (error) {
      if (count) count.textContent = '';
      directory.innerHTML = `<div class="placeholder">${escapeHtml(error.message || 'Could not load members.')}</div>`;
    }
  };

  load();
})();
