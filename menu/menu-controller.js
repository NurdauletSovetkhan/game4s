export class MenuController {
  constructor({ categories, audio }) {
    this.categories = categories;
    this.audio = audio;
    this.selectedMode = 'single';

    this.menuGridEl = document.getElementById('menuGrid');
    this.joinRoomBtn = document.getElementById('joinRoom');
    this.roomCodeEl = document.getElementById('roomCode');
    this.playerNameEl = document.getElementById('playerName');
    this.menuStatusEl = document.getElementById('menuStatus');
    this.singleModeBtn = document.getElementById('singleModeBtn');
    this.multiModeBtn = document.getElementById('multiModeBtn');
    this.multiplayerPanelEl = document.querySelector('.multiplayer-panel');
  }

  init() {
    window.addEventListener('pointerdown', () => this.audio.ensureAudio(), { once: true });
    window.addEventListener('keydown', () => this.audio.ensureAudio(), { once: true });

    this.joinRoomBtn?.addEventListener('click', () => {
      this.audio.playClick();
      setTimeout(() => {
        this.joinRoom();
      }, 90);
    });

    this.singleModeBtn?.addEventListener('click', () => {
      this.audio.playClick();
      this.selectMode('single');
    });

    this.multiModeBtn?.addEventListener('click', () => {
      this.audio.playClick();
      this.selectMode('multi');
    });

    this.roomCodeEl?.addEventListener('input', () => {
      this.roomCodeEl.value = this.roomCodeEl.value
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 6);
    });

    this.roomCodeEl?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') this.joinRoom();
    });

    this.renderCategoryButtons();
    this.updateModeUi();
  }

  getPlayerName() {
    const value = String(this.playerNameEl?.value || '').trim();
    if (!value) return 'Игрок';
    return value.slice(0, 24);
  }

  setStatus(text) {
    if (this.menuStatusEl) this.menuStatusEl.textContent = text;
  }

  updateModeUi() {
    const single = this.selectedMode === 'single';

    if (this.singleModeBtn) {
      this.singleModeBtn.classList.toggle('is-active', single);
      this.singleModeBtn.setAttribute('aria-pressed', String(single));
    }

    if (this.multiModeBtn) {
      this.multiModeBtn.classList.toggle('is-active', !single);
      this.multiModeBtn.setAttribute('aria-pressed', String(!single));
    }

    if (this.multiplayerPanelEl) {
      this.multiplayerPanelEl.hidden = single;
    }

    this.setStatus(
      single
        ? 'Выбран одиночный режим. Выбери категорию для старта.'
        : 'Выбран онлайн 1v1. Введи код комнаты или создай новую через категорию.'
    );
  }

  selectMode(mode) {
    this.selectedMode = mode === 'multi' ? 'multi' : 'single';
    this.updateModeUi();
  }

  startSinglePlayer(categoryId) {
    const params = new URLSearchParams({
      mode: 'single',
      category: categoryId
    });
    window.location.href = `./index.html?${params.toString()}`;
  }

  async createRoom(categoryId) {
    this.setStatus('Создаю комнату…');

    const response = await fetch('./api/room/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: categoryId, name: this.getPlayerName() })
    });

    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.error || 'Не удалось создать комнату');
    }

    const params = new URLSearchParams({
      mode: 'multi',
      room: data.roomCode,
      player: data.playerId,
      category: data.category
    });
    window.location.href = `./index.html?${params.toString()}`;
  }

  async joinRoom() {
    const roomCode = String(this.roomCodeEl?.value || '').trim().toUpperCase();
    if (!roomCode) {
      this.setStatus('Введи код комнаты.');
      return;
    }

    this.setStatus('Подключаюсь к комнате…');

    const response = await fetch('./api/room/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomCode, name: this.getPlayerName() })
    });

    const data = await response.json();
    if (!response.ok || !data.ok) {
      this.setStatus(data.error || 'Не удалось войти в комнату.');
      return;
    }

    const params = new URLSearchParams({
      mode: 'multi',
      room: data.roomCode,
      player: data.playerId,
      category: data.category
    });
    window.location.href = `./index.html?${params.toString()}`;
  }

  renderCategoryButtons() {
    if (!this.menuGridEl) return;

    for (const category of this.categories) {
      const button = document.createElement('button');
      button.className = 'cat-btn';
      button.innerHTML = `<span class="cat-btn__title">${category.title}</span><span class="cat-btn__meta">Сложность ${category.difficulty} · ${category.description}</span>`;
      button.addEventListener('click', async () => {
        this.audio.playClick();
        await new Promise((resolve) => setTimeout(resolve, 90));

        if (this.selectedMode === 'single') {
          this.startSinglePlayer(category.id);
          return;
        }

        try {
          await this.createRoom(category.id);
        } catch (error) {
          this.setStatus(error.message || 'Ошибка при создании комнаты.');
        }
      });

      this.menuGridEl.appendChild(button);
    }
  }
}
