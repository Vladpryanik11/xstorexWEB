import { Injectable } from '@nestjs/common';
import type { Prisma } from '@xstore/db';
import {
  type AdminCategory,
  type AdminCollection,
  type CollectionItems,
  type CreateCategory,
  type CreateCollection,
  ErrorCode,
  slugify,
  type UpdateCategory,
  type UpdateCollection,
  uniqueSlug,
} from '@xstore/shared';
import { AuditService } from '../audit/audit.service.js';
import type { Actor } from '../common/actor.js';
import { DomainError } from '../common/domain-error.js';
import { isUniqueViolation } from '../common/prisma-errors.js';
import { PrismaService } from '../infra/prisma.service.js';

const notFound = (): DomainError => new DomainError(ErrorCode.NOT_FOUND, 404);
const conflict = (): DomainError => new DomainError(ErrorCode.CONFLICT, 409);
const invalid = (): DomainError => new DomainError(ErrorCode.VALIDATION, 400);

const CATEGORY_SELECT = {
  id: true,
  slug: true,
  name: true,
  icon: true,
  sort: true,
  _count: { select: { apps: true } },
} satisfies Prisma.CategorySelect;

type CategoryRow = Prisma.CategoryGetPayload<{ select: typeof CATEGORY_SELECT }>;

const COLLECTION_INCLUDE = {
  items: {
    orderBy: { position: 'asc' },
    include: { app: { select: { slug: true, name: true, status: true } } },
  },
} satisfies Prisma.CollectionInclude;

type CollectionRow = Prisma.CollectionGetPayload<{ include: typeof COLLECTION_INCLUDE }>;

const ORDER = [{ sort: 'asc' }, { id: 'asc' }] as const;

/** `ids` must be every existing id exactly once. */
function sameSet(ids: string[], existing: { id: string }[]): boolean {
  const known = new Set(existing.map((e) => e.id));
  return ids.length === known.size && ids.every((id) => known.has(id));
}

