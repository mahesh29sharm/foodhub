import 'react-native-url-polyfill/auto';
import {
  createClient,
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
  SupabaseClient,
} from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { errorMessage } from './errors';

const url = (process.env.EXPO_PUBLIC_SUPABASE_URL || '').trim();
const key = (process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '').trim();
const isBrowser = typeof window !== 'undefined';

export const configurationError = !url || !key || url.includes('YOUR_PROJECT') || key.includes('YOUR_KEY')
  ? 'Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, then restart Expo.'
  : null;
export const supabase: SupabaseClient | null = !configurationError
  ? createClient(url, key, {
      auth: {
        storage: isBrowser ? AsyncStorage : undefined,
        autoRefreshToken: isBrowser,
        persistSession: isBrowser,
        detectSessionInUrl: false,
      },
    })
  : null;

export async function invoke<T>(name: string, body: Record<string, unknown>): Promise<T> {
  if (!supabase) throw Error(configurationError || 'Connect Supabase before using live services');
  const { data: auth, error: authError } = await supabase.auth.getSession();
  if (authError) throw Error(`Could not validate your session: ${authError.message}`);
  if (!auth.session?.access_token) throw Error('Sign in again before updating this order');
  const { data, error } = await supabase.functions.invoke(name, {
    body,
    headers: { Authorization: `Bearer ${auth.session.access_token}` },
  });
  if (error instanceof FunctionsHttpError) {
    let detail = '';
    try {
      const response = error.context.clone();
      const payload: unknown = await response.json();
      detail = errorMessage(payload, '');
    } catch {
      try {
        detail = errorMessage(await error.context.text(), '');
      } catch {
        // The status still gives a useful fallback if the response cannot be read.
      }
    }
    throw Error(
      detail ||
        `The deployed order service returned an unreadable error (HTTP ${error.context.status}). Deploy the matching database migrations and Edge Function, then retry.`,
    );
  }
  if (error instanceof FunctionsRelayError) {
    throw Error(`Supabase could not reach ${name}. Please retry.`);
  }
  if (error instanceof FunctionsFetchError) {
    throw Error(`Network error while contacting ${name}. Check your connection and retry.`);
  }
  if (error) throw Error(errorMessage(error, `Could not complete ${name}`));
  if (data?.error) throw Error(errorMessage(data.error, `Could not complete ${name}`));
  return data as T;
}
