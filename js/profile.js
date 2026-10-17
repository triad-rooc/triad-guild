(() => {
  const form = document.querySelector('[data-profile-form]');
  if (!form) return;

  const status = document.querySelector('[data-profile-status]');
  const updated = document.querySelector('[data-profile-updated]');
  const saveButton = document.querySelector('[data-profile-save]');
  const numericFields = form.querySelectorAll('[data-number-kind]');

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
    });

    field.addEventListener('blur', () => {
      if (!field.value || field.value === '.') {
        field.value = '0';
        return;
      }

      if (field.dataset.numberKind === 'decimal' && field.value.endsWith('.')) {
        field.value = field.value.slice(0, -1) || '0';
      }
    });
  });

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

  load();
})();
