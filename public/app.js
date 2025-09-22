const state = {
  guilds: [],
  currentGuild: null,
  persons: [],
  currentPersonId: null,
  currentPerson: null,
  entries: [],
  editingEntryId: null,
};

const guildSelect = document.getElementById('guildSelect');
const personListEl = document.getElementById('personList');
const refreshButton = document.getElementById('refreshButton');
const emptyStateEl = document.getElementById('emptyState');
const personViewEl = document.getElementById('personView');
const personNameEl = document.getElementById('personName');
const personMetaEl = document.getElementById('personMeta');
const threadLinkEl = document.getElementById('threadLink');
const threadWarningEl = document.getElementById('threadWarning');
const summaryInput = document.getElementById('summaryInput');
const summaryCountEl = document.getElementById('summaryCount');
const summaryEditorIdInput = document.getElementById('summaryEditorId');
const saveSummaryButton = document.getElementById('saveSummaryButton');
const entryForm = document.getElementById('entryForm');
const entryTitleInput = document.getElementById('entryTitle');
const entryBodyInput = document.getElementById('entryBody');
const entryAuthorInput = document.getElementById('entryAuthor');
const entryFormHint = document.getElementById('entryFormHint');
const cancelEditButton = document.getElementById('cancelEditButton');
const refreshLinksButton = document.getElementById('refreshLinksButton');
const entryListEl = document.getElementById('entryList');
const entryCountEl = document.getElementById('entryCount');
const toastEl = document.getElementById('toast');
const entrySubmitButton = entryForm.querySelector('button[type="submit"]');

const personCards = new Map();

const fetchJson = async (input, init) => {
  const response = await fetch(input, init);
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const data = await response.json();
      if (data?.error) {
        message = data.error;
      }
    } catch (_) {
      // ignore
    }
    throw new Error(message);
  }
  return response.json();
};

const showToast = (message, type = 'success') => {
  toastEl.textContent = message;
  toastEl.classList.remove('hidden', 'success', 'error');
  toastEl.classList.add(type);
  setTimeout(() => {
    toastEl.classList.add('hidden');
  }, 2600);
};

const setLoading = (loading) => {
  if (loading) {
    personListEl.setAttribute('aria-busy', 'true');
  } else {
    personListEl.removeAttribute('aria-busy');
  }
};

const renderGuildOptions = () => {
  guildSelect.innerHTML = '';
  if (!state.guilds.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No guilds configured';
    guildSelect.appendChild(option);
    guildSelect.disabled = true;
    emptyStateEl.querySelector('p').textContent = 'Configure the bot in Discord to begin.';
    emptyStateEl.classList.remove('hidden');
    return;
  }

  guildSelect.disabled = false;
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Select a guild…';
  guildSelect.appendChild(placeholder);

  state.guilds.forEach((guildId) => {
    const option = document.createElement('option');
    option.value = guildId;
    option.textContent = guildId;
    guildSelect.appendChild(option);
  });

  if (state.currentGuild) {
    guildSelect.value = state.currentGuild;
  }
};

const renderPersonList = () => {
  personListEl.innerHTML = '';
  personCards.clear();

  if (!state.persons.length) {
    const empty = document.createElement('div');
    empty.className = 'meta';
    empty.textContent = 'No dossiers yet. Use ?add in Discord to create one.';
    personListEl.appendChild(empty);
    return;
  }

  state.persons.forEach((person) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'person-item';
    card.dataset.id = String(person.id);
    card.innerHTML = `
      <h3>${person.name}</h3>
      <p>${person.summary_md ? person.summary_md.replace(/\s+/g, ' ').slice(0, 120) : '(summary pending)'}</p>
    `;

    card.addEventListener('click', () => {
      selectPerson(person.id);
    });

    if (person.id === state.currentPersonId) {
      card.classList.add('active');
    }

    personListEl.appendChild(card);
    personCards.set(person.id, card);
  });
};

const updateSummaryCount = () => {
  const value = summaryInput.value || '';
  summaryCountEl.textContent = `${value.length}/600`;
};

const resetEntryForm = () => {
  state.editingEntryId = null;
  entryTitleInput.value = '';
  entryBodyInput.value = '';
  entryAuthorInput.value = '';
  entryAuthorInput.placeholder = 'Discord user ID (optional)';
  entryFormHint.classList.add('hidden');
  cancelEditButton.classList.add('hidden');
  entrySubmitButton.textContent = 'Post Entry';
};

const startEntryEdit = (entry) => {
  if (!state.currentPerson || !state.currentPerson.discord_thread_id) {
    showToast('Cannot edit entries until the dossier thread exists.', 'error');
    return;
  }

  state.editingEntryId = entry.id;
  entryTitleInput.value = entry.title;
  entryBodyInput.value = entry.body_md;
  entryAuthorInput.value = entry.updated_by ?? entry.created_by ?? '';
  entryAuthorInput.placeholder = 'Discord user ID of editor (optional)';
  entryFormHint.textContent = `Editing entry created ${new Date(entry.created_at).toLocaleString()}`;
  entryFormHint.classList.remove('hidden');
  cancelEditButton.classList.remove('hidden');
  entrySubmitButton.textContent = 'Save Changes';
  renderEntries();
  entryTitleInput.focus();
};

