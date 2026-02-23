import { Link } from "../types";

const keyFor = (email: string) => `linkly_local_links_${email.toLowerCase()}`;

export const getLocalLinks = (email: string): Link[] => {
  try {
    const raw = localStorage.getItem(keyFor(email));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const saveLocalLinks = (email: string, links: Link[]) => {
  localStorage.setItem(keyFor(email), JSON.stringify(links));
};

export const addLocalLink = (
  email: string,
  link: Pick<Link, "slug" | "long_url"> & { shortUrl?: string }
) => {
  const current = getLocalLinks(email);
  const next: Link[] = [
    {
      id: `local-${link.slug}`,
      user_id: null,
      slug: link.slug,
      long_url: link.long_url,
      clicks: 0,
      created_at: new Date().toISOString(),
      short_url: link.shortUrl,
    },
    ...current.filter((l) => l.slug !== link.slug),
  ];
  saveLocalLinks(email, next);
};

export const removeLocalLink = (email: string, linkId: string) => {
  const current = getLocalLinks(email);
  saveLocalLinks(
    email,
    current.filter((l) => l.id !== linkId)
  );
};

export const updateLocalLinkUrl = (email: string, linkId: string, longUrl: string) => {
  const current = getLocalLinks(email);
  saveLocalLinks(
    email,
    current.map((l) => (l.id === linkId ? { ...l, long_url: longUrl } : l))
  );
};

