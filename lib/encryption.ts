import crypto from 'node:crypto';
const algorithm = 'aes-256-gcm';
function key() {
  const secret = process.env.ENCRYPTION_SECRET_KEY;
  if (!secret) throw new Error('ENCRYPTION_SECRET_KEY is not configured');
  if (/^[\da-f]{64}$/i.test(secret)) return Buffer.from(secret, 'hex');
  if (secret.length < 32) throw new Error('ENCRYPTION_SECRET_KEY must contain at least 32 characters');
  return crypto.createHash('sha256').update(secret).digest();
}
export function encrypt(plainText:string):string {
  const iv=crypto.randomBytes(12); const cipher=crypto.createCipheriv(algorithm,key(),iv);
  const encrypted=Buffer.concat([cipher.update(plainText,'utf8'),cipher.final()]);
  return 'v1:'+iv.toString('base64')+':'+cipher.getAuthTag().toString('base64')+':'+encrypted.toString('base64');
}
export function decrypt(value:string):string {
  const [version,iv,tag,data]=value.split(':');
  if(version!=='v1'||!iv||!tag||data===undefined) throw new Error('Stored encrypted data has an unsupported format');
  const decipher=crypto.createDecipheriv(algorithm,key(),Buffer.from(iv,'base64')); decipher.setAuthTag(Buffer.from(tag,'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data,'base64')),decipher.final()]).toString('utf8');
}
