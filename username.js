export function normalizeUsername(value) {
 const username=String(value).trim().toLowerCase();
 if(!/^[a-z0-9][a-z0-9_-]{2,29}$/.test(username))throw Error('Use 3–30 characters: letters, numbers, underscores or hyphens. Start with a letter or number.');
 return username;
}
export const usernameIdentity = value => `${normalizeUsername(value)}@users.time-bank.invalid`;
