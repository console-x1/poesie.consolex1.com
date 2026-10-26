import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export type Author = {
  slug: string;
  name: string;
  description: string;
  avatar: string;
};

export type Poem = {
  slug: string;
  legacySlug?: string;
  date: string;
  title: string;
  text: string;
  year: string;
  author: string;
  collection: string;
};

export type Collection = {
  name: string;
  poems: Poem[];
};

const contentDirectory = join(process.cwd(), 'content');

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function getAuthors(): Author[] {
  return readdirSync(contentDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const slug = entry.name;
      const profilePath = join(contentDirectory, slug, 'profile.json');

      if (!existsSync(profilePath)) {
        throw new Error(`Profil manquant : ${profilePath}`);
      }

      const profile: unknown = JSON.parse(readFileSync(profilePath, 'utf8'));

      if (
        typeof profile !== 'object' ||
        profile === null ||
        !('name' in profile) ||
        !isNonEmptyString(profile.name) ||
        !('description' in profile) ||
        !isNonEmptyString(profile.description) ||
        !('avatar' in profile) ||
        !isNonEmptyString(profile.avatar) ||
        !profile.avatar.startsWith('/')
      ) {
        throw new Error(
          `Profil invalide : ${profilePath}. Les champs name, description et avatar (chemin public commençant par /) sont requis.`,
        );
      }

      return {
        slug,
        name: profile.name.trim(),
        description: profile.description.trim(),
        avatar: profile.avatar.trim(),
      };
    })
    .sort((first, second) => first.name.localeCompare(second.name, 'fr'));
}

export function getPoemCount(author: Author): number {
  return readCollections(author).reduce(
    (total, collection) => total + collection.poems.length,
    0,
  );
}

export function getCollections(author: Author): Collection[] {
  return readCollections(author);
}

export function getAuthorPoems(author: Author): Poem[] {
  return getCollections(author).flatMap((collection) => collection.poems);
}

export function findAuthorPoem(author: Author, slug: string): Poem | undefined {
  const normalizedSlug = slugify(decodeURIComponent(slug));

  return getAuthorPoems(author).find(
    (poem) =>
      poem.slug === normalizedSlug ||
      poem.legacySlug === slug ||
      poem.legacySlug === normalizedSlug,
  );
}

function readCollections(author: Author): Collection[] {
  const authorDirectory = join(contentDirectory, author.slug);
  const poemsDirectory = join(authorDirectory, 'poesies');

  if (!existsSync(poemsDirectory)) {
    return [];
  }

  const collectionNames = readdirSync(poemsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  const orderPath = join(authorDirectory, 'ordre-recueils.json');
  const collectionOrder = existsSync(orderPath)
    ? JSON.parse(readFileSync(orderPath, 'utf8'))
    : [];

  if (
    !Array.isArray(collectionOrder) ||
    collectionOrder.some((name: unknown) => !isNonEmptyString(name)) ||
    new Set(collectionOrder).size !== collectionOrder.length
  ) {
    throw new Error(
      `Ordre des recueils invalide : ${orderPath}. Le fichier doit contenir une liste JSON de noms de dossiers sans doublons.`,
    );
  }

  const orderedNames = [
    ...collectionOrder.filter((name: string) => collectionNames.includes(name)),
    ...collectionNames
      .filter((name) => !collectionOrder.includes(name))
      .sort((first, second) => first.localeCompare(second, 'fr')),
  ];

  const collections = orderedNames.map((name) => {
    const directory = join(poemsDirectory, name);
    const poems = readdirSync(directory)
      .filter((filename) => filename.toLowerCase().endsWith('.txt'))
      .sort((first, second) => second.localeCompare(first, 'fr'))
      .map((filename) => readPoem(join(directory, filename), filename, name));

    return { name, poems };
  }).filter((collection) => collection.poems.length > 0);

  const poems = collections.flatMap((collection) => collection.poems);
  const slugCounts = new Map<string, number>();

  for (const poem of poems) {
    slugCounts.set(poem.slug, (slugCounts.get(poem.slug) ?? 0) + 1);
  }

  const reservedSlugs = new Set(poems.map((poem) => poem.slug));
  const assignedSlugs = new Set<string>();

  for (const poem of poems) {
    if ((slugCounts.get(poem.slug) ?? 0) === 1) {
      assignedSlugs.add(poem.slug);
      continue;
    }

    delete poem.legacySlug;
    const baseSlug = poem.slug;
    const collectionSlug = slugify(poem.collection);
    let candidate = `${baseSlug}-${poem.date}`;

    if (reservedSlugs.has(candidate) || assignedSlugs.has(candidate)) {
      candidate = `${candidate}-${collectionSlug}`;
    }

    let suffix = 2;
    while (reservedSlugs.has(candidate) || assignedSlugs.has(candidate)) {
      candidate = `${baseSlug}-${poem.date}-${collectionSlug}-${suffix}`;
      suffix += 1;
    }

    poem.slug = candidate;
    assignedSlugs.add(candidate);
  }

  return collections;
}

function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr-FR')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function readPoem(path: string, filename: string, collection: string): Poem {
  const match = filename.match(/^(\d{4}-\d{2}-\d{2})_(.+)\.txt$/i);

  if (!match) {
    throw new Error(
      `Nom de fichier invalide : ${filename}. Format attendu : YYYY-MM-DD_Nom-du-poeme.txt`,
    );
  }

  const [, date, filenameSlug] = match;
  const [yearNumber, monthNumber, dayNumber] = date.split('-').map(Number);
  const parsedDate = new Date(Date.UTC(yearNumber, monthNumber - 1, dayNumber));

  if (
    parsedDate.getUTCFullYear() !== yearNumber ||
    parsedDate.getUTCMonth() !== monthNumber - 1 ||
    parsedDate.getUTCDate() !== dayNumber
  ) {
    throw new Error(`Date invalide dans le nom du fichier : ${filename}`);
  }

  const lines = readFileSync(path, 'utf8')
    .replace(/^\uFEFF/, '')
    .trimEnd()
    .split(/\r?\n/);
  const metadataStart = lines.length - 2;
  const title = lines[0]?.trim();
  const metadata = lines.slice(metadataStart).map((line) => line.trim());
  const yearIndex = metadata.findIndex((line) => /^\d{4}$/.test(line));
  const year = metadata[yearIndex];
  const author = metadata[1 - yearIndex];

  if (
    !title ||
    metadataStart < 2 ||
    lines[metadataStart - 1]?.trim() !== '' ||
    yearIndex === -1 ||
    !author
  ) {
    throw new Error(
      `Poésie invalide dans ${filename}. La première ligne doit contenir le titre ; termine le fichier par une ligne vide, l'année et le nom d'auteur, chacun sur sa propre ligne.`,
    );
  }

  const slug = slugify(filenameSlug);
  const legacySlug = filenameSlug.toLocaleLowerCase('fr-FR');

  return {
    slug,
    ...(legacySlug !== slug ? { legacySlug } : {}),
    date,
    title,
    text: lines.slice(1, metadataStart - 1).join('\n').replace(/^\n+/, '').trimEnd(),
    year,
    author,
    collection,
  };
}

export function formatDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number);

  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}
