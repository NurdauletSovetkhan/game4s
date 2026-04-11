export function createQuizController({
  game,
  quizModalEl,
  questionLabelEl,
  answerInputEl,
  initAudio,
  parseAnswerInput,
  setMessage,
  isMultiplayer,
  isMyTurn,
  adjustScore,
  addLives,
  playCorrectSound,
  playWrongSound,
  saveActiveTurnState,
  syncRoom
}) {
  function createQuestion() {
    if (!game.selectedCategory) return null;
    return game.selectedCategory.createQuestion();
  }

  function closeQuizModal() {
    quizModalEl.hidden = true;
  }

  function openQuizModal(reasonText) {
    if (isMultiplayer() && !isMyTurn()) {
      closeQuizModal();
      return;
    }

    if (isMultiplayer() && game.shotsRemaining > 0) {
      closeQuizModal();
      game.shotUnlocked = true;
      setMessage(`Твой ход: осталось ${game.shotsRemaining} удар(а).`);
      return;
    }

    if (game.shotUnlocked) {
      closeQuizModal();
      return;
    }

    if (game.currentQuestion && !quizModalEl.hidden && !game.shotUnlocked) {
      setMessage(reasonText);
      return;
    }

    game.shotUnlocked = false;
    game.currentQuestion = createQuestion();

    if (!game.currentQuestion) {
      questionLabelEl.textContent = 'Сначала выбери категорию в меню.';
      quizModalEl.hidden = false;
      setMessage(reasonText);
      return;
    }

    questionLabelEl.textContent = game.currentQuestion.text;
    answerInputEl.value = '';
    quizModalEl.hidden = false;
    setMessage(reasonText);
    setTimeout(() => answerInputEl.focus(), 0);
  }

  function onCorrectAnswer() {
    const reward = 8 * game.selectedCategory.difficulty;
    let lifeGain = 1;
    adjustScore(reward);
    if (isMultiplayer()) {
      game.shotsRemaining = 2;
      lifeGain = 2;
      addLives(2);
    } else {
      addLives(1);
    }
    game.shotUnlocked = true;
    closeQuizModal();
    playCorrectSound();

    if (isMultiplayer()) {
      setMessage(`Верно! Удар открыт (+${reward} очков, +${lifeGain} жизни). Осталось ударов: ${game.shotsRemaining}.`);
    } else {
      setMessage(`Верно! Удар открыт (+${reward} очков, +${lifeGain} жизнь).`);
    }

    if (isMultiplayer()) {
      saveActiveTurnState();
      syncRoom({ passTurn: false, allowAnyPlayer: false, silent: true }).catch((error) => {
        setMessage(`Сеть: ${error.message}`);
      });
    }
  }

  function handleAnswerSubmit() {
    initAudio();

    if (isMultiplayer() && !isMyTurn()) {
      setMessage('Сейчас ход соперника.');
      return;
    }

    if (!game.currentQuestion) return;

    const value = parseAnswerInput(answerInputEl.value);
    if (Number.isNaN(value)) {
      setMessage('Введи число (можно десятичное или дробь).');
      return;
    }

    const diff = Math.abs(value - game.currentQuestion.answer);
    const tolerance = game.currentQuestion.tolerance ?? 0.02;

    if (diff <= tolerance) {
      onCorrectAnswer();
      return;
    }

    adjustScore(-2 * game.selectedCategory.difficulty);
    playWrongSound();
    setMessage('Неверно. Попробуй снова.');

    if (isMultiplayer()) {
      saveActiveTurnState();
      syncRoom({ passTurn: false, allowAnyPlayer: false, silent: true }).catch((error) => {
        setMessage(`Сеть: ${error.message}`);
      });
    }
  }

  return {
    createQuestion,
    openQuizModal,
    closeQuizModal,
    onCorrectAnswer,
    handleAnswerSubmit
  };
}