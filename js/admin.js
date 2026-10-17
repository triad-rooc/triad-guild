(() => {
  const form = document.querySelector('[data-admin-settings-form]');
  const thresholdEditor = document.querySelector('[data-admin-thresholds]');
  const adminStatus = document.querySelector('[data-admin-status]');
  const settingsStatus = document.querySelector('[data-settings-status]');
  const summary = document.querySelector('[data-admin-summary]');
  const memberList = document.querySelector('[data-admin-member-list]');
  const memberSearch = document.querySelector('[data-admin-member-search]');
  const resetButton = document.querySelector('[data-reset-settings]');
  if (!form || !thresholdEditor) return;

  let settings = null;
  let defaults = null;
  let roster = [];

  const ROLE_META = [
    { key: 'dps', label: 'DPS' },
    { key: 'sniper', label: 'Sniper' },
    { key: 'support', label: 'Support' },
    { key: 'bio', label: 'Biochemist' },
  ];

  const METRIC_META = [
    { key: 'pdef', label: 'Final PDEF' },
    { key: 'mdef', label: 'Final MDEF' },
    { key: 'pdamageReduction', label: 'PDamage Reduction' },
    { key: 'mdamageReduction', label: 'MDamage Reduction' },
  ];

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }[character]));

  const clone = (value) => JSON.parse(JSON.stringify(value));

  const getPath = (object, path) => path.split('.').reduce((value, key) => value?.[key], object);

  const setPath = (object, path, value) => {
    const parts = path.split('.');
    const last = parts.pop();
    const parent = parts.reduce((target, key) => {
      if (!target[key]) target[key] = {};
      return target[key];
    }, object);
    parent[last] = value;
  };

  const verificationMeta = (status) => {
    if (status === 'verified') return { label: 'Verified ✓', className: 'status-verified' };
    if (status === 'pending') return { label: 'Pending', className: 'status-pending' };
    if (status === 'update_required') return { label: 'Update Required', className: 'status-update-required' };
    return { label: 'Unverified', className: 'status-unverified' };
  };

  const relativeDate = (value) => {
    if (!value) return 'Never';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Unknown';
    const days = Math.floor(Math.max(0, Date.now() - date.getTime()) / 86400000);
    if (days === 0) return 'Today';
    if (days === 1) return '1 day ago';
    if (days < 7) return `${days} days ago`;
    if (days < 28) {
      const weeks = Math.floor(days / 7);
      return `${weeks} week${weeks === 1 ? '' : 's'} ago`;
    }
    const months = Math.max(1, Math.floor(days / 30));
    return `${months} month${months === 1 ? '' : 's'} ago`;
  };

  const renderThresholds = () => {
    if (!settings) return;

    thresholdEditor.innerHTML = ROLE_META.map((role) => `
      <section class="admin-role-threshold">
        <div class="admin-role-heading">
          <span>${escapeHtml(role.label)}</span>
          <small>${role.key === 'support' ? 'High Priest · Bard/Gypsy' : role.key === 'bio' ? 'Biochemist only' : role.key === 'sniper' ? 'Sniper only' : 'All other DPS jobs'}</small>
        </div>
        <div class="admin-metric-grid">
          ${METRIC_META.map((metric) => {
            const threshold = settings.thresholds[role.key][metric.key];
            const midLabel = threshold.midColor === 'orange' ? 'Orange' : 'Yellow';
            const base = `thresholds.${role.key}.${metric.key}`;
            return `
              <div class="admin-metric-card">
                <strong>${escapeHtml(metric.label)}</strong>
                <label><span>Red max</span><input type="number" min="0" step="1" value="${threshold.redMax}" data-setting-path="${base}.redMax" /></label>
                <label><span>${midLabel} starts</span><input type="number" min="0" step="1" value="${threshold.midStart}" data-setting-path="${base}.midStart" /></label>
                <label><span>Green starts</span><input type="number" min="0" step="1" value="${threshold.greenStart}" data-setting-path="${base}.greenStart" /></label>
              </div>
            `;
          }).join('')}
        </div>
      </section>
    `).join('');

    form.querySelectorAll('[data-setting-path]').forEach((input) => {
      const value = getPath(settings, input.dataset.settingPath);
      if (value !== undefined) input.value = value;
    });
  };

  const readSettingsForm = () => {
    const next = clone(settings);
    form.querySelectorAll('[data-setting-path]').forEach((input) => {
      setPath(next, input.dataset.settingPath, Number(input.value));
    });
    return next;
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
      <div><span>Total Members</span><strong>${roster.length}</strong></div>
      <div><span>Verified</span><strong class="status-verified">${counts.verified}</strong></div>
      <div><span>Pending</span><strong class="status-pending">${counts.pending}</strong></div>
      <div><span>Need Update</span><strong class="status-update-required">${counts.update}</strong></div>
      <div><span>Unverified</span><strong>${counts.unverified}</strong></div>
    `;
  };

  const renderMembers = () => {
    if (!memberList) return;
    const term = String(memberSearch?.value || '').trim().toLowerCase();
    const members = roster.filter((member) => !term
      || String(member.ign || '').toLowerCase().includes(term)
      || String(member.job || '').toLowerCase().includes(term));

    if (!members.length) {
      memberList.innerHTML = '<div class="placeholder">No matching members.</div>';
      return;
    }

    memberList.innerHTML = members.map((member) => {
      const meta = verificationMeta(member.verificationStatus);
      return `
        <article class="admin-member-row">
          <div class="admin-member-main">
            <span class="member-card-label">${escapeHtml(member.guildRole || 'Member')}</span>
            <strong>${escapeHtml(member.ign)}</strong>
            <small>${escapeHtml(member.job)} · Updated ${escapeHtml(relativeDate(member.updatedAt))}</small>
          </div>
          <span class="verification-pill ${meta.className}">${escapeHtml(meta.label)}</span>
          <div class="verification-actions">
            <button type="button" data-admin-verify="verified" data-discord-id="${escapeHtml(member.discordId)}">Verify</button>
            <button type="button" data-admin-verify="update_required" data-discord-id="${escapeHtml(member.discordId)}">Request Update</button>
            <button type="button" data-admin-verify="pending" data-discord-id="${escapeHtml(member.discordId)}">Set Pending</button>
          </div>
        </article>
      `;
    }).join('');
  };

  const updateVerification = async (discordId, status) => {
    const response = await fetch('/api/verification', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ discordId, status }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'Could not update verification.');

    const index = roster.findIndex((member) => member.discordId === data.profile?.discordId);
    if (index >= 0) roster[index] = data.profile;
    renderSummary();
    renderMembers();
  };

  memberList?.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-admin-verify]');
    if (!button) return;

    const original = button.textContent;
    button.disabled = true;
    button.textContent = 'Saving...';

    try {
      await updateVerification(button.dataset.discordId, button.dataset.adminVerify);
    } catch (error) {
      window.alert(error.message || 'Could not update verification.');
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  });

  memberSearch?.addEventListener('input', renderMembers);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    settingsStatus.textContent = 'Saving settings...';

    try {
      const next = readSettingsForm();
      const response = await fetch('/api/settings', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: next }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Could not save settings.');

      settings = data.settings;
      renderThresholds();
      settingsStatus.textContent = 'Settings saved. Roster and Profile will use the new values immediately.';
      settingsStatus.dataset.statusType = 'success';
    } catch (error) {
      settingsStatus.textContent = error.message || 'Could not save settings.';
      settingsStatus.dataset.statusType = 'error';
    }
  });

  resetButton?.addEventListener('click', () => {
    if (!defaults) return;
    settings = clone(defaults);
    renderThresholds();
    settingsStatus.textContent = 'Default values loaded into the form. Press Save Settings to apply them.';
    settingsStatus.dataset.statusType = '';
  });

  const load = async () => {
    try {
      const [settingsResponse, rosterResponse] = await Promise.all([
        fetch('/api/settings', { credentials: 'same-origin' }),
        fetch('/api/roster', { credentials: 'same-origin' }),
      ]);

      if (settingsResponse.status === 403 || rosterResponse.status === 403) {
        window.location.replace('/members.html');
        return;
      }

      const settingsData = await settingsResponse.json().catch(() => ({}));
      const rosterData = await rosterResponse.json().catch(() => ({}));

      if (!settingsResponse.ok) throw new Error(settingsData.message || 'Could not load settings.');
      if (!rosterResponse.ok) throw new Error(rosterData.message || 'Could not load roster.');

      settings = settingsData.settings;
      defaults = settingsData.defaults;
      roster = Array.isArray(rosterData.roster) ? rosterData.roster : [];

      renderThresholds();
      renderSummary();
      renderMembers();
      if (adminStatus) adminStatus.textContent = 'Council Only';
    } catch (error) {
      if (adminStatus) adminStatus.textContent = 'Load Error';
      if (settingsStatus) settingsStatus.textContent = error.message || 'Could not load admin panel.';
    }
  };

  load();
})();
