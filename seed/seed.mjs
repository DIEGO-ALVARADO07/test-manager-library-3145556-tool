// Demo data seeder (T-21). It only talks to the HTTP API; it never touches the database (data-model §9).
//
// Phases (see README and ADR-006):
//   base     librarian, books and members
//   past     3 loans that will be overdue + 2 loans that get returned   -> run with the API clock at -20 days
//   present  10 more loans and some returns                             -> run with the real clock
//   verify   prints the evidence of T-21
//   load     adds synthetic books up to --books=N and measures the search time (RNF-1)
//
// Usage: node seed/seed.mjs --phase=base|past|present|verify|load [--books=5000]

import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const API_URL = (process.env.API_URL ?? 'http://localhost:8000/api/v1').replace(/\/$/, '');
const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const LIBRARIAN = { username: process.env.LIBRARIAN_USERNAME ?? 'bibliotecaria', password: process.env.LIBRARIAN_PASSWORD ?? 'Demo-Biblio-2026' };

if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
  console.error('Set ADMIN_USERNAME and ADMIN_PASSWORD (see .env.example).');
  process.exit(1);
}

class ApiError extends Error {
  constructor(status, body) {
    super(`${status} ${body?.code ?? ''} ${body?.message ?? ''}`.trim());
    this.status = status;
    this.code = body?.code;
  }
}

async function call(method, path, { token, body } = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  const json = text ? JSON.parse(text) : null;
  if (!response.ok) throw new ApiError(response.status, json);
  return json;
}

const login = async (username, password) => (await call('POST', '/auth/login', { body: { username, password } })).access_token;

/** Runs a create call and treats "already exists" (409) as success so the seeder can be run again. */
async function ensure(label, fn) {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ApiError && e.status === 409) return null;
    throw new Error(`${label}: ${e.message}`);
  }
}

const isbnFor = (n) => `978${String(1000000000 + n).padStart(10, '0')}`;
const pad = (n) => String(n).padStart(2, '0');

async function listAll(path, token) {
  const items = [];
  for (let page = 1; ; page++) {
    const data = await call('GET', `${path}${path.includes('?') ? '&' : '?'}page=${page}&size=50`, { token });
    items.push(...data.items);
    if (items.length >= data.total || data.items.length === 0) return items;
  }
}

async function base(admin) {
  const categories = Object.fromEntries((await call('GET', '/categories', { token: admin })).items.map((c) => [c.name, c.id]));
  await ensure('librarian', () => call('POST', '/users', { token: admin, body: { ...LIBRARIAN, role: 'librarian' } }));

  const books = JSON.parse(await readFile(new URL('./data/books.json', import.meta.url)));
  for (const [i, b] of books.entries()) {
    await ensure(`book ${b.title}`, () =>
      call('POST', '/books', { token: admin, body: { title: b.title, author: b.author, isbn: isbnFor(i + 1), category_id: categories[b.category], total_copies: b.total_copies } }),
    );
  }
  const members = JSON.parse(await readFile(new URL('./data/members.json', import.meta.url)));
  for (const m of members) await ensure(`member ${m.full_name}`, () => call('POST', '/members', { token: admin, body: m }));
  console.log(`base: ${books.length} books, ${members.length} members, librarian "${LIBRARIAN.username}"`);
}

async function context(token) {
  const books = (await listAll('/books', token)).sort((a, b) => a.title.localeCompare(b.title));
  const members = (await listAll('/members', token)).sort((a, b) => a.document_number.localeCompare(b.document_number));
  return { books, members };
}

async function giveBack(token, loan, index = 0) {
  await call('POST', `/loans/${loan.id}/items/${loan.items[index].id}/return`, { token });
}

async function past(librarian) {
  const { books, members } = await context(librarian);
  // Members 1-3 will be overdue; members 4-5 borrow and return (history for the report).
  for (const i of [0, 1, 2]) await call('POST', '/loans', { token: librarian, body: { member_id: members[i].id, items: [{ book_id: books[i].id }] } });
  for (const i of [3, 4]) {
    const loan = await call('POST', '/loans', { token: librarian, body: { member_id: members[i].id, items: [{ book_id: books[i + 5].id }] } });
    await giveBack(librarian, loan);
  }
  console.log('past: 3 loans left to become overdue, 2 loans lent and returned');
}

async function present(librarian) {
  const { books, members } = await context(librarian);
  const lend = (member, bookIdx) => call('POST', '/loans', { token: librarian, body: { member_id: member.id, items: bookIdx.map((i) => ({ book_id: books[i].id })) } });

  // Members 4-10 have no overdue books. Ten more loans, never more than 3 books per member.
  const plan = [[3, [10, 11]], [4, [12]], [5, [13, 14, 15]], [6, [16]], [7, [17, 18]], [8, [19]], [9, [20]], [3, [21]], [4, [22]], [6, [23]]];
  const created = [];
  for (const [m, idx] of plan) created.push(await lend(members[m], idx));
  for (const loan of created.slice(0, 4)) await giveBack(librarian, loan);
  console.log(`present: ${created.length} loans, ${Math.min(4, created.length)} returns`);
}

async function verify(admin) {
  const overdue = await call('GET', '/loans/overdue?size=50', { token: admin });
  const loans = await call('GET', '/loans?size=1', { token: admin });
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10);
  const report = await call('GET', `/reports/most-borrowed?from=${from}&to=${to}`, { token: admin });
  console.log(`overdue lines: ${overdue.total} (expected 3)`);
  console.log(`loans: ${loans.total} (expected 15)`);
  console.log(`report rows ${from}..${to}: ${report.rows.length}`);
  if (overdue.total !== 3 || report.rows.length === 0) process.exitCode = 1;
}

async function load(admin, wanted) {
  const categories = (await call('GET', '/categories', { token: admin })).items;
  const current = (await call('GET', '/books?size=1', { token: admin })).total;
  for (let n = current + 1; n <= wanted; n++) {
    const category = categories[n % categories.length];
    await ensure(`load book ${n}`, () =>
      call('POST', '/books', { token: admin, body: { title: `Libro de carga ${n}`, author: `Autor ${n % 97}`, isbn: isbnFor(100000 + n), category_id: category.id, total_copies: 3 } }),
    );
    if (n % 500 === 0) console.log(`load: ${n}/${wanted}`);
  }
  const samples = [];
  for (let i = 0; i < 60; i++) {
    const started = performance.now();
    await call('GET', `/books?q=${encodeURIComponent(i % 2 ? 'carga 12' : 'Autor 4')}&size=20`, { token: admin });
    samples.push(performance.now() - started);
  }
  samples.sort((a, b) => a - b);
  const total = (await call('GET', '/books?size=1', { token: admin })).total;
  console.log(`RNF-1: ${total} books, search p95 = ${samples[Math.floor(samples.length * 0.95)].toFixed(0)} ms, max = ${samples.at(-1).toFixed(0)} ms (limit 300 ms)`);
}

const admin = await login(ADMIN_USERNAME, ADMIN_PASSWORD);
const phase = args.phase ?? 'base';
if (phase === 'base') await base(admin);
else if (phase === 'past') await past(await login(LIBRARIAN.username, LIBRARIAN.password));
else if (phase === 'present') await present(await login(LIBRARIAN.username, LIBRARIAN.password));
else if (phase === 'verify') await verify(admin);
else if (phase === 'load') await load(admin, Number(args.books ?? 5000));
else {
  console.error(`Unknown phase "${phase}".`);
  process.exit(1);
}
