export const rerenderPreservingInputSelection = (input, render, getNextInput) => {
  const selectionStart = input?.selectionStart;
  const selectionEnd = input?.selectionEnd;
  const selectionDirection = input?.selectionDirection;
  render();
  const nextInput = getNextInput();
  nextInput?.focus();
  if (nextInput && selectionStart !== null && selectionStart !== undefined
    && selectionEnd !== null && selectionEnd !== undefined) {
    nextInput.setSelectionRange(selectionStart, selectionEnd, selectionDirection || "none");
  }
};
