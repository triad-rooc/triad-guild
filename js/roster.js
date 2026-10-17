(() => {
  const body = document.querySelector('[data-roster-body]');
  const count = document.querySelector('[data-roster-count]');
  const search = document.querySelector('[data-roster-search]');
  if (!body) return;

  let roster = [];

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }[character]));

  const formatNumber = (value) => {
    const number = Number(value);
    if (!Number.isFinite(number)) return '0';
    return number.toLocaleString(undefined, { maximumFractionDigits: 4 });
  };

  const computeDefense = (baseDefense, equipmentPercent) => {
    const base = Number(baseDefense);
    const equipment = Number(equipmentPercent);
    if (!Number.isFinite(base) || !Number.isFinite(equipment)) return 0;
    return base * (1 + (equipment / 100));
  };

  const formatComputedDefense = (value) => {
    const number = Number(value);
    if (!Number.isFinite(number)) return '0';
    return number.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
  };

  const formatDate = (value) => {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString();
  };

  const render = () => {
    const term = String(search?.value || '').trim().toLowerCase();
    const filtered = roster.filter((member) => {
      if (!term) return true;
      return String(member.ign || '').toLowerCase().includes(term)
        || String(member.job || '').toLowerCase().includes(term);
    });

    if (count) count.textContent = `${filtered.length} / ${roster.length} members`;

    if (!filtered.length) {
      body.innerHTML = '<tr><td colspan="13">No matching members.</td></tr>';
      return;
    }

    body.innerHTML = filtered.map((member) => `
      <tr>
        <td class="roster-name">${escapeHtml(member.ign)}</td>
        <td>${escapeHtml(member.job)}</td>
        <td>${formatNumber(member.hp)}</td>
        <td>${formatNumber(member.pattack)}</td>
        <td>${formatNumber(member.mattack)}</td>
        <td>${formatNumber(member.pdamage)}</td>
        <td>${formatNumber(member.mdamage)}</td>
        <td>${formatComputedDefense(computeDefense(member.pdef, member.equipmentPdef))}</td>
        <td>${formatComputedDefense(computeDefense(member.mdef, member.equipmentMdef))}</td>
        <td>${formatNumber(member.ignorePdef)}</td>
        <td>${formatNumber(member.ignoreMdef)}</td>
        <td>${formatNumber(member.critResist)}</td>
        <td>${formatDate(member.updatedAt)}</td>
      </tr>
    `).join('');
  };

  search?.addEventListener('input', render);

  const load = async () => {
    try {
      const response = await fetch('/api/roster', { credentials: 'same-origin' });
      const data = await response.json().catch(() => ({}));

      if (response.status === 403) {
        window.location.replace('/members.html');
        return;
      }

      if (!response.ok) throw new Error(data.message || 'Could not load the roster.');

      roster = Array.isArray(data.roster) ? data.roster : [];
      render();
    } catch (error) {
      if (count) count.textContent = '';
      body.innerHTML = `<tr><td colspan="13">${escapeHtml(error.message || 'Could not load the roster.')}</td></tr>`;
    }
  };

  load();
})();
