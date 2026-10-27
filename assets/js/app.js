(() => {
  'use strict';

  /* ========== Konfigurasi ========== */
  const STORAGE_KEY = 'todo-app:v1';
  const MAX_LENGTH = 120;
  const MAX_TASKS = 500;

  /* ========== Validasi ========== */
  const normalize = (value) => String(value).replace(/\s+/g, ' ').trim();

  const isValidTask = (t) =>
    t !== null && typeof t === 'object' &&
    typeof t.id === 'string' && t.id.length > 0 && t.id.length <= 64 &&
    typeof t.text === 'string' && typeof t.done === 'boolean';

  // Terima "YYYY-MM-DDTHH:MM" (dengan atau tanpa detik), simpan tanpa detik
  const DUE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;
  const cleanDue = (v) =>
    (typeof v === 'string' && DUE_PATTERN.test(v) && !Number.isNaN(new Date(v).getTime()))
      ? v.slice(0, 16) : null;
  const cleanCreated = (v) => (Number.isFinite(v) && v > 0) ? v : Date.now();
  // Fallback untuk browser lama yang belum mendukung opsi dateStyle/timeStyle
  const dateFmt = (() => {
    try {
      return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
    } catch {
      return { format: (d) => d.toLocaleString('id-ID') };
    }
  })();

  const makeId = () =>
    (window.crypto && crypto.randomUUID)
      ? crypto.randomUUID()
      : Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

  /* ========== Lapisan penyimpanan ========== */
  const Storage = {
    load() {
      try {
        // 1) Ambil teks (string JSON) dari localStorage; null jika belum pernah disimpan
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw === null) return [];
        // 2) Ubah string kembali menjadi array objek JavaScript
        const data = JSON.parse(raw);
        if (!Array.isArray(data)) return [];
        return data
          .filter(isValidTask)
          .slice(0, MAX_TASKS)
          .map((t) => ({
            id: t.id,
            text: normalize(t.text).slice(0, MAX_LENGTH),
            done: t.done,
            createdAt: cleanCreated(t.createdAt),
            due: cleanDue(t.due),
          }));
      } catch {
        return []; // data rusak atau storage tidak tersedia
      }
    },
    save(tasks) {
      try {
        // Ubah array objek menjadi string JSON, lalu simpan (localStorage hanya menerima teks)
        const json = JSON.stringify(tasks);
        localStorage.setItem(STORAGE_KEY, json);
      } catch {
        /* penyimpanan penuh atau diblokir: aplikasi tetap jalan di memori */
      }
    },
  };

  /* ========== State & aksi ========== */
  // Dipanggil sekali saat halaman pertama dibuka: string -> array objek untuk ditampilkan
  const state = { tasks: Storage.load(), filter: 'all', editingId: null };

  const Actions = {
    add(rawText, rawDue) {
      const text = normalize(rawText);
      if (!text) return 'Tugas tidak boleh kosong.';
      if (text.length > MAX_LENGTH) return `Maksimal ${MAX_LENGTH} karakter.`;
      if (state.tasks.length >= MAX_TASKS) return `Maksimal ${MAX_TASKS} tugas.`;
      if (rawDue && !cleanDue(rawDue)) return 'Format tanggal dan jam tidak valid.';
      state.tasks.unshift({ id: makeId(), text, done: false, createdAt: Date.now(), due: cleanDue(rawDue) });
      return null;
    },
    toggle(id) {
      const task = state.tasks.find((t) => t.id === id);
      if (task) task.done = !task.done;
    },
    rename(id, rawText) {
      const text = normalize(rawText);
      if (!text || text.length > MAX_LENGTH) return false;
      const task = state.tasks.find((t) => t.id === id);
      if (task) task.text = text;
      return true;
    },
    remove(id) {
      state.tasks = state.tasks.filter((t) => t.id !== id);
    },
    clearDone() {
      state.tasks = state.tasks.filter((t) => !t.done);
    },
  };

  /* ========== View ========== */
  const $ = (id) => document.getElementById(id);
  const els = {
    form: $('task-form'), input: $('task-input'), due: $('due-input'), error: $('task-error'),
    list: $('task-list'), empty: $('empty-state'), counter: $('counter'),
    summary: $('summary'), filters: $('filters'), clearDone: $('clear-done'),
  };

  const EMPTY_TEXT = {
    all: 'Belum ada tugas. Tulis satu di atas untuk memulai.',
    active: 'Semua tugas sudah selesai.',
    done: 'Belum ada tugas yang selesai.',
  };

  function button(label, className, action) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `btn btn-sm ${className}`;
    b.dataset.action = action;
    b.textContent = label;
    return b;
  }

  function buildMeta(task) {
    const meta = document.createElement('div');
    meta.className = 'task-meta small text-secondary';

    const created = document.createElement('span');
    created.textContent = `Dibuat ${dateFmt.format(new Date(task.createdAt))}`;
    meta.append(created);

    if (task.due) {
      const dueDate = new Date(task.due);
      const overdue = !task.done && dueDate.getTime() < Date.now();
      const badge = document.createElement('span');
      badge.className = 'badge ms-2 ' + (overdue ? 'text-bg-danger' : 'text-bg-light border');
      badge.textContent = `${overdue ? 'Lewat tenggat' : 'Tenggat'} ${dateFmt.format(dueDate)}`;
      meta.append(badge);
    }
    return meta;
  }

  function buildItem(task) {
    const li = document.createElement('li');
    li.className = 'list-group-item d-flex align-items-center gap-2 task-item' + (task.done ? ' is-done' : '');
    li.dataset.id = task.id;

    if (state.editingId === task.id) {
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'form-control form-control-sm';
      input.maxLength = MAX_LENGTH;
      input.value = task.text;
      input.dataset.role = 'edit-input';
      input.setAttribute('aria-label', 'Ubah teks tugas');
      li.append(input, button('Simpan', 'btn-primary', 'save'), button('Batal', 'btn-outline-secondary', 'cancel'));
      return li;
    }

    const check = document.createElement('input');
    check.type = 'checkbox';
    check.className = 'form-check-input mt-0';
    check.checked = task.done;
    check.dataset.action = 'toggle';
    check.setAttribute('aria-label', `Tandai selesai: ${task.text}`);

    const body = document.createElement('div');
    body.className = 'task-body';
    const text = document.createElement('span');
    text.className = 'task-text';
    text.textContent = task.text; // textContent: aman dari XSS
    body.append(text, buildMeta(task));

    li.append(check, body, button('Ubah', 'btn-outline-secondary', 'edit'), button('Hapus', 'btn-outline-danger', 'delete'));
    return li;
  }

  function render() {
    const visible = state.tasks.filter((t) =>
      state.filter === 'all' ? true : state.filter === 'done' ? t.done : !t.done);

    els.list.replaceChildren(...visible.map(buildItem));

    els.empty.hidden = visible.length > 0;
    els.empty.textContent = EMPTY_TEXT[state.filter];

    const remaining = state.tasks.filter((t) => !t.done).length;
    const doneCount = state.tasks.length - remaining;
    els.counter.textContent = `${remaining} tugas tersisa`;
    els.summary.textContent = state.tasks.length
      ? `${doneCount} dari ${state.tasks.length} tugas selesai`
      : 'Catat apa yang perlu dikerjakan.';
    els.clearDone.disabled = doneCount === 0;

    els.filters.querySelectorAll('[data-filter]').forEach((b) => {
      const active = b.dataset.filter === state.filter;
      b.classList.toggle('active', active);
      b.setAttribute('aria-pressed', String(active));
    });

    const editInput = els.list.querySelector('[data-role="edit-input"]');
    if (editInput) { editInput.focus(); editInput.select(); }
  }

  function commit() {
    Storage.save(state.tasks);
    render();
  }

  function showError(message) {
    els.error.textContent = message || '';
    els.input.classList.toggle('is-invalid', Boolean(message));
  }

  /* ========== Controller (event) ========== */
  els.form.addEventListener('submit', (e) => {
    e.preventDefault();
    const error = Actions.add(els.input.value, els.due.value);
    showError(error);
    if (error) return;
    els.input.value = '';
    els.due.value = '';
    commit();
  });

  els.input.addEventListener('input', () => showError(''));

  els.filters.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-filter]');
    if (!btn) return;
    state.filter = btn.dataset.filter;
    render();
  });

  els.clearDone.addEventListener('click', () => {
    Actions.clearDone();
    commit();
  });

  els.list.addEventListener('change', (e) => {
    if (e.target.dataset.action !== 'toggle') return;
    Actions.toggle(e.target.closest('li').dataset.id);
    commit();
  });

  els.list.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const li = btn.closest('li');
    const id = li.dataset.id;

    switch (btn.dataset.action) {
      case 'edit':
        state.editingId = id;
        render();
        break;
      case 'cancel':
        state.editingId = null;
        render();
        break;
      case 'save': {
        const value = li.querySelector('[data-role="edit-input"]').value;
        if (Actions.rename(id, value)) {
          state.editingId = null;
          commit();
        }
        break;
      }
      case 'delete':
        Actions.remove(id);
        commit();
        break;
    }
  });

  els.list.addEventListener('keydown', (e) => {
    if (e.target.dataset.role !== 'edit-input') return;
    if (e.key === 'Enter') {
      e.preventDefault();
      li_save(e.target);
    } else if (e.key === 'Escape') {
      state.editingId = null;
      render();
    }
  });

  function li_save(input) {
    const id = input.closest('li').dataset.id;
    if (Actions.rename(id, input.value)) {
      state.editingId = null;
      commit();
    }
  }

  render();
  // Segarkan status "lewat tenggat" tiap menit, kecuali saat sedang mengubah tugas
  setInterval(() => { if (!state.editingId) render(); }, 60000);
})();
