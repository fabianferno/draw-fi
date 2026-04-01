import { NextResponse } from 'next/server';
import { getMongoDb } from '@/lib/mongodb';

const COLLECTION = 'waitlist';

function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const email = raw.trim().toLowerCase();
  if (email.length === 0 || email.length > 254) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

export async function POST(request: Request) {
  if (!process.env.MONGODB_URI?.trim() || !process.env.MONGODB_DATABASE?.trim()) {
    return NextResponse.json(
      { ok: false, error: 'Waitlist is not configured.' },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 });
  }

  const email = normalizeEmail(
    body && typeof body === 'object' && 'email' in body ? (body as { email: unknown }).email : null
  );
  if (!email) {
    return NextResponse.json({ ok: false, error: 'Enter a valid email address.' }, { status: 400 });
  }

  try {
    const db = await getMongoDb();
    const collection = db.collection(COLLECTION);

    const result = await collection.updateOne(
      { email },
      {
        $setOnInsert: {
          email,
          createdAt: new Date(),
        },
      },
      { upsert: true }
    );

    const alreadyRegistered = result.matchedCount > 0 && result.upsertedCount === 0;

    return NextResponse.json({ ok: true, alreadyRegistered });
  } catch (err) {
    console.error('[waitlist]', err);
    return NextResponse.json({ ok: false, error: 'Something went wrong. Try again later.' }, { status: 500 });
  }
}
