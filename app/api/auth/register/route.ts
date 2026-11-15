import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import dbConnect from '@/lib/db';
import User from '@/models/User';

const MAX_ADMIN_USERS = 5;

export async function POST(req: Request) {
  try {
    const { name, email, password } = await req.json();

    if (!name || !email || !password) {
      return NextResponse.json({ error: 'Name, email and password are required.' }, { status: 400 });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters.' }, { status: 400 });
    }

    await dbConnect();

    const normalizedEmail = String(email).trim().toLowerCase();
    const existing = await User.findOne({ email: normalizedEmail }).lean();
    if (existing) {
      return NextResponse.json({ error: 'An account with this email already exists.' }, { status: 409 });
    }

    const adminCount = await User.countDocuments({ role: 'admin' });
    if (adminCount >= MAX_ADMIN_USERS) {
      return NextResponse.json(
        { error: '5 admin users are already present. More admin users can\'t be added.' },
        { status: 403 }
      );
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await User.create({
      name: String(name).trim(),
      email: normalizedEmail,
      password: hashedPassword,
      role: 'admin',
    });

    return NextResponse.json({ message: 'Admin account created successfully.' }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/auth/register] Error:', err);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
