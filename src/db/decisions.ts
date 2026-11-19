import { and, desc, eq } from 'drizzle-orm';
import type { DecisionRecord } from '../types/decision.ts';
import { db } from './index.ts';
import { decisions, decisionPlaces, users } from './schema.ts';

export interface SqlUserProfile {
  uid: string;
  email?: string | null;
  displayName?: string | null;
}

export async function getOrCreateUser(profile: SqlUserProfile) {
  try {
    const [row] = await db
      .insert(users)
      .values({
        uid: profile.uid,
        email: profile.email ?? null,
        displayName: profile.displayName ?? null,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email: profile.email ?? null,
          displayName: profile.displayName ?? null,
          updatedAt: new Date(),
        },
      })
      .returning();

    return row;
  } catch (error) {
    console.error('Database error in getOrCreateUser:', error);
    throw new Error('Failed to synchronize user account.', { cause: error });
  }
}

export async function listUserDecisionsSql(uid: string): Promise<DecisionRecord[]> {
  try {
    const [userRow] = await db
      .select()
      .from(users)
      .where(eq(users.uid, uid))
      .limit(1);

    if (!userRow) {
      return [];
    }

    const rows = await db
      .select()
      .from(decisions)
      .where(eq(decisions.userId, userRow.id))
      .orderBy(desc(decisions.updatedAt));

    return rows
      .map((row) => row.payload as DecisionRecord)
      .filter((item): item is DecisionRecord => Boolean(item && item.id && item.title));
  } catch (error) {
    console.error('Database error in listUserDecisionsSql:', error);
    throw new Error('Failed to fetch decisions.', { cause: error });
  }
}

export async function upsertDecisionSql(
  profile: SqlUserProfile,
  record: DecisionRecord,
): Promise<void> {
  try {
    const userRow = await getOrCreateUser(profile);
    const now = new Date();

    await db
      .insert(decisions)
      .values({
        id: record.id.slice(0, 128),
        userId: userRow.id,
        title: record.title.slice(0, 200),
        context: (record.context ?? '').slice(0, 2000),
        chosenOptionId: record.chosenOptionId ?? null,
        activeFramework: record.activeFramework || 'pros-cons',
        payload: record,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: decisions.id,
        set: {
          title: record.title.slice(0, 200),
          context: (record.context ?? '').slice(0, 2000),
          chosenOptionId: record.chosenOptionId ?? null,
          activeFramework: record.activeFramework || 'pros-cons',
          payload: record,
          updatedAt: now,
        },
      });

    // Synchronize pinned locations for this decision in the relational decision_places table
    await db
      .delete(decisionPlaces)
      .where(
        and(
          eq(decisionPlaces.decisionId, record.id.slice(0, 128)),
          eq(decisionPlaces.userId, userRow.id),
        ),
      );

    const pinned = Array.isArray(record.pinnedPlaces) ? record.pinnedPlaces.slice(0, 20) : [];
    if (pinned.length > 0) {
      await db.insert(decisionPlaces).values(
        pinned.map((place) => ({
          decisionId: record.id.slice(0, 128),
          userId: userRow.id,
          optionId: place.optionId ?? null,
          placeId: place.placeId ?? null,
          name: place.name.slice(0, 200),
          address: (place.address ?? '').slice(0, 300),
          lat: place.lat,
          lng: place.lng,
          notes: (place.notes ?? '').slice(0, 500),
        })),
      );
    }
  } catch (error) {
    console.error('Database error in upsertDecisionSql:', error);
    throw new Error('Failed to save decision.', { cause: error });
  }
}

export async function deleteDecisionSql(
  uid: string,
  decisionId: string,
): Promise<void> {
  try {
    const [userRow] = await db
      .select()
      .from(users)
      .where(eq(users.uid, uid))
      .limit(1);

    if (!userRow) return;

    await db
      .delete(decisions)
      .where(
        and(
          eq(decisions.id, decisionId.slice(0, 128)),
          eq(decisions.userId, userRow.id),
        ),
      );
  } catch (error) {
    console.error('Database error in deleteDecisionSql:', error);
    throw new Error('Failed to delete decision.', { cause: error });
  }
}
