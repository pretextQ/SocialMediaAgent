export function createDragHandlers(
  onReorder: (fromId: string, toId: string, position: 'before' | 'after') => void
) {
  let draggedId: string | null = null;

  function handleDragStart(e: DragEvent, tabId: string) {
    draggedId = tabId;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', tabId);
    }
    const el = e.target as HTMLElement;
    el.style.opacity = '0.4';
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move';
    }
  }

  function handleDrop(e: DragEvent, targetId: string) {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) return;

    const targetEl = e.target as HTMLElement;
    const rect = targetEl.getBoundingClientRect();
    const position = e.clientX < rect.left + rect.width / 2 ? 'before' : 'after';

    onReorder(draggedId, targetId, position);
  }

  function handleDragEnd(e: DragEvent) {
    const el = e.target as HTMLElement;
    el.style.opacity = '1';
    draggedId = null;
  }

  return { handleDragStart, handleDragOver, handleDrop, handleDragEnd };
}
