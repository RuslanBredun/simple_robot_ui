export async function api(path, options) {
  const response = await fetch(`/api/${path}`, { cache: 'no-store', ...options });
  const data = await response.json();
  if (response.status === 401 && !path.startsWith('auth/')) {
    window.dispatchEvent(new Event('turret-auth-expired'));
  }
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}
