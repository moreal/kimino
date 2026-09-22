import { readFile } from 'node:fs/promises';
import https from 'node:https';

/** Isolated fixture OAuth. The returned bearer stays in the test process; never log it. */
export async function followToken(origin: string, directory: string): Promise<string> {
  const actor = new URL(origin);
  const names: Record<string, string> = { 'alice.test': 'alice', 'bob.test': 'bob' };
  if (
    actor.protocol !== 'https:' ||
    actor.port !== (process.env.KIMINO_FOLLOW_PORT ?? '18447') ||
    !names[actor.hostname] ||
    actor.pathname !== '/' ||
    actor.username ||
    actor.password ||
    actor.search ||
    actor.hash
  )
    throw new Error('Unsupported isolated actor origin');
  const ca = await readFile(`${directory}/root.crt`);
  const config = await readFile(`${directory}/compose.yaml`, 'utf8');
  const block = config.match(
    new RegExp(`^  ${names[actor.hostname]}:\\n([\\s\\S]*?)(?=^  [a-z][a-z-]*:|^networks:)`, 'm'),
  );
  const line = block?.[1].match(/^    command:\s*(\[[^\n]+\])/m)?.[1];
  if (!line) throw new Error('Missing isolated bootstrap configuration');
  let command: unknown;
  try {
    command = JSON.parse(line);
  } catch {
    throw new Error('Invalid isolated bootstrap configuration');
  }
  if (!Array.isArray(command)) throw new Error('Invalid isolated bootstrap configuration');
  const password = command[command.indexOf('--pw') + 1];
  if (!command.includes('--pw') || typeof password !== 'string')
    throw new Error('Missing isolated bootstrap credential');
  const lookup: NonNullable<https.RequestOptions['lookup']> = (hostname, options, callback) => {
    if (hostname !== actor.hostname) return callback(new Error('Unexpected destination'), '', 4);
    if (options.all) return callback(null, [{ address: '127.0.0.1', family: 4 }]);
    callback(null, '127.0.0.1', 4);
  };
  const request = (path: string, body?: string): Promise<Record<string, unknown>> =>
    new Promise((resolve, reject) => {
      const headers: Record<string, string | number> = { Accept: 'application/activity+json' };
      if (body !== undefined) {
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
        headers['Content-Length'] = Buffer.byteLength(body);
      }
      const req = https.request(
        new URL(path, actor),
        {
          method: body === undefined ? 'GET' : 'POST',
          ca,
          lookup,
          headers,
          rejectUnauthorized: true,
        },
        (res) => {
          const chunks: Buffer[] = [];
          let bytes = 0;
          res.on('data', (chunk: Buffer) => {
            bytes += chunk.length;
            if (bytes > 1_048_576) {
              res.destroy();
              reject(new Error('Oversized bootstrap response'));
              return;
            }
            chunks.push(chunk);
          });
          res.on('error', () => reject(new Error('Bootstrap response interrupted')));
          res.on('end', () => {
            if (res.statusCode !== 200) {
              reject(new Error(`Bootstrap request rejected (${res.statusCode})`));
              return;
            }
            try {
              const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
              if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
              resolve(value as Record<string, unknown>);
            } catch {
              reject(new Error('Invalid bootstrap response'));
            }
          });
        },
      );
      req.setTimeout(10000, () => req.destroy(new Error('Bootstrap timeout')));
      req.on('error', () => reject(new Error('Bootstrap transport failed')));
      req.end(body);
    });
  const profile = await request('/');
  if (profile.id !== actor.href) throw new Error('Unexpected actor identity');
  const response = await request(
    '/oauth/token',
    new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: actor.href,
      client_secret: password,
    }).toString(),
  );
  if (typeof response.access_token !== 'string' || !response.access_token)
    throw new Error('Bootstrap response has no token');
  return response.access_token;
}
