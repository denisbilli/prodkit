const BASE_URL = import.meta.env.VITE_API_URL;

export async function fetchUsers() {
  const response = await fetch(`${BASE_URL}/users`);
  return response.json();
}

export async function fetchSubscription() {
  const response = await fetch(`${BASE_URL}/subscription/status`);
  return response.json();
}