const renderEntries = () => {
  entryListEl.innerHTML = '';

  if (!state.entries.length) {
    const empty = document.createElement('div');
    empty.className = 'meta';
    empty.textContent = 'No entries yet.';
    entryListEl.appendChild(empty);
    entryCountEl.textContent = '0 entries';
    return;
  }

  entryCountEl.textContent = `${state.entries.length} entr${state.entries.length === 1 ? 'y' : 'ies'}`;

  state.entries
    .slice()
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .forEach((entry) => {
      const item = document.createElement('article');
      item.className = 'entry-item';
      if (state.editingEntryId === entry.id) {
        item.classList.add('editing');
      }

      const titleEl = document.createElement('h4');
      titleEl.textContent = entry.title;

      const createdAt = new Date(entry.created_at);
      const updatedAt = new Date(entry.updated_at);
      const metaParts = [];

      if (!Number.isNaN(createdAt.getTime())) {
        metaParts.push(`Created ${createdAt.toLocaleString()}`);
      }
      if (entry.created_by) {
        metaParts.push(`by ${entry.created_by}`);
      }
      if (!Number.isNaN(updatedAt.getTime()) && entry.updated_at !== entry.created_at) {
        const updatedLabel = `Updated ${updatedAt.toLocaleString()}${entry.updated_by ? ` by ${entry.updated_by}` : ''}`;
        metaParts.push(updatedLabel);
      }

      const metaEl = document.createElement('time');
      metaEl.textContent = metaParts.join(' · ');

      const bodyEl = document.createElement('div');
      bodyEl.className = 'entry-body';
      bodyEl.textContent = entry.body_md;

      const actionsEl = document.createElement('div');
      actionsEl.className = 'entry-actions';
      const editButton = document.createElement('button');
      editButton.type = 'button';
      editButton.className = 'button button-secondary button-small';
      editButton.textContent = state.editingEntryId === entry.id ? 'Editing…' : 'Edit';
      editButton.addEventListener('click', () => startEntryEdit(entry));
      editButton.disabled = !state.currentPerson?.discord_thread_id;
      actionsEl.appendChild(editButton);

      item.appendChild(titleEl);
      item.appendChild(metaEl);
      item.appendChild(bodyEl);
      item.appendChild(actionsEl);

      entryListEl.appendChild(item);
    });
};

const renderPersonView = () => {
  if (!state.currentPerson) {
    emptyStateEl.classList.remove('hidden');
    personViewEl.classList.add('hidden');
    return;
  }

  emptyStateEl.classList.add('hidden');
  personViewEl.classList.remove('hidden');

  const person = state.currentPerson;
  personNameEl.textContent = person.name;

  const aliasText = person.aliases?.length ? `Aliases: ${person.aliases.join(', ')}` : 'No aliases yet';
  const updatedText = person.updated_at ? `Updated ${new Date(person.updated_at).toLocaleString()}` : '';
  personMetaEl.textContent = `${aliasText}${updatedText ? ` · ${updatedText}` : ''}`;

  summaryInput.value = person.summary_md ?? '';
  summaryEditorIdInput.value = '';
  updateSummaryCount();

  if (person.discord_thread_id) {
    threadLinkEl.href = `https://discord.com/channels/${person.guild_id}/${person.discord_thread_id}`;
    threadLinkEl.classList.remove('button-disabled');
    threadWarningEl.classList.add('hidden');
    saveSummaryButton.disabled = false;
    refreshLinksButton.disabled = false;
    entryForm.querySelectorAll('input, textarea, button').forEach((el) => (el.disabled = false));
    entrySubmitButton.textContent = state.editingEntryId ? 'Save Changes' : 'Post Entry';
  } else {
    threadLinkEl.href = '#';
    threadLinkEl.classList.add('button-disabled');
    threadWarningEl.classList.remove('hidden');
    saveSummaryButton.disabled = true;
    refreshLinksButton.disabled = true;
    resetEntryForm();
    entryForm.querySelectorAll('input, textarea, button').forEach((el) => (el.disabled = true));
  }

  renderEntries();
};

const selectPerson = async (personId) => {
  if (!state.currentGuild) return;

  resetEntryForm();
  state.currentPersonId = personId;
  personCards.forEach((card) => card.classList.remove('active'));
  const selectedCard = personCards.get(personId);
  if (selectedCard) {
    selectedCard.classList.add('active');
  }

  try {
    const data = await fetchJson(`/api/persons/${personId}`);
    state.currentPerson = data.person;
    state.entries = data.entries;
    renderPersonView();
  } catch (error) {
    showToast(error.message, 'error');
  }
};

