import { isQuietAt } from '../notifications/quietHours';

/**
 * `expo-audio` is loaded lazily, and its absence is survivable.
 *
 * It is a NATIVE module: the APK built on 2026-09-15 does not contain it, and an
 * OTA update cannot add native code. A top-level import would therefore take
 * down the Home screen on every install that has not had a new binary — the
 * update would ship a crash to fix a missing sound. Required on first use
 * instead, inside a try/catch, so an old build simply stays as quiet as it is
 * today and a new one gains the tone.
 */
type AudioPlayerLike = { play: () => void; seekTo: (s: number) => void; remove: () => void };

function audioModule(): any | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('expo-audio');
  } catch {
    return null;
  }
}

/**
 * The app makes the reminder sound itself.
 *
 * 2026-09-20, Cedric: "I won't allow the notifs to be silent. They need a sound."
 *
 * A notification's sound is the operating system's to play, and there are real
 * installs where it does not: on a Chromebook, an Android app runs under ARC and
 * its notifications are drawn by ChromeOS, which has its own notification centre
 * and its own Do Not Disturb sitting above the Android channel. Nothing the app
 * sets on that channel reaches the speaker. Someone who works from home and
 * installed this on their Chromebook is not an exotic case — they are a patient
 * silently missing doses, and the app cannot tell them it is happening.
 *
 * So the channel sound stays (it is right on a phone) and this is the belt
 * beside it: while the app is running, a dose falling due plays a tone through
 * the ordinary audio path, which every platform honours. It costs nothing when
 * the OS sound already worked — the two arrive together, and a reminder heard
 * twice is a better failure than one never heard.
 *
 * What this cannot do: it needs the app to be running. A backgrounded app on a
 * phone still depends on the notification channel, which is why both exist.
 */

let player: AudioPlayerLike | null = null;
let ready = false;

/**
 * `playsInSilentMode` is deliberate: this is a medical reminder, and the person
 * who set their phone to silent has usually done it for a meeting, not to opt
 * out of their protocol. It is also the mode the notification channel's own
 * sound would have used.
 */
async function ensurePlayer(): Promise<AudioPlayerLike | null> {
  if (player) return player;
  const audio = audioModule();
  if (!audio?.createAudioPlayer) return null;
  try {
    if (!ready) {
      await audio.setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: false });
      ready = true;
    }
    player = audio.createAudioPlayer(require('../../assets/sounds/reminder.wav')) as AudioPlayerLike;
    return player;
  } catch {
    // An audio stack that will not initialise is not a reason to take down the
    // screen that called this. The notification channel is still there.
    return null;
  }
}

/**
 * Play the reminder tone once, now.
 *
 * Quiet hours are honoured for the same reason the scheduled notification
 * honours them: a sound at 03:00 that the user asked not to receive is worse
 * than no sound at all. `force` is for the Settings test, where the user asked
 * for it explicitly and a silent test would be the bug.
 */
export async function playReminderTone(opts: { force?: boolean } = {}): Promise<boolean> {
  if (!opts.force && (await isQuietAt(new Date()))) return false;
  const p = await ensurePlayer();
  if (!p) return false;
  try {
    p.seekTo(0);
    p.play();
    return true;
  } catch {
    return false;
  }
}

/** Release the audio resource — called when the app goes to the background. */
export function releaseReminderTone(): void {
  try {
    player?.remove();
  } catch {
    // Nothing to do: the process is going away or the player was never created.
  }
  player = null;
}
