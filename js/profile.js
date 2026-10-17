(() => {
  const form = document.querySelector('[data-profile-form]');
  if (!form) return;

  const status = document.querySelector('[data-profile-status]');
  const updated = document.querySelector('[data-profile-updated]');
  const saveButton = document.querySelector('[data-profile-save]');
  const editButton = document.querySelector('[data-profile-edit]');
  const numericFields = form.querySelectorAll('[data-number-kind]');
  const editableFields = Array.from(form.querySelectorAll('input[name], select[name]'));
  const jobField = form.elements.namedItem('job');
  const completionEl = document.querySelector('[data-profile-completion]');
  const verificationEl = document.querySelector('[data-profile-verification]');
  const verificationNoteEl = document.querySelector('[data-profile-verification-note]');

  let isEditing = false;
  let settings = null;
  let currentProfile = null;

  const preview = {
    role: document.querySelector('[data-threshold-role]'),
    finalPdef: document.querySelector('[data-final-pdef]'),
    finalMdef: document.querySelector('[data-final-mdef]'),
    finalPdefFormula: document.querySelector('[data-final-pdef-formula]'),
    finalMdefFormula: document.querySelector('[data-final-mdef-formula]'),
    finalPdefRange: document.querySelector('[data-final-pdef-range]'),
    finalMdefRange: document.querySelector('[data-final-mdef-range]'),
    pdamageReduction: document.querySelector('[data-pdamage-reduction-preview]'),
    mdamageReduction: document.querySelector('[data-mdamage-reduction-preview]'),
    pdamageReductionRange: document.querySelector('[data-pdamage-reduction-range]'),
    mdamageReductionRange: document.querySelector('[data-mdamage-reduction-range]'),
  };

  const SUPPORT_JOBS = new Set(['High Priest', 'Bard/Gypsy']);
  const COMPLETION_FIELDS = [
    'hp','pattack','mattack','pdamage','mdamage','pdamageReduction','mdamageReduction',
    'pdef','mdef','equipmentPdef','equipmentMdef','ignorePdef','ignoreMdef','critResist'
  ];

  const escapeText = (value) => String(value ?? '');

  const setStatus = (message, type = '') => {
    if (!status) return;
    status.textContent = message;
    status.dataset.statusType = type;
  };

  const numberValue = (name) => {
    const field = form.elements.namedItem(name);
    const value = Number(field?.value || 0);
    return Number.isFinite(value) ? value : 0;
  };

  const formatNumber = (value) => Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

  const computeDefense = (base, equipmentPercent) => {
    const divisor = 1 + (Number(equipmentPercent || 0) / 100);
    return divisor > 0 ? Number(base || 0) / divisor : 0;
  };

  const categoryForJob = (job) => {
    if (job === 'Sniper') return 'sniper';
    if (job === 'Biochemist') return 'bio';
    if (SUPPORT_JOBS.has(job)) return 'support';
    return 'dps';
  };

  const categoryLabel = (category) => ({
    dps: 'DPS',
    sniper: 'Sniper',
    support: 'Support',
    bio: 'Biochemist',
  }[category] || 'DPS');

  const thresholdFor = (job, metric) => {
    if (!settings?.thresholds) return null;
    const category = categoryForJob(job);
    return settings.thresholds?.[category]?.[metric] || null;
  };

  const thresholdClass = (value, threshold) => {
    if (!threshold) return '';
    if (value >= threshold.greenStart) return 'threshold-green';
    if (value >= threshold.midStart) {
      return threshold.midColor === 'orange' ? 'threshold-orange' : 'threshold-yellow';
    }
    return 'threshold-red';
  };

  const thresholdText = (threshold) => {
    if (!threshold) return 'Thresholds unavailable.';
    const midLabel = threshold.midColor === 'orange' ? 'Orange' : 'Yellow';
    return `Red ≤${threshold.redMax} · ${midLabel} ${threshold.midStart}–${threshold.greenStart - 1} · Green ${threshold.greenStart}+`;
  };

  const applyThreshold = (element, value, threshold) => {
    if (!element) return;
    element.classList.remove('threshold-red', 'threshold-orange', 'threshold-yellow', 'threshold-green');
    const className = thresholdClass(value, threshold);
    if (className) element.classList.add(className);
    element.textContent = formatNumber(value);
  };

  const updateCompletion = () => {
    if (!completionEl) return;
    const filled = COMPLETION_FIELDS.filter((name) => numberValue(name) > 0).length;
    completionEl.textContent = `${filled} / ${COMPLETION_FIELDS.length}`;
  };

  const verificationMeta = (profile) => {
    const statusValue = profile?.verificationStatus || 'unverified';
    if (statusValue === 'verified') {
      return { label: 'VERIFIED ✓', className: 'status-verified', note: profile?.verifiedAt ? `Verified ${new Date(profile.verifiedAt).toLocaleDateString()}` : 'Stats verified by staff.' };
    }
    if (statusValue === 'pending') {
      return { label: 'PENDING', className: 'status-pending', note: 'Waiting for Council / Officer verification.' };
    }
    if (statusValue === 'update_required') {
      return { label: 'UPDATE REQUIRED', className: 'status-update-required', note: profile?.verificationNote || 'Please update your stats and submit again.' };
    }
    return { label: 'UNVERIFIED', className: 'status-unverified', note: 'Submit your current stats to enter verification.' };
  };

  const updateVerification = (profile) => {
    const meta = verificationMeta(profile);
    if (verificationEl) {
      verificationEl.className = `profile-verification-status ${meta.className}`;
      verificationEl.textContent = meta.label;
    }
    if (verificationNoteEl) verificationNoteEl.textContent = meta.note;
  };

  const updateThresholdPreview = () => {
    const job = String(jobField?.value || '');
    const pdef = numberValue('pdef');
    const mdef = numberValue('mdef');
    const equipmentPdef = numberValue('equipmentPdef');
    const equipmentMdef = numberValue('equipmentMdef');
    const pReduction = numberValue('pdamageReduction');
    const mReduction = numberValue('mdamageReduction');
    const finalPdef = computeDefense(pdef, equipmentPdef);
    const finalMdef = computeDefense(mdef, equipmentMdef);

    if (preview.finalPdefFormula) {
      preview.finalPdefFormula.textContent = `${formatNumber(pdef)} ÷ (1 + ${formatNumber(equipmentPdef)} / 100) = ${formatNumber(finalPdef)}`;
    }
    if (preview.finalMdefFormula) {
      preview.finalMdefFormula.textContent = `${formatNumber(mdef)} ÷ (1 + ${formatNumber(equipmentMdef)} / 100) = ${formatNumber(finalMdef)}`;
    }

    updateCompletion();

    if (!job || !settings) {
      if (preview.role) preview.role.textContent = !job ? 'Select a job' : 'Loading thresholds';
      for (const element of [preview.finalPdef, preview.finalMdef, preview.pdamageReduction, preview.mdamageReduction]) {
        if (!element) continue;
        element.classList.remove('threshold-red', 'threshold-orange', 'threshold-yellow', 'threshold-green');
        element.textContent = '—';
      }
      return;
    }

    const category = categoryForJob(job);
    const pdefThreshold = thresholdFor(job, 'pdef');
    const mdefThreshold = thresholdFor(job, 'mdef');
    const pReductionThreshold = thresholdFor(job, 'pdamageReduction');
    const mReductionThreshold = thresholdFor(job, 'mdamageReduction');

    if (preview.role) preview.role.textContent = categoryLabel(category);
    applyThreshold(preview.finalPdef, finalPdef, pdefThreshold);
    applyThreshold(preview.finalMdef, finalMdef, mdefThreshold);
    applyThreshold(preview.pdamageReduction, pReduction, pReductionThreshold);
    applyThreshold(preview.mdamageReduction, mReduction, mReductionThreshold);

    if (preview.finalPdefRange) preview.finalPdefRange.textContent = thresholdText(pdefThreshold);
    if (preview.finalMdefRange) preview.finalMdefRange.textContent = thresholdText(mdefThreshold);
    if (preview.pdamageReductionRange) preview.pdamageReductionRange.textContent = thresholdText(pReductionThreshold);
    if (preview.mdamageReductionRange) preview.mdamageReductionRange.textContent = thresholdText(mReductionThreshold);
  };

  const setEditing = (editing) => {
    isEditing = Boolean(editing);
    editableFields.forEach((field) => {
      field.disabled = !isEditing;
    });

    if (saveButton) saveButton.disabled = !isEditing;
    if (editButton) {
      editButton.disabled = isEditing;
      editButton.textContent = isEditing ? 'Editing Stats' : 'Edit Stats';
    }

    form.dataset.editing = isEditing ? 'true' : 'false';
  };

  editButton?.addEventListener('click', () => {
    setEditing(true);
    const warning = currentProfile?.verificationStatus === 'verified'
      ? 'Editing enabled. Saving changes will return your verification status to Pending.'
      : 'Editing enabled. Update your stats, then press Save Profile.';
    setStatus(warning);
    editableFields[0]?.focus();
  });

  const sanitizeNumericValue = (value, kind) => {
    const text = escapeText(value);
    if (kind === 'integer') return text.replace(/\D/g, '');

    const cleaned = text.replace(/[^0-9.]/g, '');
    const firstDot = cleaned.indexOf('.');
    if (firstDot === -1) return cleaned;

    const whole = cleaned.slice(0, firstDot).replace(/\./g, '');
    const decimal = cleaned.slice(firstDot + 1).replace(/\./g, '');
    return `${whole || '0'}.${decimal}`;
  };

  numericFields.forEach((field) => {
    field.addEventListener('input', () => {
      const sanitized = sanitizeNumericValue(field.value, field.dataset.numberKind);
      if (field.value !== sanitized) field.value = sanitized;
      updateThresholdPreview();
    });

    field.addEventListener('blur', () => {
      if (!field.value || field.value === '.') {
        field.value = '0';
      } else if (field.dataset.numberKind === 'decimal' && field.value.endsWith('.')) {
        field.value = field.value.slice(0, -1) || '0';
      }
      updateThresholdPreview();
    });
  });

  jobField?.addEventListener('change', updateThresholdPreview);

  const displayDate = (value) => {
    if (!value) return 'Not saved yet';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Saved';
    return `Last updated · ${date.toLocaleString()}`;
  };

  const writeProfile = (profile) => {
    if (!profile) return;
    currentProfile = profile;

    for (const [key, value] of Object.entries(profile)) {
      const field = form.elements.namedItem(key);
      if (field && value !== null && value !== undefined) field.value = value;
    }

    if (updated) updated.textContent = displayDate(profile.updatedAt);
    updateVerification(profile);
    updateThresholdPreview();
  };

  const load = async () => {
    setStatus('Loading profile...');
    try {
      const response = await fetch('/api/profile/me', { credentials: 'same-origin' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Could not load your profile.');

      settings = data.settings || null;

      if (data.profile) {
        writeProfile(data.profile);
        setStatus('Profile loaded.');
      } else {
        currentProfile = null;
        updateVerification(null);
        updateThresholdPreview();
        setStatus('Set up your character profile below.');
      }
    } catch (error) {
      setStatus(error.message || 'Could not load your profile.', 'error');
    }
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!isEditing) return;

    const payload = {};
    new FormData(form).forEach((value, key) => {
      payload[key] = typeof value === 'string' ? value.trim() : value;
    });

    if (saveButton) saveButton.disabled = true;
    setStatus('Saving...');

    try {
      const response = await fetch('/api/profile/me', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Could not save your profile.');

      writeProfile(data.profile);
      setEditing(false);
      setStatus('Profile saved and submitted for verification.', 'success');
    } catch (error) {
      setStatus(error.message || 'Could not save your profile.', 'error');
    } finally {
      if (saveButton) saveButton.disabled = !isEditing;
    }
  });

  setEditing(false);
  updateVerification(null);
  updateThresholdPreview();
  load();
})();
