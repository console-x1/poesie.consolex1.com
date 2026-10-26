import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SiteFooter, SiteHeader } from '@/components/SiteChrome';
import {
  findAuthorPoem,
  formatDate,
  getAuthors,
  getAuthorPoems,
} from '@/lib/content';

type PoemPageProps = {
  params: {
    author: string;
    poem: string;
  };
};

function createPoemDescription(text: string): string {
  const normalizedText = text.replace(/\s+/g, ' ').trim();

  if (normalizedText.length <= 160) {
    return normalizedText;
  }

  const firstLine = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  const firstSentence = normalizedText.match(/^.{1,155}?[.!?…](?=\s|$)/u)?.[0];
  const completeExcerpts = [firstSentence, firstLine]
    .filter(
      (excerpt): excerpt is string =>
        typeof excerpt === 'string' && excerpt.length <= 155,
    )
    .sort((first, second) => second.length - first.length);
  const excerpt = completeExcerpts[0];

  if (excerpt) {
    return `${excerpt}${normalizedText.length > excerpt.length ? ' […]' : ''}`;
  }

  const excerptWithoutPartialWord = normalizedText
    .slice(0, 155)
    .replace(/\s+\S*$/, '');
  const safeExcerpt = excerptWithoutPartialWord || normalizedText.slice(0, 155);

  return `${safeExcerpt.trimEnd()} […]`;
}

export const dynamicParams = false;

export function generateStaticParams() {
  return getAuthors().flatMap((author) =>
    getAuthorPoems(author).flatMap((poem) => [
      { author: author.slug, poem: poem.slug },
      ...(poem.legacySlug
        ? [{ author: author.slug, poem: poem.legacySlug }]
        : []),
    ]),
  );
}

export function generateMetadata({ params }: PoemPageProps): Metadata {
  const author = getAuthors().find((entry) => entry.slug === params.author);
  const poem = author ? findAuthorPoem(author, params.poem) : undefined;

  if (!author || !poem) {
    return {};
  }

  const description = createPoemDescription(poem.text);

  return {
    title: `${poem.title} — ${author.name}`,
    description: description || `${poem.title}, un poème de ${author.name}.`,
    keywords: [poem.title, author.name, poem.collection, 'poésie', 'poème'],
    alternates: {
      canonical: `/${author.slug}/${poem.slug}/`,
    },
    openGraph: {
      title: `${poem.title} — ${author.name}`,
      description: description || `${poem.title}, un poème de ${author.name}.`,
      url: `/${author.slug}/${poem.slug}/`,
      type: 'article',
      publishedTime: new Date(`${poem.date}T00:00:00.000Z`).toISOString(),
      authors: [author.name],
      images: [{ url: author.avatar, alt: author.name }],
    },
    twitter: {
      card: 'summary',
      title: `${poem.title} — ${author.name}`,
      description: description || `${poem.title}, un poème de ${author.name}.`,
      images: [author.avatar],
    },
  };
}

export default function PoemPage({ params }: PoemPageProps) {
  const author = getAuthors().find((entry) => entry.slug === params.author);
  const poem = author ? findAuthorPoem(author, params.poem) : undefined;

  if (!author || !poem) {
    notFound();
  }

  return (
    <main className="page-shell">
      <SiteHeader
        backHref={`/${author.slug}/#recueils`}
        backLabel={`Tous les textes de ${author.name}`}
      />

      <article className="single-poem" aria-labelledby="poem-title">
        <p className="eyebrow">
          <Link href={`/${author.slug}/`}>{author.name}</Link>
          <span aria-hidden="true"> / </span>
          {poem.collection}
        </p>
        <h1 id="poem-title">{poem.title}</h1>
        <p className="single-poem-date">{formatDate(poem.date)}</p>
        <div className="single-poem-divider" aria-hidden="true" />
        <p className="single-poem-text">{poem.text}</p>
        <footer className="single-poem-meta">
          <span>
            © {poem.year}{' '}
            <Link href={`/${author.slug}/`}>{poem.author}</Link>
            {' — Tous droits réservés.'}
          </span>
        </footer>
      </article>

      <SiteFooter />
    </main>
  );
}
