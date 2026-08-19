/** Reactive matchMedia hook for responsive component behavior. */

import { useEffect, useState } from "react";

/** Below Tailwind's `sm` breakpoint; keep in sync with the media query in index.css. */
export const MOBILE_MEDIA_QUERY = "(max-width: 639px)";

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const media = window.matchMedia(query);
    const onChange = () => setMatches(media.matches);
    onChange();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}
