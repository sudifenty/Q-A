import { AppState, AppStateStatus, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { supabase } from './supabase';
import { touchLastSeen } from './data';

/**
 * Lightweight offline usage tracking (<50KB, no images bundled).
 * - tracks minutes per topic while the app is in the foreground
 * - on background: writes {date, minutes_used, topic, is_offline} to AsyncStorage
 * - when the network returns: syncs every queued row to smartple_usage, then clears
 */
const QUEUE_KEY = 'sp_usage_queue';

let activeSince: number | null = null;
let currentTopic: string | null = null;
let online = true;

type Row = { date: string; minutes_used: number; topic: string | null; is_offline: boolean };

const today = () => new Date().toISOString().slice(0, 10);

async function queue(row: Row) {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  const q: Row[] = raw ? JSON.parse(raw) : [];
  q.push(row);
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(q));
}

export async function syncUsage(userId: string | null) {
  if (!userId || !online) return;
  // smartple_usage was dropped in the DB restructure. Instead of queueing
  // minutes forever, send a last_seen heartbeat (the teacher's Live Activity
  // reads profiles.last_seen) and drop the stale queue.
  try {
    await touchLastSeen();
    await AsyncStorage.removeItem(QUEUE_KEY);
  } catch {}
}

export function setTopic(topic: string | null) { currentTopic = topic; }

export function startUsageTracking(userId: string | null) {
  activeSince = Date.now();

  NetInfo.addEventListener(net => {
    const wasOffline = !online;
    online = !!net.isConnected;
    if (online && wasOffline) syncUsage(userId); // back online → flush the queue
  });

  AppState.addEventListener('change', async (s: AppStateStatus) => {
    const now = Date.now();
    if (s === 'background' || s === 'inactive') {
      if (activeSince) {
        const minutes = (now - activeSince) / 60000;
        if (minutes >= 0.2) await queue({ date: today(), minutes_used: Math.round(minutes * 100) / 100, topic: currentTopic, is_offline: !online });
        activeSince = null;
      }
    } else if (s === 'active') {
      activeSince = now;
      syncUsage(userId); // opportunistic sync on return
    }
  });

  // flush on a timer too, so long sessions sync even if never backgrounded
  setInterval(() => syncUsage(userId), 5 * 60 * 1000);
  syncUsage(userId);
}
