export function anchoredScrollTop(input: {
  stickToBottom: boolean;
  previousScrollHeight: number;
  previousScrollTop: number;
  nextScrollHeight: number;
}): number {
  if (input.stickToBottom) {
    return input.nextScrollHeight;
  }
  const next = input.nextScrollHeight - input.previousScrollHeight + input.previousScrollTop;
  if (next < 0) {
    return 0;
  }
  return next;
}
