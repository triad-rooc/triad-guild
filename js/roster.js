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
    return base / (1 + (equipment / 100));
  };

  const formatComputedDefense = (value) => {
    const number = Number(value);
    if (!Number.isFinite(number)) return '0';
    return number.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
  };

  const SUPPORT_JOBS = new Set(['Biochemist', 'High Priest', 'Bard/Gypsy']);

  const defenseThresholds = (job) => {
    if (job === 'Sniper') {
      return { label: 'Sniper', red: 3600, orange: 3800, green: 4000 };
    }

    if (SUPPORT_JOBS.has(job)) {
      return { label: 'Support', red: 4600, orange: 4800, green: 5300 };
    }

    return { label: 'DPS', red: 3800, orange: 4000, green: 4200 };
  };

  const defenseTier = (value, job) => {
    const thresholds = defenseThresholds(job);
    const number = Number(value);

    if (!Number.isFinite(number)) {
      return { className: 'threshold-red', thresholds };
    }

    if (number >= thresholds.green) {
      return { className: 'threshold-green', thresholds };
    }

    if (number >= thresholds.orange) {
      return { className: 'threshold-orange', thresholds };
    }

    return { className: 'threshold-red', thresholds };
  };

  const defenseCell = (value, job) => {
    const tier = defenseTier(value, job);
    const belowRed = Number(value) < tier.thresholds.red;
    const note = belowRed ? ' · Below red target' : '';
    const title = `${tier.thresholds.label}: Red ${tier.thresholds.red}+ · Orange ${tier.thresholds.orange}+ · Green ${tier.thresholds.green}+${note}`;

    return `<td class="defense-score" title="${escapeHtml(title)}"><span class="defense-value ${tier.className}">${formatComputedDefense(value)}</span></td>`;
  };

  const reductionTier = (value, type, job) => {
    if (SUPPORT_JOBS.has(job)) return null;

    const number = Number(value);
    if (!Number.isFinite(number)) return null;

    const thresholds = type === 'p'
      ? { label: 'DPS PDamage Reduction', red: 140, orange: 150, green: 160 }
      : { label: 'DPS MDamage Reduction', red: 80, orange: 100, green: 110 };

    if (number >= thresholds.green) return { className: 'threshold-green', thresholds };
    if (number >= thresholds.orange) return { className: 'threshold-orange', thresholds };
    return { className: 'threshold-red', thresholds };
  };

  const reductionCell = (value, type, job) => {
    const tier = reductionTier(value, type, job);
    if (!tier) return `<td>${formatNumber(value)}</td>`;

    const title = `${tier.thresholds.label}: Red ${tier.thresholds.red}+ · Orange ${tier.thresholds.orange}+ · Green ${tier.thresholds.green}+`;
    return `<td class="reduction-score" title="${escapeHtml(title)}"><span class="reduction-value ${tier.className}">${formatNumber(value)}</span></td>`;
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
      body.innerHTML = '<tr><td colspan="15">No matching members.</td></tr>';
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
        ${reductionCell(member.pdamageReduction, 'p', member.job)}
        ${reductionCell(member.mdamageReduction, 'm', member.job)}
        ${defenseCell(computeDefense(member.pdef, member.equipmentPdef), member.job)}
        ${defenseCell(computeDefense(member.mdef, member.equipmentMdef), member.job)}
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
      body.innerHTML = `<tr><td colspan="15">${escapeHtml(error.message || 'Could not load the roster.')}</td></tr>`;
    }
  };

  load();
})();
