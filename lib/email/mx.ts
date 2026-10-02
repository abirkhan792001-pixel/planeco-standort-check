import 'server-only';
import { promises as dns } from 'node:dns';

export async function hasMx(domain: string): Promise<'yes' | 'no' | 'unknown'> {
  try {
    const records = await dns.resolveMx(domain);
    return records.length > 0 ? 'yes' : 'no';
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    return code === 'ENOTFOUND' || code === 'ENODATA' ? 'no' : 'unknown';
  }
}
