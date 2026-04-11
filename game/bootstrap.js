export function createBootstrapController({
  initAudio,
  submitAnswerBtn,
  handleAnswerSubmit,
  newQuestionBtn,
  game,
  isMultiplayer,
  isMyTurn,
  setMessage,
  adjustScore,
  playTone,
  openQuizModal,
  answerInputEl,
  restartButton,
  restartHole,
  nextButton,
  nextHole,
  canvas,
  startDrag,
  moveDrag,
  endDrag,
  updateCanvasViewport,
  initMultiplayerController,
  initCategoryFromUrl,
  frame
}) {
  function bindUiEvents() {
    submitAnswerBtn.addEventListener('click', handleAnswerSubmit);

    newQuestionBtn.addEventListener('click', () => {
      initAudio();

      if (!game.selectedCategory) return;
      if (isMultiplayer() && !isMyTurn()) {
        setMessage('Сейчас ход соперника.');
        return;
      }
      adjustScore(-1 * game.selectedCategory.difficulty);
      playTone({ freq: 310, duration: 0.08, type: 'triangle', gain: 0.04 });
      game.currentQuestion = null;
      openQuizModal('Новый вопрос.');
    });

    answerInputEl.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') handleAnswerSubmit();
    });

    restartButton.addEventListener('click', restartHole);
    nextButton.addEventListener('click', nextHole);

    canvas.addEventListener('pointerdown', startDrag);
    canvas.addEventListener('pointermove', moveDrag);
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);

    window.addEventListener('pointerdown', initAudio, { once: true });
    window.addEventListener('keydown', initAudio, { once: true });
    window.addEventListener('resize', updateCanvasViewport);
    window.addEventListener('orientationchange', updateCanvasViewport);
  }

  async function initGame() {
    initMultiplayerController();
    updateCanvasViewport();
    const ok = await initCategoryFromUrl();
    if (ok) {
      requestAnimationFrame(frame);
    }
  }

  return {
    bindUiEvents,
    initGame
  };
}