const loadPersons = async () => {
  if (!state.currentGuild) {
    state.persons = [];
    resetEntryForm();
    renderPersonList();
    emptyStateEl.classList.remove('hidden');
    personViewEl.classList.add('hidden');
    return;
  }

  try {
    setLoading(true);
    const data = await fetchJson(`/api/persons?guild_id=${encodeURIComponent(state.currentGuild)}`);
    state.persons = data.persons || [];
    renderPersonList();

    if (state.persons.length) {
      const candidate = state.persons.find((p) => p.id === state.currentPersonId) ?? state.persons[0];
      await selectPerson(candidate.id);
    } else {
      state.currentPersonId = null;
      state.currentPerson = null;
      state.entries = [];
      resetEntryForm();
      renderPersonView();
    }
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    setLoading(false);
  }
};

const init = async () => {
  try {
    const config = await fetchJson('/api/config');
    state.guilds = config.guilds || [];
    renderGuildOptions();
    if (state.guilds.length === 1) {
      state.currentGuild = state.guilds[0];
      guildSelect.value = state.currentGuild;
      await loadPersons();
    }
  } catch (error) {
    showToast(error.message, 'error');
  }
};

summaryInput.addEventListener('input', updateSummaryCount);

guildSelect.addEventListener('change', async (event) => {
  const guildId = event.target.value;
  state.currentGuild = guildId || null;
  state.currentPersonId = null;
  state.currentPerson = null;
  state.entries = [];
  resetEntryForm();
  renderPersonView();
  await loadPersons();
});

refreshButton.addEventListener('click', async () => {
  if (!state.currentGuild) {
    showToast('Select a guild first', 'error');
    return;
  }
  resetEntryForm();
  await loadPersons();
  showToast('Refreshed dossiers');
});

cancelEditButton.addEventListener('click', () => {
  resetEntryForm();
  renderEntries();
});

refreshLinksButton.addEventListener('click', async () => {
  if (!state.currentPerson) return;
  if (!state.currentPerson.discord_thread_id) {
    showToast('Dossier thread missing. Recreate it in Discord before refreshing.', 'error');
    return;
  }

  refreshLinksButton.disabled = true;
  try {
    const data = await fetchJson(`/api/persons/${state.currentPerson.id}/refresh-links`, {
      method: 'POST',
    });
    await loadPersons();
    showToast(`Refreshed ${data.updated} entr${data.updated === 1 ? 'y' : 'ies'}${data.reposted ? ` · ${data.reposted} re-posted` : ''}`);
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    refreshLinksButton.disabled = false;
  }
});

saveSummaryButton.addEventListener('click', async () => {
  if (!state.currentPerson) return;
  const summary = summaryInput.value.trim();
  if (!summary) {
    showToast('Summary cannot be empty', 'error');
    return;
  }
  if (summary.length > 600) {
    showToast('Summary must be 600 characters or less', 'error');
    return;
  }

  saveSummaryButton.disabled = true;
  try {
    const payload = {
      summary_md: summary,
    };
    const editorId = summaryEditorIdInput.value.trim();
    if (editorId) {
      payload.updated_by = editorId;
    }

    const data = await fetchJson(`/api/persons/${state.currentPerson.id}/summary`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    state.currentPerson = data.person;
    summaryEditorIdInput.value = '';
    updateSummaryCount();
    await loadPersons();
    showToast('Summary saved');
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    saveSummaryButton.disabled = false;
  }
});

entryForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!state.currentPerson) return;
  if (!state.currentPerson.discord_thread_id) {
    showToast('Dossier thread missing. Recreate it in Discord before posting.', 'error');
    return;
  }

  const title = entryTitleInput.value.trim();
  const body = entryBodyInput.value.trim();
  if (!title || !body) {
    showToast('Title and body are required', 'error');
    return;
  }

  const isEditing = Boolean(state.editingEntryId);
  const payload = { title, body_md: body };
  const userId = entryAuthorInput.value.trim();
  if (isEditing) {
    if (userId) payload.updated_by = userId;
  } else if (userId) {
    payload.created_by = userId;
  }

  entrySubmitButton.disabled = true;

  try {
    if (isEditing && state.editingEntryId !== null) {
      const data = await fetchJson(`/api/persons/${state.currentPerson.id}/entries/${state.editingEntryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      resetEntryForm();
      await loadPersons();
      showToast(data.reposted ? 'Entry updated (a new Discord message was posted)' : 'Entry updated');
    } else {
      const data = await fetchJson(`/api/persons/${state.currentPerson.id}/entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      resetEntryForm();
      await loadPersons();
      showToast('Entry posted');
    }
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    entrySubmitButton.disabled = false;
  }
});

init();
