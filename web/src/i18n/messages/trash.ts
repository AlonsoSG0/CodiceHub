import type { DomainMessages } from "./types";

/** trash strings. Spanish here is neutral: "tú", never "vos", and no regional slang. */
export const trash: DomainMessages = {
  en: {
    "trash.heading": "Trash", "trash.description": "Deleted pages are kept here until you restore them or delete them permanently.",
    "trash.loadError": "Could not load trash: {error}", "trash.retry": "Retry loading trash", "trash.actionError": "Could not complete the trash action: {error}",
    "trash.loading": "Loading trash...", "trash.empty": "Your trash is empty.", "trash.deletedPages": "Deleted pages",
    "trash.deletedPage": "Deleted page {title}", "trash.deleted": "Deleted", "trash.originallyUnder": "Originally under {title}",
    "trash.originalParent": "Original parent {id}", "trash.workspaceRoot": "Originally at the workspace root", "trash.deletedAt": "Deleted",
    "trash.restore": "Restore", "trash.deletePermanently": "Delete permanently", "trash.deletionDateUnavailable": "Deletion date unavailable",
    "trash.confirmTitle": "Delete {title} permanently?", "trash.confirmDescription": "This permanently deletes {title} and all pages in its subtree. This action cannot be undone.",
    "trash.cancel": "Cancel",
  },
  es: {
    "trash.heading": "Papelera", "trash.description": "Las páginas eliminadas se conservan aquí hasta que las restaures o las elimines de forma permanente.",
    "trash.loadError": "No se pudo cargar la papelera: {error}", "trash.retry": "Volver a cargar la papelera", "trash.actionError": "No se pudo completar la acción de la papelera: {error}",
    "trash.loading": "Cargando papelera...", "trash.empty": "La papelera está vacía.", "trash.deletedPages": "Páginas eliminadas",
    "trash.deletedPage": "Página eliminada: {title}", "trash.deleted": "Eliminada", "trash.originallyUnder": "Ubicación original: dentro de {title}",
    "trash.originalParent": "Página superior original: {id}", "trash.workspaceRoot": "Ubicación original: nivel raíz del espacio de trabajo", "trash.deletedAt": "Eliminada",
    "trash.restore": "Restaurar", "trash.deletePermanently": "Eliminar de forma permanente", "trash.deletionDateUnavailable": "Fecha de eliminación no disponible",
    "trash.confirmTitle": "¿Eliminar «{title}» de forma permanente?", "trash.confirmDescription": "Esta acción eliminará de forma permanente «{title}» y todas las páginas que contiene. No se puede deshacer.",
    "trash.cancel": "Cancelar",
  },
};
