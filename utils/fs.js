// utils/fs.js
import { mkdir } from 'node:fs/promises';

export async function ensureDirs() {
    await mkdir('data/raw', { recursive: true });
    await mkdir('data/images', { recursive: true });
}