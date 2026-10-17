(() => {
  const form = document.querySelector('[data-profile-form]');
  if (!form) return;

  const status = document.querySelector('[data-profile-status]');
  const updated = document.querySelector('[data-profile-updated]');
  const saveButton = document.querySelector('[data-profile-save]');
  const numericFields = form.querySelectorAll('[data-number-kind]');
  const jobField = form.elements.namedItem('job');

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

  const SUPPORT_JOBS = new Set(['Biochemist', 'High Priest', 'Bard/Gypsy']);

  const numberValue = (name) => {
    const field = form.elements.namedItem(name);
    const value = Number(field?.value || 0);
    return Number.isFinite(value) ? value : 0;
  };

  const formatPreviewNumber = (value) => Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

  const computeDefense = (base, equipmentPercent) => {
    const divisor = 1 + (Number(equipmentPercent || 0) / 100);
    return divisor > 0 ? Number(base || 0) / divisor : 0;
  };

  const defenseThresholds = (job, type) => {
    const isPdef = type === 'p';

    if (job === 'Sniper') {
      return isPdef
        ? { role: 'Sniper', redMax: 2899, middle: 2900, green: 3000 }
        : { role: 'Sniper', redMax: 999, middle: 1000, green: 1250 };
    }

    if (SUPPORT_JOBS.has(job)) {
      return isPdef
        ? { role: 'Support', redMax: 7399, middle: 7400, green: 7500 }
        : { role: 'Support', redMax: 1999, middle: 2000, green: 2200 };
    }

    return isPdef
      ? { role: 'DPS', redMax: 3699, middle: 3700, green: 3850 }
      : { role: 'DPS', redMax: 1199, middle: 1200, green: 1350 };
  };

  const reductionThresholds = (job, type) => {
    if (SUPPORT_JOBS.has(job)) {
      return type === 'p'
        ? { role: 'Support', redMax: 179, middle: 180, green: 190, middleLabel: 'Yellow', middleClass: 'threshold-yellow' }
        : { role: 'Support', redMax: 109, middle: 110, green: 120, middleLabel: 'Yellow', middleClass: 'threshold-yellow' };
    }

    return type === 'p'
      ? { role: job === 'Sniper' ? 'Sniper' : 'DPS', redMax: 149, middle: 150, green: 160, middleLabel: 'Orange', middleClass: 'threshold-orange' }
      : { role: job === 'Sniper' ? 'Sniper' : 'DPS', redMax: 99, middle: 100, green: 110, middleLabel: 'Orange', middleClass: 'threshold-orange' };
  };

  const thresholdClass = (value, thresholds) => {
    if (value >= thresholds.green) return 'threshold-green';
    if (value >= thresholds.middle) return thresholds.middleClass || 'threshold-yellow';
    return 'threshold-red';
  };

  const thresholdText = (thresholds) =>
    `Red ≤${thresholds.redMax} · ${thresholds.middleLabel || 'Yellow'} ${thresholds.middle}–${thresholds.green - 1} · Green ${thresholds.green}+`;

  const applyThresholdPreview = (element, value, thresholds) => {
    if (!element) return;
    element.classList.remove('threshold-red', 'threshold-orange', 'threshold-yellow', 'threshold-green');
    element.classList.add(thresholdClass(value, thresholds));
    element.textContent = formatPreviewNumber(value);
  };

  const updateThresholdPreview = () => {
    const job = String(jobField?.value || '');
    const pdef = numberValue('pdef');
    const mdef = numberValue('mdef');
    const equipmentPdef = numberValue('equipmentPdef');
    const equipmentMdef = numberValue('equipmentMdef');
    const pdamageReduction = numberValue('pdamageReduction');
    const mdamageReduction = numberValue('mdamageReduction');

    const finalPdef = computeDefense(pdef, equipmentPdef);
    const finalMdef = computeDefense(mdef, equipmentMdef);

    if (preview.finalPdefFormula) {
      preview.finalPdefFormula.textContent = `${formatPreviewNumber(pdef)} ÷ (1 + ${formatPreviewNumber(equipmentPdef)} / 100) = ${formatPreviewNumber(finalPdef)}`;
    }
    if (preview.finalMdefFormula) {
      preview.finalMdefFormula.textContent = `${formatPreviewNumber(mdef)} ÷ (1 + ${formatPreviewNumber(equipmentMdef)} / 100) = ${formatPreviewNumber(finalMdef)}`;
    }

    if (!job) {
      if (preview.role) preview.role.textContent = 'Select a job';
      for (const element of [preview.finalPdef, preview.finalMdef, preview.pdamageReduction, preview.mdamageReduction]) {
        if (!element) continue;
        element.classList.remove('threshold-red', 'threshold-orange', 'threshold-yellow', 'threshold-green');
        element.textContent = '—';
      }
      for (const element of [preview.finalPdefRange, preview.finalMdefRange, preview.pdamageReductionRange, preview.mdamageReductionRange]) {
        if (element) element.textContent = 'Choose a job to see your threshold.';
      }
      return;
    }

    const pdefThresholds = defenseThresholds(job, 'p');
    const mdefThresholds = defenseThresholds(job, 'm');
    const pReductionThresholds = reductionThresholds(job, 'p');
    const mReductionThresholds = reductionThresholds(job, 'm');

    if (preview.role) preview.role.textContent = pdefThresholds.role;
    applyThresholdPreview(preview.finalPdef, finalPdef, pdefThresholds);
    applyThresholdPreview(preview.finalMdef, finalMdef, mdefThresholds);
    applyThresholdPreview(preview.pdamageReduction, pdamageReduction, pReductionThresholds);
    applyThresholdPreview(preview.mdamageReduction, mdamageReduction, mReductionThresholds);

    if (preview.finalPdefRange) preview.finalPdefRange.textContent = thresholdText(pdefThresholds);
    if (preview.finalMdefRange) preview.finalMdefRange.textContent = thresholdText(mdefThresholds);
    if (preview.pdamageReductionRange) preview.pdamageReductionRange.textContent = thresholdText(pReductionThresholds);
    if (preview.mdamageReductionRange) preview.mdamageReductionRange.textContent = thresholdText(mReductionThresholds);
  };

  const sanitizeNumericValue = (value, kind) => {
    const text = String(value ?? '');

    if (kind === 'integer') {
      return text.replace(/\D/g, '');
    }

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
        updateThresholdPreview();
        return;
      }

      if (field.dataset.numberKind === 'decimal' && field.value.endsWith('.')) {
        field.value = field.value.slice(0, -1) || '0';
      }
      updateThresholdPreview();
    });
  });

  jobField?.addEventListener('change', updateThresholdPreview);

  const setStatus = (message, type = '') => {
    if (!status) return;
    status.textContent = message;
    status.dataset.statusType = type;
  };

  const displayDate = (value) => {
    if (!value) return 'Not saved yet';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Saved';
    return `Last updated · ${date.toLocaleString()}`;
  };

  const writeProfile = (profile) => {
    if (!profile) return;

    for (const [key, value] of Object.entries(profile)) {
      const field = form.elements.namedItem(key);
      if (field && value !== null && value !== undefined) field.value = value;
    }

    if (updated) updated.textContent = displayDate(profile.updatedAt);
    updateThresholdPreview();
  };

  const load = async () => {
    setStatus('Loading profile...');
    try {
      const response = await fetch('/api/profile/me', { credentials: 'same-origin' });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.message || 'Could not load your profile.');
      }

      if (data.profile) {
        writeProfile(data.profile);
        setStatus('Profile loaded.');
      } else {
        setStatus('Set up your character profile below.');
      }
    } catch (error) {
      setStatus(error.message || 'Could not load your profile.', 'error');
    }
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const payload = {};
    new FormData(form).forEach((value, key) => {
      payload[key] = typeof value === 'string' ? value.trim() : value;
    });

    saveButton.disabled = true;
    setStatus('Saving...');

    try {
      const response = await fetch('/api/profile/me', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.message || 'Could not save your profile.');
      }

      writeProfile(data.profile);
      setStatus('Profile saved.', 'success');
    } catch (error) {
      setStatus(error.message || 'Could not save your profile.', 'error');
    } finally {
      saveButton.disabled = false;
    }
  });

  updateThresholdPreview();
  load();
})();
