import { pgTable, varchar, integer, serial, timestamp, uniqueIndex, text } from 'drizzle-orm/pg-core';

export const reviews = pgTable('gatimitra_reviews', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  email: varchar('email', { length: 255 }).notNull(),
  stars: integer('stars').notNull(),
  review: varchar('review', { length: 2000 }).notNull(),
  created_at: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
  response_by: varchar('response_by', { length: 100 }),
  response_message: varchar('response_message', { length: 2000 }),
  is_read: integer('is_read').default(false), // Added is_read field with default value false
}, (table) => {
  return {
    emailIdx: uniqueIndex('email_idx').on(table.email),
  };
});

export const registrations = pgTable('gatimitra_registrations', {
  id: serial('id').primaryKey(),
  rider_name: varchar('rider_name', { length: 255 }).notNull(),
  phone: varchar('phone', { length: 50 }).notNull(),
  email: varchar('email', { length: 255 }).notNull(),
  location: varchar('location', { length: 500 }).notNull(),
  city: varchar('city', { length: 255 }).notNull(),
  message: text('message'),
  created_at: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
  status: varchar('status', { length: 50 }).default('pending').notNull(),
});

export const jobListings = pgTable('job_listings', {
  id: serial('id').primaryKey(),
  role: varchar('role', { length: 255 }).notNull(),
  location: varchar('location', { length: 255 }),
  experience: varchar('experience', { length: 255 }),
  salary: varchar('salary', { length: 255 }),
  category: varchar('category', { length: 255 }),
  description: text('description'),
  requirements: text('requirements'),
  responsibilities: text('responsibilities'),
  status: varchar('status', { length: 50 }).default('Open'),
  close_reason: text('close_reason'),
  closed_at: timestamp('closed_at', { mode: 'date', withTimezone: true }),
  created_at: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
});

export const jobApplications = pgTable('job_applications', {
  id: serial('id').primaryKey(),
  job_id: integer('job_id').notNull(),
  full_name: text('full_name').notNull(),
  email: text('email').notNull(),
  phone: text('phone').notNull(),
  city: text('city'),
  state: text('state'),
  experience_years: text('experience_years'),
  current_company: text('current_company'),
  expected_salary: text('expected_salary'),
  notice_period: text('notice_period'),
  portfolio_url: text('portfolio_url'),
  linkedin_url: text('linkedin_url'),
  github_url: text('github_url'),
  resume_url: text('resume_url'),
  cover_letter: text('cover_letter'),
  application_status: text('application_status').default('Applied'),
  admin_notes: text('admin_notes'),
  applied_at: timestamp('applied_at', { mode: 'date', withTimezone: true }).defaultNow(),
  updated_at: timestamp('updated_at', { mode: 'date', withTimezone: true }).defaultNow(),
});
