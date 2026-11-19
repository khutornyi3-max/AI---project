import { relations } from 'drizzle-orm';
import {
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email'),
  displayName: text('display_name'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const decisions = pgTable('decisions', {
  id: text('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  context: text('context').notNull().default(''),
  chosenOptionId: text('chosen_option_id'),
  activeFramework: text('active_framework').notNull().default('pros-cons'),
  payload: jsonb('payload').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const decisionPlaces = pgTable('decision_places', {
  id: serial('id').primaryKey(),
  decisionId: text('decision_id')
    .notNull()
    .references(() => decisions.id, { onDelete: 'cascade' }),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  optionId: text('option_id'),
  placeId: text('place_id'),
  name: text('name').notNull(),
  address: text('address').notNull().default(''),
  lat: doublePrecision('lat').notNull(),
  lng: doublePrecision('lng').notNull(),
  notes: text('notes').notNull().default(''),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
  decisions: many(decisions),
  places: many(decisionPlaces),
}));

export const decisionsRelations = relations(decisions, ({ one, many }) => ({
  user: one(users, {
    fields: [decisions.userId],
    references: [users.id],
  }),
  places: many(decisionPlaces),
}));

export const decisionPlacesRelations = relations(decisionPlaces, ({ one }) => ({
  decision: one(decisions, {
    fields: [decisionPlaces.decisionId],
    references: [decisions.id],
  }),
  user: one(users, {
    fields: [decisionPlaces.userId],
    references: [users.id],
  }),
}));
