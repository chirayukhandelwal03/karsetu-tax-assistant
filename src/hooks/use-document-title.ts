import { useEffect } from "react";

/**
 * Lightweight alternative to react-helmet for per-route <title> and <meta name="description">.
 * Avoids pulling an extra dependency for the 3 static pages that need it.
 */
export function useDocumentTitle(title: string, description?: string) {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = title;

    let metaEl: HTMLMetaElement | null = null;
    let previousDescription: string | null = null;
    if (description) {
      metaEl = document.querySelector('meta[name="description"]');
      previousDescription = metaEl?.getAttribute("content") ?? null;
      if (metaEl) metaEl.setAttribute("content", description);
    }

    return () => {
      document.title = previousTitle;
      if (metaEl && previousDescription !== null) {
        metaEl.setAttribute("content", previousDescription);
      }
    };
  }, [title, description]);
}