/** Admin categories and collections (spec §6.3 «подборки и категории»). */
@Injectable()
export class TaxonomyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private get db() {
    return this.prisma.client;
  }

  async categories(): Promise<AdminCategory[]> {
    const rows = await this.db.category.findMany({ orderBy: [...ORDER], select: CATEGORY_SELECT });
    return rows.map(categoryView);
  }

  async createCategory(input: CreateCategory, actor: Actor): Promise<AdminCategory> {
    const slug = await this.freeSlug(input.slug, input.name, (s) =>
      this.db.category.findUnique({ where: { slug: s } }),
    );
    const last = await this.db.category.aggregate({ _max: { sort: true } });
    const row = await this.unique(() =>
      this.db.category.create({
        data: { slug, name: input.name, icon: input.icon, sort: (last._max.sort ?? -1) + 1 },
        select: CATEGORY_SELECT,
      }),
    );
    await this.record(actor, 'category.create', 'Category', row.id, { slug, name: row.name });
    return categoryView(row);
  }

  async updateCategory(id: string, patch: UpdateCategory, actor: Actor): Promise<AdminCategory> {
    const before = await this.db.category.findUnique({ where: { id } });
    if (!before) throw notFound();
    const row = await this.unique(() =>
      this.db.category.update({ where: { id }, data: patch, select: CATEGORY_SELECT }),
    );
    await this.record(actor, 'category.update', 'Category', id, {
      from: { slug: before.slug, name: before.name, icon: before.icon },
      to: patch,
    });
    return categoryView(row);
  }

  /** Refused while any app is in the category, so no app silently loses it. */
  async deleteCategory(id: string, actor: Actor): Promise<void> {
    const row = await this.db.category.findUnique({ where: { id }, select: CATEGORY_SELECT });
    if (!row) throw notFound();
    if (row._count.apps > 0) throw conflict();
    await this.db.category.delete({ where: { id } });
    await this.record(actor, 'category.delete', 'Category', id, { slug: row.slug, name: row.name });
  }

  async orderCategories(ids: string[], actor: Actor): Promise<AdminCategory[]> {
    const existing = await this.db.category.findMany({ select: { id: true } });
    if (!sameSet(ids, existing)) throw invalid();
    await this.db.$transaction(
      ids.map((id, sort) => this.db.category.update({ where: { id }, data: { sort } })),
    );
    await this.record(actor, 'category.order', 'Category', undefined, { ids });
    return this.categories();
  }

  async collections(): Promise<AdminCollection[]> {
    const rows = await this.db.collection.findMany({
      orderBy: [...ORDER],
      include: COLLECTION_INCLUDE,
    });
    return rows.map(collectionView);
  }

  async collection(id: string): Promise<AdminCollection> {
    return collectionView(await this.findCollection(id));
  }

  async createCollection(input: CreateCollection, actor: Actor): Promise<AdminCollection> {
    const slug = await this.freeSlug(input.slug, input.title, (s) =>
      this.db.collection.findUnique({ where: { slug: s } }),
    );
    const last = await this.db.collection.aggregate({ _max: { sort: true } });
    const row = await this.unique(() =>
      this.db.collection.create({
        data: { ...input, slug, sort: (last._max.sort ?? -1) + 1 },
        include: COLLECTION_INCLUDE,
      }),
    );
    await this.record(actor, 'collection.create', 'Collection', row.id, {
      slug,
      title: row.title,
      layout: row.layout,
      source: row.source,
    });
    return collectionView(row);
  }

  async updateCollection(
    id: string,
    patch: UpdateCollection,
    actor: Actor,
  ): Promise<AdminCollection> {
    const before = await this.findCollection(id);
    const row = await this.unique(() =>
      this.db.collection.update({ where: { id }, data: patch, include: COLLECTION_INCLUDE }),
    );
    const { items: _items, ...from } = before;
    await this.record(actor, 'collection.update', 'Collection', id, { from, to: patch });
    return collectionView(row);
  }

  async deleteCollection(id: string, actor: Actor): Promise<void> {
    const row = await this.findCollection(id);
    await this.db.collection.delete({ where: { id } });
    await this.record(actor, 'collection.delete', 'Collection', id, {
      slug: row.slug,
      title: row.title,
    });
  }

  /** Replaces the items; position is the index in `items`. */
  async setItems(id: string, input: CollectionItems, actor: Actor): Promise<AdminCollection> {
    await this.findCollection(id);
    const appIds = input.items.map((i) => i.appId);
    const found = await this.db.app.count({ where: { id: { in: appIds } } });
    if (found !== appIds.length) throw invalid();
    await this.db.$transaction([
      this.db.collectionItem.deleteMany({ where: { collectionId: id } }),
      this.db.collectionItem.createMany({
        data: input.items.map((item, position) => ({
          collectionId: id,
          appId: item.appId,
          pinned: item.pinned,
          position,
        })),
      }),
    ]);
    await this.record(actor, 'collection.items', 'Collection', id, { items: input.items });
    return this.collection(id);
  }

  async orderCollections(ids: string[], actor: Actor): Promise<AdminCollection[]> {
    const existing = await this.db.collection.findMany({ select: { id: true } });
    if (!sameSet(ids, existing)) throw invalid();
    await this.db.$transaction(
      ids.map((id, sort) => this.db.collection.update({ where: { id }, data: { sort } })),
    );
    await this.record(actor, 'collection.order', 'Collection', undefined, { ids });
    return this.collections();
  }

  private async findCollection(id: string): Promise<CollectionRow> {
    const row = await this.db.collection.findUnique({ where: { id }, include: COLLECTION_INCLUDE });
    if (!row) throw notFound();
    return row;
  }

  /** An explicit slug must be free; otherwise one is made from the name. */
  private async freeSlug(
    explicit: string | undefined,
    name: string,
    lookup: (slug: string) => Promise<unknown>,
  ): Promise<string> {
    if (explicit) {
      if (await lookup(explicit)) throw conflict();
      return explicit;
    }
    return uniqueSlug(slugify(name), async (s) => (await lookup(s)) !== null);
  }

  private async unique<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (err) {
      if (isUniqueViolation(err)) throw conflict();
      throw err;
    }
  }

  private record(
    actor: Actor,
    action: string,
    entity: string,
    entityId: string | undefined,
    diff: unknown,
  ): Promise<void> {
    return this.audit.record({
      actorId: actor.userId,
      action,
      entity,
      entityId,
      diff,
      ip: actor.ip,
    });
  }
}

function categoryView(row: CategoryRow): AdminCategory {
  const { _count, ...rest } = row;
  return { ...rest, appCount: _count.apps };
}

function collectionView(row: CollectionRow): AdminCollection {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    layout: row.layout,
    source: row.source,
    sort: row.sort,
    limit: row.limit,
    onHome: row.onHome,
    items: row.items.map((i) => ({
      appId: i.appId,
      slug: i.app.slug,
      name: i.app.name,
      status: i.app.status,
      position: i.position,
      pinned: i.pinned,
    })),
  };
}
