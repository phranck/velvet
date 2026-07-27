export interface ModalDialogController {
  open: boolean;
  showModal: () => void;
  close: () => void;
}

export function syncModalDialog(
  dialog: ModalDialogController,
  shouldOpen: boolean,
): boolean {
  if (shouldOpen && !dialog.open) {
    dialog.showModal();
    return true;
  }
  if (!shouldOpen && dialog.open) dialog.close();
  return false;
}
