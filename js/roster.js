(() => {
  const body = document.querySelector('[data-roster-body]');
  const count = document.querySelector('[data-roster-count]');
  const search = document.querySelector('[data-roster-search]');
  const filter = document.querySelector('[data-roster-filter]');
  const sort = document.querySelector('[data-roster-sort]');
  const summary = document.querySelector('[data-roster-summary]');
  const thresholdGuide = document.querySelector('[data-threshold-guide]');
  if (!body) return;

  let roster = [];
  let settings = null;

  const SUPPORT_JOBS = new Set(['Biochemist', 'High Priest', 'Bard/Gypsy']);

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

  const formatComputedDefense = (value) => {
    const number = Number(value);
    if (!Number.isFinite(number)) return '0';
    return number.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
  };

  const computeDefense = (baseDefense, equipmentPercent) => {
    const base = Number(baseDefense);
    const equipment = Number(equipmentPercent);
    if (!Number.isFinite(base) || !Number.isFinite(equipment)) return 0;
    return base / (1 + (equipment / 100));
  };

  const categoryForJob = (job) => {
    if (job === 'Sniper') return 'sniper';
    if (SUPPORT_JOBS.has(job)) return 'support';
    return 'dps';
  };

  const categoryLabel = (category) => ({
    dps: 'DPS',
    sniper: 'Sniper',
    support: 'Support',
  }[category] || 'DPS');

  const thresholdFor = (job, metric) => {
    if (!settings?.thresholds) return null;
    return settings.thresholds?.[categoryForJob(job)]?.[metric] || null;
  };

  const tierClass = (value, threshold) => {
    const number = Number(value);
    if (!threshold || !Number.isFinite(number)) return 'threshold-red';
    if (number >= threshold.greenStart) return 'threshold-green';
    if (number >= threshold.midStart) {
      return threshold.midColor === 'orange' ? 'threshold-orange' : 'threshold-yellow';
    }
    return 'threshold-red';
  };

  const thresholdTitle = (label, threshold) => {
    if (!threshold) return label;
    const midLabel = threshold.midColor === 'orange' ? 'Orange' : 'Yellow';
    return `${label}: Red ≤${threshold.redMax} · ${midLabel} ${threshold.midStart}–${threshold.greenStart - 1} · Green ${threshold.greenStart}+`;
  };

  const defenseCell = (value, job, metric, label) => {
    const threshold = thresholdFor(job, metric);
    const className = tierClass(value, threshold);
    return `<td class="defense-score" title="${escapeHtml(thresholdTitle(label, threshold))}"><span class="defense-value ${className}">${formatComputedDefense(value)}</span></td>`;
  };

  const reductionCell = (value, job, metric, label) => {
    const threshold = thresholdFor(job, metric);
    const className = tierClass(value, threshold);
    return `<td class="reduction-score" title="${escapeHtml(thresholdTitle(label, threshold))}"><span class="reduction-value ${className}">${formatNumber(value)}</span></td>`;
  };

  const ageInDays = (value) => {
    if (!value) return Infinity;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return Infinity;
    return Math.floor(Math.max(0, Date.now() - date.getTime()) / 86400000);
  };

  const relativeAge = (value) => {
    const days = ageInDays(value);
    if (!Number.isFinite(days)) return null;

    let label;
    if (days === 0) label = 'Today';
    else if (days === 1) label = '1 day ago';
    else if (days < 7) label = `${days} days ago`;
    else if (days < 28) {
      const weeks = Math.floor(days / 7);
      label = `${weeks} week${weeks === 1 ? '' : 's'} ago`;
    } else {
      const months = Math.max(1, Math.floor(days / 30));
      label = `${months} month${months === 1 ? '' : 's'} ago`;
    }

    const orangeStart = Number(settings?.freshness?.orangeStartDays ?? 14);
    const redStart = Number(settings?.freshness?.redStartDays ?? 21);

    let className = 'threshold-green';
    if (days >= redStart) className = 'threshold-red';
    else if (days >= orangeStart) className = 'threshold-orange';

    return { label, className, days };
  };

  const updateCell = (value) => {
    const age = relativeAge(value);
    if (!age) return '<td>—</td>';
    const exact = new Date(value).toLocaleString();
    return `<td class="freshness-score" title="Last updated: ${escapeHtml(exact)}"><span class="freshness-value ${age.className}">${escapeHtml(age.label)}</span></td>`;
  };

  const verificationMeta = (status) => {
    if (status === 'verified') return { label: 'Verified ✓', className: 'status-verified' };
    if (status === 'pending') return { label: 'Pending', className: 'status-pending' };
    if (status === 'update_required') return { label: 'Update Required', className: 'status-update-required' };
    return { label: 'Unverified', className: 'status-unverified' };
  };

  const verificationCell = (member) => {
    const meta = verificationMeta(member.verificationStatus);
    return `
      <td class="verification-cell">
        <span class="verification-pill ${meta.className}">${escapeHtml(meta.label)}</span>
        <div class="verification-actions">
          <button type="button" data-verify-action="verified" data-discord-id="${escapeHtml(member.discordId)}">Verify</button>
          <button type="button" data-verify-action="update_required" data-discord-id="${escapeHtml(member.discordId)}">Request Update</button>
        </div>
      </td>
    `;
  };

  const renderThresholdGuide = () => {
    if (!thresholdGuide || !settings?.thresholds) return;

    const metricLine = (label, threshold) => {
      const midClass = threshold.midColor === 'orange' ? 'threshold-orange' : 'threshold-yellow';
      const midLabel = threshold.midColor === 'orange' ? 'Orange' : 'Yellow';
      return `<strong><b>${escapeHtml(label)}</b> <i class="threshold-dot threshold-red"></i>≤${threshold.redMax} <i class="threshold-dot ${midClass}"></i>${threshold.midStart}–${threshold.greenStart - 1} <i class="threshold-dot threshold-green"></i>${threshold.greenStart}+</strong><small>${midLabel} = middle range</small>`;
    };

    thresholdGuide.innerHTML = ['dps', 'sniper', 'support'].map((category) => {
      const group = settings.thresholds[category];
      return `
        <div>
          <span>${categoryLabel(category)}</span>
          ${metricLine('PDEF', group.pdef)}
          ${metricLine('MDEF', group.mdef)}
          ${category === 'support' ? '<small>Biochemist · High Priest · Bard/Gypsy</small>' : ''}
        </div>
      `;
    }).join('');
  };

  const renderSummary = () => {
    if (!summary) return;
    const counts = {
      verified: roster.filter((member) => member.verificationStatus === 'verified').length,
      pending: roster.filter((member) => member.verificationStatus === 'pending').length,
      update: roster.filter((member) => member.verificationStatus === 'update_required').length,
      unverified: roster.filter((member) => !member.verificationStatus || member.verificationStatus === 'unverified').length,
    };

    summary.innerHTML = `
      <span><strong>${roster.length}</strong> Members</span>
      <span><strong>${counts.verified}</strong> Verified</span>
      <span><strong>${counts.pending}</strong> Pending</span>
      <span><strong>${counts.update}</strong> Need Update</span>
      <span><strong>${counts.unverified}</strong> Unverified</span>
    `;
  };

  const matchesFilter = (member, value) => {
    if (!value || value === 'all') return true;
    const category = categoryForJob(member.job);

    if (['dps', 'sniper', 'support'].includes(value)) return category === value;
    if (['verified', 'pending', 'update_required', 'unverified'].includes(value)) {
      return (member.verificationStatus || 'unverified') === value;
    }

    const days = ageInDays(member.updatedAt);
    if (value === 'stale-orange') return days >= Number(settings?.freshness?.orangeStartDays ?? 14);
    if (value === 'stale-red') return days >= Number(settings?.freshness?.redStartDays ?? 21);
    return true;
  };

  const sortedMembers = (members) => {
    const value = sort?.value || 'ign';
    const copy = [...members];

    if (value === 'pdef') {
      return copy.sort((a, b) => computeDefense(b.pdef, b.equipmentPdef) - computeDefense(a.pdef, a.equipmentPdef));
    }
    if (value === 'mdef') {
      return copy.sort((a, b) => computeDefense(b.mdef, b.equipmentMdef) - computeDefense(a.mdef, a.equipmentMdef));
    }
    if (value === 'pdr') return copy.sort((a, b) => Number(b.pdamageReduction) - Number(a.pdamageReduction));
    if (value === 'mdr') return copy.sort((a, b) => Number(b.mdamageReduction) - Number(a.mdamageReduction));
    if (value === 'oldest') return copy.sort((a, b) => ageInDays(b.updatedAt) - ageInDays(a.updatedAt));
    if (value === 'newest') return copy.sort((a, b) => ageInDays(a.updatedAt) - ageInDays(b.updatedAt));

    return copy.sort((a, b) => String(a.ign || '').localeCompare(String(b.ign || ''), undefined, { sensitivity: 'base' }));
  };

  const render = () => {
    const term = String(search?.value || '').trim().toLowerCase();
    const filterValue = filter?.value || 'all';

    let filtered = roster.filter((member) => {
      const matchesSearch = !term
        || String(member.ign || '').toLowerCase().includes(term)
        || String(member.job || '').toLowerCase().includes(term);
      return matchesSearch && matchesFilter(member, filterValue);
    });

    filtered = sortedMembers(filtered);

    if (count) count.textContent = `${filtered.length} / ${roster.length} members`;

    if (!filtered.length) {
      body.innerHTML = '<tr><td colspan="16">No matching members.</td></tr>';
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
        ${reductionCell(member.pdamageReduction, member.job, 'pdamageReduction', 'PDamage Reduction')}
        ${reductionCell(member.mdamageReduction, member.job, 'mdamageReduction', 'MDamage Reduction')}
        ${defenseCell(computeDefense(member.pdef, member.equipmentPdef), member.job, 'pdef', 'Final PDEF')}
        ${defenseCell(computeDefense(member.mdef, member.equipmentMdef), member.job, 'mdef', 'Final MDEF')}
        <td>${formatNumber(member.ignorePdef)}</td>
        <td>${formatNumber(member.ignoreMdef)}</td>
        <td>${formatNumber(member.critResist)}</td>
        ${verificationCell(member)}
        ${updateCell(member.updatedAt)}
      </tr>
    `).join('');
  };

  const setVerification = async (discordId, statusValue) => {
    const response = await fetch('/api/verification', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ discordId, status: statusValue }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'Could not update verification.');

    const index = roster.findIndex((member) => member.discordId === data.profile?.discordId);
    if (index >= 0) roster[index] = data.profile;
    renderSummary();
    render();
  };

  body.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-verify-action]');
    if (!button) return;

    const discordId = button.dataset.discordId;
    const action = button.dataset.verifyAction;
    if (!discordId || !action) return;

    button.disabled = true;
    const original = button.textContent;
    button.textContent = 'Saving...';

    try {
      await setVerification(discordId, action);
    } catch (error) {
      window.alert(error.message || 'Could not update verification.');
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  });

  search?.addEventListener('input', render);
  filter?.addEventListener('change', render);
  sort?.addEventListener('change', render);

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
      settings = data.settings || null;
      renderThresholdGuide();
      renderSummary();
      render();
    } catch (error) {
      if (count) count.textContent = '';
      body.innerHTML = `<tr><td colspan="16">${escapeHtml(error.message || 'Could not load the roster.')}</td></tr>`;
    }
  };

  load();
})();
