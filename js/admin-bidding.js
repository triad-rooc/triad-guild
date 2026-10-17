(() => {
  const list = document.querySelector('[data-bidding-admin-list]');
  const search = document.querySelector('[data-bidding-admin-search]');
  const filter = document.querySelector('[data-bidding-admin-filter]');
  const status = document.querySelector('[data-bidding-admin-status]');
  if (!list) return;

  const CATEGORIES = [
    'Illusion Card Fragment',
    'Light & Dark Feathers',
    'Time & Space Feathers',
  ];

  const EVENTS = [
    { key: 'tuesday_gl', label: 'Tuesday GL', day: 2 },
    { key: 'thursday_gl', label: 'Thursday GL', day: 4 },
    { key: 'sunday_eo', label: 'Sunday EO', day: 0 },
  ];

  let roster = [];
  let assignments = new Map();

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }[character]));

  const nextEventDate = (targetDay) => {
    const now = new Date();
    const guildNow = new Date(now.getTime() + (8 * 60 + now.getTimezoneOffset()) * 60000);
    const currentDay = guildNow.getDay();
    let offset = (targetDay - currentDay + 7) % 7;

    const currentHour = guildNow.getHours();
    if (offset === 0 && currentHour >= 20) offset = 7;

    const date = new Date(Date.UTC(
      guildNow.getFullYear(),
      guildNow.getMonth(),
      guildNow.getDate() + offset
    ));

    return [
      date.getUTCFullYear(),
      String(date.getUTCMonth() + 1).padStart(2, '0'),
      String(date.getUTCDate()).padStart(2, '0'),
    ].join('-');
  };

  const optionList = (values, selected, getValue = (value) => value, getLabel = (value) => value) =>
    values.map((value) => {
      const optionValue = getValue(value);
      return `<option value="${escapeHtml(optionValue)}" ${optionValue === selected ? 'selected' : ''}>${escapeHtml(getLabel(value))}</option>`;
    }).join('');

  const render = () => {
    const term = String(search?.value || '').trim().toLowerCase();
    const categoryFilter = filter?.value || 'all';

    const members = roster.filter((member) => {
      const assignment = assignments.get(member.discordId) || null;
      const matchesSearch = !term
        || String(member.ign || '').toLowerCase().includes(term)
        || String(member.job || '').toLowerCase().includes(term);

      let matchesCategory = true;
      if (categoryFilter === 'none') matchesCategory = !assignment;
      else if (categoryFilter !== 'all') matchesCategory = assignment?.category === categoryFilter;

      return matchesSearch && matchesCategory;
    });

    if (!members.length) {
      list.innerHTML = '<div class="placeholder">No matching members.</div>';
      return;
    }

    list.innerHTML = members.map((member) => {
      const assignment = assignments.get(member.discordId) || {};
      const defaultEvent = assignment.eventKey || 'tuesday_gl';
      const eventMeta = EVENTS.find((event) => event.key === defaultEvent) || EVENTS[0];
      const defaultDate = assignment.biddingDate || nextEventDate(eventMeta.day);

      return `
        <article class="bidding-admin-row" data-bidding-row="${escapeHtml(member.discordId)}">
          <div class="bidding-admin-member">
            <span class="member-card-label">${escapeHtml(member.guildRole || 'Member')}</span>
            <strong>${escapeHtml(member.ign)}</strong>
            <small>${escapeHtml(member.job || '')}</small>
          </div>

          <label>
            <span>Category</span>
            <select data-bid-field="category">
              ${optionList(CATEGORIES, assignment.category || CATEGORIES[0])}
            </select>
          </label>

          <label class="bidding-small-field">
            <span>Page</span>
            <input type="number" min="1" max="999" step="1" value="${escapeHtml(assignment.page || 1)}" data-bid-field="page" />
          </label>

          <label class="bidding-small-field">
            <span>Slot</span>
            <select data-bid-field="slot">
              ${optionList([1,2,3,4], Number(assignment.slot || 1), Number, (value) => `Slot ${value}`)}
            </select>
          </label>

          <label>
            <span>Guild Event</span>
            <select data-bid-field="eventKey">
              ${optionList(EVENTS, defaultEvent, (event) => event.key, (event) => event.label)}
            </select>
          </label>

          <label>
            <span>Bidding Date</span>
            <input type="date" value="${escapeHtml(defaultDate)}" data-bid-field="biddingDate" />
          </label>

          <div class="bidding-admin-actions">
            <button class="button primary" type="button" data-bid-save>Save</button>
            <button class="button" type="button" data-bid-clear ${assignment.discordId ? '' : 'disabled'}>Clear</button>
          </div>
        </article>
      `;
    }).join('');
  };

  const rowPayload = (row) => ({
    discordId: row.dataset.biddingRow,
    category: row.querySelector('[data-bid-field="category"]').value,
    page: Number(row.querySelector('[data-bid-field="page"]').value),
    slot: Number(row.querySelector('[data-bid-field="slot"]').value),
    eventKey: row.querySelector('[data-bid-field="eventKey"]').value,
    biddingDate: row.querySelector('[data-bid-field="biddingDate"]').value,
  });

  const saveAssignment = async (row, clear = false) => {
    const payload = clear
      ? { discordId: row.dataset.biddingRow, clear: true }
      : rowPayload(row);

    const response = await fetch('/api/bidding', {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'Could not save bidding assignment.');

    if (data.assignment) assignments.set(data.assignment.discordId, data.assignment);
    else assignments.delete(row.dataset.biddingRow);

    render();
    if (status) {
      status.textContent = clear ? 'Bidding assignment cleared.' : 'Bidding assignment saved.';
      status.dataset.statusType = 'success';
    }
  };

  list.addEventListener('change', (event) => {
    const eventSelect = event.target.closest('[data-bid-field="eventKey"]');
    if (!eventSelect) return;

    const row = eventSelect.closest('[data-bidding-row]');
    const eventMeta = EVENTS.find((item) => item.key === eventSelect.value);
    const dateField = row?.querySelector('[data-bid-field="biddingDate"]');
    if (eventMeta && dateField) dateField.value = nextEventDate(eventMeta.day);
  });

  list.addEventListener('click', async (event) => {
    const save = event.target.closest('[data-bid-save]');
    const clear = event.target.closest('[data-bid-clear]');
    if (!save && !clear) return;

    const button = save || clear;
    const row = button.closest('[data-bidding-row]');
    if (!row) return;

    const original = button.textContent;
    button.disabled = true;
    button.textContent = 'Saving...';

    try {
      await saveAssignment(row, Boolean(clear));
    } catch (error) {
      if (status) {
        status.textContent = error.message || 'Could not save bidding assignment.';
        status.dataset.statusType = 'error';
      }
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  });

  search?.addEventListener('input', render);
  filter?.addEventListener('change', render);

  const load = async () => {
    try {
      const [rosterResponse, biddingResponse] = await Promise.all([
        fetch('/api/roster', { credentials: 'same-origin' }),
        fetch('/api/bidding', { credentials: 'same-origin' }),
      ]);

      if (rosterResponse.status === 403) {
        window.location.replace('/members.html');
        return;
      }

      const rosterData = await rosterResponse.json().catch(() => ({}));
      const biddingData = await biddingResponse.json().catch(() => ({}));

      if (!rosterResponse.ok) throw new Error(rosterData.message || 'Could not load members.');
      if (!biddingResponse.ok) throw new Error(biddingData.message || 'Could not load bidding assignments.');

      roster = Array.isArray(rosterData.roster) ? rosterData.roster : [];
      assignments = new Map(
        (Array.isArray(biddingData.assignments) ? biddingData.assignments : [])
          .map((assignment) => [assignment.discordId, assignment])
      );

      render();
      if (status) status.textContent = `${assignments.size} member${assignments.size === 1 ? '' : 's'} currently assigned.`;
    } catch (error) {
      list.innerHTML = `<div class="placeholder">${escapeHtml(error.message || 'Could not load bidding management.')}</div>`;
    }
  };

  load();
})();
