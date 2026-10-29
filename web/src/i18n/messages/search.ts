import type { DomainMessages } from "./types";

/** search strings. Spanish here is neutral: "tú", never "vos", and no regional slang. */
export const search: DomainMessages = {
  en: {
    "search.pages": "Search pages", "search.search": "Search", "search.close": "Close", "search.placeholder": "Search titles and notes...",
    "search.typeToSearch": "Type to search your pages.", "search.searching": "Searching...", "search.noResults": "No results found for “{query}”.",
    "search.unavailable": "Search is unavailable. Try again.", "search.results": "Search results", "search.shortcutMac": "⌘K", "search.shortcutControl": "Ctrl K",
    "search.keyboardHelp": "Use the arrow keys to move, Enter to open, or Esc to close.",
  },
  es: {
    "search.pages": "Buscar páginas", "search.search": "Buscar", "search.close": "Cerrar", "search.placeholder": "Buscar títulos y notas...",
    "search.typeToSearch": "Escribe para buscar en tus páginas.", "search.searching": "Buscando...", "search.noResults": "No se encontraron resultados para «{query}».",
    "search.unavailable": "La búsqueda no está disponible. Inténtalo de nuevo.", "search.results": "Resultados de búsqueda", "search.shortcutMac": "⌘K", "search.shortcutControl": "Ctrl K",
    "search.keyboardHelp": "Usa las flechas para moverte, Enter para abrir o Esc para cerrar.",
  },
};
